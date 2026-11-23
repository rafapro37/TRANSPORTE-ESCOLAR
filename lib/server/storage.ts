import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { RowDataPacket } from 'mysql2';
import type {
  AuditLogEntry,
  BackupMetadata,
  InstallationDatabase,
  InstallationId,
  UserRole,
} from '@/lib/domain/types';
import {
  INSTALLATION_LABELS,
  createInitialDatabase,
  isValidInstallationId,
  sanitizeAuditSummary,
  validateBackupCompatibility,
} from '@/lib/domain/installations';
import { getTodayIsoDate, refreshTuitionStatuses } from '@/lib/domain/finance';
import { ensureSchema, getPool, isDatabaseEnabled } from '@/lib/server/db';

// =========================================================================
// CAMINHOS DO ARMAZENAMENTO LOCAL (fallback para desenvolvimento e testes)
// =========================================================================

function getBaseServerDataDir(): string {
  return process.env.ELEFANTE_DATA_DIR
    ? path.resolve(process.env.ELEFANTE_DATA_DIR)
    : path.resolve(process.cwd(), 'server-data', 'installations');
}

interface LockHolder {
  __erStorageLocks?: Map<string, Promise<unknown>>;
}

function getLockMap(): Map<string, Promise<unknown>> {
  const g = globalThis as unknown as LockHolder;
  if (!g.__erStorageLocks) {
    g.__erStorageLocks = new Map();
  }
  return g.__erStorageLocks;
}

export async function withInstallationLock<T>(
  installationId: InstallationId,
  fn: () => Promise<T>
): Promise<T> {
  if (!isValidInstallationId(installationId)) {
    throw new Error('Identificador de instalação inválido.');
  }
  const locks = getLockMap();
  const prev = locks.get(installationId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(installationId, prev.then(() => next, () => next));

  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function getInstallationDir(installationId: InstallationId): string {
  if (!isValidInstallationId(installationId)) {
    throw new Error('Instalação inválida.');
  }
  const baseDir = getBaseServerDataDir();
  const resolved = path.resolve(baseDir, installationId);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Caminho de instalação fora do limite permitido.');
  }
  return resolved;
}

function getDbFilePath(installationId: InstallationId): string {
  return path.join(getInstallationDir(installationId), 'database.json');
}

function getFilesDirPath(installationId: InstallationId): string {
  return path.join(getInstallationDir(installationId), 'files');
}

function getBackupsDirPath(installationId: InstallationId): string {
  return path.join(getInstallationDir(installationId), 'backups');
}

async function ensureInstallationDirs(installationId: InstallationId): Promise<void> {
  const base = getInstallationDir(installationId);
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(getFilesDirPath(installationId), { recursive: true });
  await fs.mkdir(getBackupsDirPath(installationId), { recursive: true });
}

async function atomicWriteFile(filePath: string, data: string | Buffer): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, filePath);
}

// =========================================================================
// BANCO DE DADOS DA INSTALAÇÃO
// =========================================================================

async function readRawDb(installationId: InstallationId): Promise<InstallationDatabase> {
  if (isDatabaseEnabled()) {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT payload FROM er_installation_state WHERE installation_id = ? LIMIT 1',
      [installationId]
    );
    if (rows.length === 0) {
      const fresh = createInitialDatabase(installationId);
      await pool.execute(
        `INSERT IGNORE INTO er_installation_state (installation_id, payload, updated_at)
         VALUES (?, ?, ?)`,
        [installationId, JSON.stringify(fresh), new Date()]
      );
      return fresh;
    }
    return JSON.parse(String(rows[0].payload)) as InstallationDatabase;
  }

  await ensureInstallationDirs(installationId);
  const dbPath = getDbFilePath(installationId);
  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(raw) as InstallationDatabase;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      const fresh = createInitialDatabase(installationId);
      await atomicWriteFile(dbPath, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    throw err;
  }
}

export async function readInstallationDb(
  installationId: InstallationId
): Promise<InstallationDatabase> {
  const parsed = await readRawDb(installationId);
  const { updated, changedCount } = refreshTuitionStatuses(parsed.tuitions, getTodayIsoDate());
  if (changedCount > 0) {
    parsed.tuitions = updated;
    parsed.updatedAt = new Date().toISOString();
    await writeInstallationDb(installationId, parsed);
  }
  return parsed;
}

export async function writeInstallationDb(
  installationId: InstallationId,
  db: InstallationDatabase
): Promise<void> {
  const updated: InstallationDatabase = {
    ...db,
    installationId,
    updatedAt: new Date().toISOString(),
  };

  if (isDatabaseEnabled()) {
    await ensureSchema();
    await getPool().execute(
      `INSERT INTO er_installation_state (installation_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)`,
      [installationId, JSON.stringify(updated), new Date()]
    );
    return;
  }

  await ensureInstallationDirs(installationId);
  await atomicWriteFile(getDbFilePath(installationId), JSON.stringify(updated, null, 2));
}

export function appendAuditLog(
  db: InstallationDatabase,
  params: {
    actorUserId: string;
    actorName: string;
    actorRole: UserRole;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
  }
): void {
  const entry: AuditLogEntry = {
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    summary: sanitizeAuditSummary(params.summary),
  };
  db.auditLogs = [entry, ...db.auditLogs].slice(0, 500);
}

// =========================================================================
// ARQUIVOS PRIVADOS (ISOLADOS POR INSTALAÇÃO)
// =========================================================================

const ALLOWED_FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function detectMimeByMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // PDF: %PDF-
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

function sanitizeFileId(fileId: string): string {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(fileId)) {
    throw new Error('Identificador de arquivo inválido.');
  }
  return fileId;
}

function mimeFromExtension(fileId: string): string {
  const ext = fileId.split('.').pop() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function savePrivateFile(params: {
  installationId: InstallationId;
  buffer: Buffer;
  declaredMimeType: string;
  allowPdf: boolean;
  prefix: string;
}): Promise<{ fileId: string; mimeType: string; sizeBytes: number }> {
  const { installationId, buffer, allowPdf, prefix } = params;
  if (buffer.length === 0) {
    throw new Error('O arquivo enviado está vazio.');
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('O arquivo excede o tamanho máximo permitido de 10 MB.');
  }

  const detectedMime = detectMimeByMagicBytes(buffer);
  if (!detectedMime) {
    throw new Error(
      allowPdf
        ? 'Formato de arquivo não suportado. Envie PDF, JPG, JPEG, PNG ou WEBP.'
        : 'Formato de imagem não suportado. Envie JPG, JPEG, PNG ou WEBP.'
    );
  }
  if (!allowPdf && detectedMime === 'application/pdf') {
    throw new Error('Apenas imagens (JPG, JPEG, PNG ou WEBP) são permitidas neste campo.');
  }
  if (!(detectedMime in ALLOWED_FILE_EXTENSIONS)) {
    throw new Error('Formato de arquivo não suportado.');
  }

  const ext = ALLOWED_FILE_EXTENSIONS[detectedMime];
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'arq';
  const fileId = `${safePrefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

  if (isDatabaseEnabled()) {
    await ensureSchema();
    await getPool().execute(
      `INSERT INTO er_files (installation_id, file_id, mime_type, size_bytes, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [installationId, fileId, detectedMime, buffer.length, buffer, new Date()]
    );
    return { fileId, mimeType: detectedMime, sizeBytes: buffer.length };
  }

  await ensureInstallationDirs(installationId);
  const filesDir = getFilesDirPath(installationId);
  const destPath = path.resolve(filesDir, fileId);
  if (!destPath.startsWith(filesDir + path.sep)) {
    throw new Error('Caminho de arquivo inválido.');
  }
  await atomicWriteFile(destPath, buffer);
  return { fileId, mimeType: detectedMime, sizeBytes: buffer.length };
}

export async function readPrivateFile(
  installationId: InstallationId,
  rawFileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileId: string }> {
  const fileId = sanitizeFileId(rawFileId);

  if (isDatabaseEnabled()) {
    await ensureSchema();
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT mime_type, payload FROM er_files
       WHERE installation_id = ? AND file_id = ? LIMIT 1`,
      [installationId, fileId]
    );
    if (rows.length === 0) {
      throw new Error('Arquivo não encontrado.');
    }
    return {
      buffer: Buffer.from(rows[0].payload as Buffer),
      mimeType: String(rows[0].mime_type),
      fileId,
    };
  }

  const filesDir = getFilesDirPath(installationId);
  const resolved = path.resolve(filesDir, fileId);
  if (!resolved.startsWith(filesDir + path.sep)) {
    throw new Error('Acesso ao arquivo negado.');
  }
  const buffer = await fs.readFile(resolved);
  return { buffer, mimeType: mimeFromExtension(fileId), fileId };
}

export async function deletePrivateFile(
  installationId: InstallationId,
  rawFileId: string
): Promise<void> {
  const fileId = sanitizeFileId(rawFileId);

  if (isDatabaseEnabled()) {
    await ensureSchema();
    await getPool().execute('DELETE FROM er_files WHERE installation_id = ? AND file_id = ?', [
      installationId,
      fileId,
    ]);
    return;
  }

  const filesDir = getFilesDirPath(installationId);
  const resolved = path.resolve(filesDir, fileId);
  if (!resolved.startsWith(filesDir + path.sep)) {
    throw new Error('Acesso ao arquivo negado.');
  }
  try {
    await fs.unlink(resolved);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function listPrivateFiles(
  installationId: InstallationId
): Promise<Array<{ fileId: string; buffer: Buffer }>> {
  if (isDatabaseEnabled()) {
    await ensureSchema();
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT file_id, payload FROM er_files WHERE installation_id = ? ORDER BY file_id',
      [installationId]
    );
    return rows.map((row) => ({
      fileId: String(row.file_id),
      buffer: Buffer.from(row.payload as Buffer),
    }));
  }

  const filesDir = getFilesDirPath(installationId);
  await ensureInstallationDirs(installationId);
  const entries = await fs.readdir(filesDir);
  const result: Array<{ fileId: string; buffer: Buffer }> = [];
  for (const entry of entries) {
    if (entry.endsWith('.tmp')) continue;
    const fullPath = path.resolve(filesDir, entry);
    if (!fullPath.startsWith(filesDir + path.sep)) continue;
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;
    result.push({ fileId: entry, buffer: await fs.readFile(fullPath) });
  }
  return result;
}

async function replaceAllPrivateFiles(
  installationId: InstallationId,
  files: Array<{ fileId: string; buffer: Buffer }>
): Promise<void> {
  if (isDatabaseEnabled()) {
    await ensureSchema();
    const pool = getPool();
    await pool.execute('DELETE FROM er_files WHERE installation_id = ?', [installationId]);
    for (const file of files) {
      await pool.execute(
        `INSERT INTO er_files (installation_id, file_id, mime_type, size_bytes, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          installationId,
          file.fileId,
          mimeFromExtension(file.fileId),
          file.buffer.length,
          file.buffer,
          new Date(),
        ]
      );
    }
    return;
  }

  const filesDir = getFilesDirPath(installationId);
  await ensureInstallationDirs(installationId);
  const existing = await fs.readdir(filesDir);
  for (const oldFile of existing) {
    const p = path.resolve(filesDir, oldFile);
    if (p.startsWith(filesDir + path.sep)) {
      await fs.unlink(p).catch(() => {});
    }
  }
  for (const file of files) {
    const dest = path.resolve(filesDir, file.fileId);
    if (dest.startsWith(filesDir + path.sep)) {
      await atomicWriteFile(dest, file.buffer);
    }
  }
}

// =========================================================================
// BACKUP COMPLETO E RESTAURAÇÃO (BANCO + TODOS OS ARQUIVOS PRIVADOS EM ZIP)
// =========================================================================

interface BackupManifest {
  formatVersion: number;
  backupId: string;
  installationId: InstallationId;
  installationLabel: string;
  createdAt: string;
  createdBy: string;
  type: 'manual' | 'automatico';
  databaseSha256: string;
  files: Array<{
    fileId: string;
    sha256: string;
    sizeBytes: number;
  }>;
}

const BACKUP_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB por bloco

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function storeBackupZip(
  installationId: InstallationId,
  backupId: string,
  zipBuffer: Buffer
): Promise<void> {
  if (isDatabaseEnabled()) {
    await ensureSchema();
    const pool = getPool();
    await pool.execute('DELETE FROM er_backup_chunks WHERE backup_id = ?', [backupId]);
    await pool.execute(
      `INSERT INTO er_backups (backup_id, installation_id, size_bytes, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE size_bytes = VALUES(size_bytes)`,
      [backupId, installationId, zipBuffer.length, new Date()]
    );
    for (
      let offset = 0, index = 0;
      offset < zipBuffer.length;
      offset += BACKUP_CHUNK_BYTES, index += 1
    ) {
      const chunk = zipBuffer.subarray(
        offset,
        Math.min(offset + BACKUP_CHUNK_BYTES, zipBuffer.length)
      );
      await pool.execute(
        'INSERT INTO er_backup_chunks (backup_id, chunk_index, payload) VALUES (?, ?, ?)',
        [backupId, index, chunk]
      );
    }
    return;
  }

  const backupsDir = getBackupsDirPath(installationId);
  await ensureInstallationDirs(installationId);
  const zipPath = path.resolve(backupsDir, `${backupId}.zip`);
  if (!zipPath.startsWith(backupsDir + path.sep)) {
    throw new Error('Caminho de backup inválido.');
  }
  await atomicWriteFile(zipPath, zipBuffer);
}

async function loadBackupZip(
  installationId: InstallationId,
  backupId: string
): Promise<Buffer> {
  if (isDatabaseEnabled()) {
    await ensureSchema();
    const pool = getPool();
    const [meta] = await pool.query<RowDataPacket[]>(
      'SELECT backup_id FROM er_backups WHERE backup_id = ? AND installation_id = ? LIMIT 1',
      [backupId, installationId]
    );
    if (meta.length === 0) {
      throw new Error('Arquivo de backup não encontrado nesta instalação.');
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT payload FROM er_backup_chunks WHERE backup_id = ? ORDER BY chunk_index',
      [backupId]
    );
    if (rows.length === 0) {
      throw new Error('Arquivo de backup não encontrado nesta instalação.');
    }
    return Buffer.concat(rows.map((row) => Buffer.from(row.payload as Buffer)));
  }

  const backupsDir = getBackupsDirPath(installationId);
  const zipPath = path.resolve(backupsDir, `${backupId}.zip`);
  if (!zipPath.startsWith(backupsDir + path.sep)) {
    throw new Error('Caminho de backup inválido.');
  }
  return fs.readFile(zipPath);
}

async function pruneStoredBackups(
  installationId: InstallationId,
  keepIds: string[]
): Promise<void> {
  if (!isDatabaseEnabled()) return;
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT backup_id FROM er_backups WHERE installation_id = ?',
    [installationId]
  );
  for (const row of rows) {
    const id = String(row.backup_id);
    if (keepIds.includes(id)) continue;
    await pool.execute('DELETE FROM er_backup_chunks WHERE backup_id = ?', [id]);
    await pool.execute('DELETE FROM er_backups WHERE backup_id = ?', [id]);
  }
}

export async function createInstallationBackup(params: {
  installationId: InstallationId;
  createdBy: string;
  type: 'manual' | 'automatico';
  db: InstallationDatabase;
}): Promise<{ metadata: BackupMetadata; zipBuffer: Buffer }> {
  const { installationId, createdBy, type, db } = params;

  const backupId = `bkp-${installationId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const fileName = `backup-${installationId}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const createdAt = new Date().toISOString();

  const zip = new JSZip();
  const dbJson = JSON.stringify(db, null, 2);
  const databaseSha256 = sha256Hex(dbJson);
  zip.file('database.json', dbJson);

  const manifestFiles: BackupManifest['files'] = [];
  const filesFolder = zip.folder('files');
  const privateFiles = await listPrivateFiles(installationId);

  for (const file of privateFiles) {
    const safeId = sanitizeFileId(file.fileId);
    manifestFiles.push({
      fileId: safeId,
      sha256: sha256Hex(file.buffer),
      sizeBytes: file.buffer.length,
    });
    filesFolder?.file(safeId, file.buffer);
  }

  const manifest: BackupManifest = {
    formatVersion: 1,
    backupId,
    installationId,
    installationLabel: INSTALLATION_LABELS[installationId],
    createdAt,
    createdBy,
    type,
    databaseSha256,
    files: manifestFiles,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  await storeBackupZip(installationId, backupId, zipBuffer);

  const metadata: BackupMetadata = {
    id: backupId,
    installationId,
    installationLabel: INSTALLATION_LABELS[installationId],
    createdAt,
    createdBy,
    type,
    fileName,
    sizeBytes: zipBuffer.length,
    sha256: sha256Hex(zipBuffer),
    counts: {
      users: db.users.length,
      schools: db.schools.length,
      guardians: db.guardians.length,
      children: db.children.length,
      vehicles: db.vehicles.length,
      tuitions: db.tuitions.length,
      files: manifestFiles.length,
    },
  };

  db.backups = [metadata, ...db.backups].slice(0, 50);
  if (type === 'automatico') {
    db.settings.lastAutoBackupAt = createdAt;
  }

  await pruneStoredBackups(
    installationId,
    db.backups.map((b) => b.id)
  );

  return { metadata, zipBuffer };
}

export async function readBackupZipFile(
  installationId: InstallationId,
  backupId: string
): Promise<{ buffer: Buffer; metadata: BackupMetadata }> {
  if (!/^bkp-[a-z0-9-]+$/.test(backupId)) {
    throw new Error('Identificador de backup inválido.');
  }
  const db = await readInstallationDb(installationId);
  const metadata = db.backups.find((b) => b.id === backupId);
  if (!metadata) {
    throw new Error('Backup não encontrado nesta instalação.');
  }
  const buffer = await loadBackupZip(installationId, backupId);
  return { buffer, metadata };
}

export async function restoreInstallationFromZip(params: {
  targetInstallationId: InstallationId;
  zipBuffer: Buffer;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  allowCrossInstallationOverride: boolean;
}): Promise<{
  restoredCounts: BackupMetadata['counts'];
  sourceInstallationId: InstallationId;
}> {
  const {
    targetInstallationId,
    zipBuffer,
    actorUserId,
    actorName,
    actorRole,
    allowCrossInstallationOverride,
  } = params;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new Error('Arquivo de backup inválido ou corrompido (ZIP ilegível).');
  }

  const manifestFile = zip.file('manifest.json');
  const dbFile = zip.file('database.json');
  if (!manifestFile || !dbFile) {
    throw new Error('Arquivo de backup incompleto: manifest.json ou database.json ausente.');
  }

  const manifestText = await manifestFile.async('string');
  const dbText = await dbFile.async('string');
  const manifest = JSON.parse(manifestText) as BackupManifest;

  if (sha256Hex(dbText) !== manifest.databaseSha256) {
    throw new Error(
      'Falha na verificação de integridade (SHA-256) do banco de dados no arquivo de backup.'
    );
  }

  const compatibility = validateBackupCompatibility({
    backupInstallationId: manifest.installationId,
    targetInstallationId,
    allowCrossInstallationOverride,
    userRole: actorRole,
  });
  if (!compatibility.allowed) {
    throw new Error(compatibility.reason || 'Backup incompatível com esta instalação.');
  }

  // Verifica cada arquivo antes de alterar qualquer dado
  const verifiedFiles: Array<{ fileId: string; buffer: Buffer }> = [];
  for (const fileMeta of manifest.files) {
    const safeId = sanitizeFileId(fileMeta.fileId);
    const entry = zip.file(`files/${safeId}`);
    if (!entry) {
      throw new Error(`Arquivo ausente no pacote de backup: ${safeId}`);
    }
    const buf = await entry.async('nodebuffer');
    if (sha256Hex(buf) !== fileMeta.sha256) {
      throw new Error(`Falha de integridade no arquivo anexado: ${safeId}`);
    }
    verifiedFiles.push({ fileId: safeId, buffer: buf });
  }

  const restoredDb = JSON.parse(dbText) as InstallationDatabase;
  if (!restoredDb || !Array.isArray(restoredDb.users) || !Array.isArray(restoredDb.children)) {
    throw new Error('Estrutura de dados inválida no arquivo de backup.');
  }

  restoredDb.installationId = targetInstallationId;
  restoredDb.settings.installationId = targetInstallationId;
  restoredDb.settings.installationName = INSTALLATION_LABELS[targetInstallationId];

  await replaceAllPrivateFiles(targetInstallationId, verifiedFiles);

  appendAuditLog(restoredDb, {
    actorUserId,
    actorName,
    actorRole,
    action: 'BACKUP_RESTAURADO',
    entityType: 'backup',
    entityId: manifest.backupId,
    summary: `Backup ${manifest.backupId} (${INSTALLATION_LABELS[manifest.installationId]}) restaurado com ${verifiedFiles.length} arquivo(s).`,
  });

  await writeInstallationDb(targetInstallationId, restoredDb);

  return {
    sourceInstallationId: manifest.installationId,
    restoredCounts: {
      users: restoredDb.users.length,
      schools: restoredDb.schools.length,
      guardians: restoredDb.guardians.length,
      children: restoredDb.children.length,
      vehicles: restoredDb.vehicles.length,
      tuitions: restoredDb.tuitions.length,
      files: verifiedFiles.length,
    },
  };
}

export async function maybeRunAutoBackup(
  installationId: InstallationId,
  db: InstallationDatabase
): Promise<boolean> {
  if (!db.settings.autoBackupEnabled) return false;
  const intervalMs = Math.max(1, db.settings.autoBackupIntervalHours) * 60 * 60 * 1000;
  const lastAt = db.settings.lastAutoBackupAt ? new Date(db.settings.lastAutoBackupAt).getTime() : 0;
  if (Date.now() - lastAt < intervalMs) return false;

  await createInstallationBackup({
    installationId,
    createdBy: 'Agendamento Automático',
    type: 'automatico',
    db,
  });
  return true;
}

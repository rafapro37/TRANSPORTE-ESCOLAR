import { NextRequest, NextResponse } from 'next/server';
import { requireAuthorizedContext, runAuthorizedMutation } from '@/lib/server/api-guard';
import {
  appendAuditLog,
  createInstallationBackup,
  readBackupZipFile,
  restoreInstallationFromZip,
  withInstallationLock,
  writeInstallationDb,
} from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  const auth = await requireAuthorizedContext(req, 'backup', { isMutation: false });
  if (!auth.ok) return auth.response;

  const { installationId, db } = auth.ctx;
  const downloadId = req.nextUrl.searchParams.get('download');

  if (downloadId) {
    try {
      const { buffer, metadata } = await readBackupZipFile(installationId, downloadId);
      const headers = new Headers();
      headers.set('Content-Type', 'application/zip');
      headers.set('Cache-Control', 'private, no-store');
      headers.set(
        'Content-Disposition',
        `attachment; filename="${metadata.fileName.replace(/"/g, '')}"`
      );
      return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backup não encontrado.';
      return NextResponse.json({ error: msg }, { status: 404 });
    }
  }

  return NextResponse.json({
    installationId,
    backups: db.backups,
    settings: {
      autoBackupEnabled: db.settings.autoBackupEnabled,
      autoBackupIntervalHours: db.settings.autoBackupIntervalHours,
      lastAutoBackupAt: db.settings.lastAutoBackupAt,
    },
  });
}

export async function POST(req: NextRequest) {
  return runAuthorizedMutation(req, 'backup', async ({ installationId, user, db }) => {
    const { metadata } = await createInstallationBackup({
      installationId,
      createdBy: user.name,
      type: 'manual',
      db,
    });

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'BACKUP_MANUAL_CRIADO',
      entityType: 'backup',
      entityId: metadata.id,
      summary: `Backup completo criado (${metadata.counts.children} crianças, ${metadata.counts.files} arquivo(s)).`,
    });

    return { status: 201, body: { backup: metadata, backups: db.backups } };
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuthorizedContext(req, 'backup', { isMutation: true });
  if (!auth.ok) return auth.response;

  const { installationId, user } = auth.ctx;

  const contentType = req.headers.get('content-type') ?? '';
  let zipBuffer: Buffer;
  let allowCrossInstallationOverride = false;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'Selecione o arquivo .zip do backup para restaurar.' },
          { status: 400 }
        );
      }
      allowCrossInstallationOverride = formData.get('allowOverride') === 'true';
      zipBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as { backupId?: string; allowOverride?: boolean };
      if (!body.backupId) {
        return NextResponse.json({ error: 'Informe o backup para restaurar.' }, { status: 400 });
      }
      const existing = await readBackupZipFile(installationId, body.backupId);
      zipBuffer = existing.buffer;
      allowCrossInstallationOverride = body.allowOverride === true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao ler pacote de backup.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const result = await withInstallationLock(installationId, async () => {
      // Create safety pre-restore backup first if current DB has data
      const { readInstallationDb } = await import('@/lib/server/storage');
      const currentDb = await readInstallationDb(installationId);
      if (currentDb.children.length > 0 || currentDb.guardians.length > 0) {
        await createInstallationBackup({
          installationId,
          createdBy: `${user.name} (Pré-Restauração)`,
          type: 'automatico',
          db: currentDb,
        });
        await writeInstallationDb(installationId, currentDb);
      }

      return restoreInstallationFromZip({
        targetInstallationId: installationId,
        zipBuffer,
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        allowCrossInstallationOverride,
      });
    });

    return NextResponse.json({
      ok: true,
      restoredCounts: result.restoredCounts,
      sourceInstallationId: result.sourceInstallationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao restaurar backup.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

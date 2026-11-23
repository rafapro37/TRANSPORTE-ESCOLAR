import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createInstallationBackup,
  readInstallationDb,
  readPrivateFile,
  restoreInstallationFromZip,
  savePrivateFile,
  writeInstallationDb,
} from './storage';
import { createInitialDatabase } from '../domain/installations';

test('Server storage isolates Carro 01, Carro 02, and backups with SHA-256 verification', async () => {
  const prevDir = process.env.ELEFANTE_DATA_DIR;
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elefante-rosa-storage-test-'));
  process.env.ELEFANTE_DATA_DIR = testDir;

  try {
    // Initialize clean Carro 01 and Carro 02
    const db1 = createInitialDatabase('carro-01');
    db1.guardians.push({
      id: 'g-test-1',
      fullName: 'Responsável Carro 01',
      cpf: '529.982.247-25',
      rg: '123456',
      birthDate: '1988-01-01',
      primaryPhone: '11999990001',
      whatsapp: '11999990001',
      alternativePhone: '',
      email: 'resp1@teste.com',
      cep: '01001-000',
      street: 'Rua A',
      number: '10',
      complement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      notes: '',
      documents: [],
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await writeInstallationDb('carro-01', db1);

    const db2 = createInitialDatabase('carro-02');
    await writeInstallationDb('carro-02', db2);

    const read1 = await readInstallationDb('carro-01');
    const read2 = await readInstallationDb('carro-02');
    assert.equal(read1.guardians.length, 1);
    assert.equal(read2.guardians.length, 0);

    // Save a valid PNG file privately in Carro 01
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const saved = await savePrivateFile({
      installationId: 'carro-01',
      buffer: fakePng,
      declaredMimeType: 'image/png',
      allowPdf: false,
      prefix: 'crianca',
    });
    assert.equal(saved.mimeType, 'image/png');

    // Reject invalid executable masquerading as PNG
    await assert.rejects(
      savePrivateFile({
        installationId: 'carro-01',
        buffer: Buffer.from('MZ executable payload'),
        declaredMimeType: 'image/png',
        allowPdf: false,
        prefix: 'crianca',
      })
    );

    // Create full ZIP backup of Carro 01
    const { zipBuffer } = await createInstallationBackup({
      installationId: 'carro-01',
      createdBy: 'Teste Automatizado',
      type: 'manual',
      db: read1,
    });

    // Cross-installation restore (Carro 01 -> Carro 02) MUST fail without override
    await assert.rejects(
      restoreInstallationFromZip({
        targetInstallationId: 'carro-02',
        zipBuffer,
        actorUserId: 'u1',
        actorName: 'Admin',
        actorRole: 'admin',
        allowCrossInstallationOverride: false,
      })
    );

    // Clear Carro 01 DB and restore from ZIP -> recovers guardian + private file
    await writeInstallationDb('carro-01', createInitialDatabase('carro-01'));
    const restored = await restoreInstallationFromZip({
      targetInstallationId: 'carro-01',
      zipBuffer,
      actorUserId: 'u1',
      actorName: 'Admin',
      actorRole: 'admin',
      allowCrossInstallationOverride: false,
    });
    assert.equal(restored.restoredCounts.guardians, 1);
    assert.equal(restored.restoredCounts.files, 1);

    const fileAfterRestore = await readPrivateFile('carro-01', saved.fileId);
    assert.equal(fileAfterRestore.buffer.equals(fakePng), true);
  } finally {
    if (prevDir === undefined) {
      delete process.env.ELEFANTE_DATA_DIR;
    } else {
      process.env.ELEFANTE_DATA_DIR = prevDir;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

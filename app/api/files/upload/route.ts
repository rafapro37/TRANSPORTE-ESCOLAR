import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentCategory } from '@/lib/domain/types';
import { hasRolePermission } from '@/lib/domain/installations';
import { requireAuthorizedContext } from '@/lib/server/api-guard';
import {
  appendAuditLog,
  deletePrivateFile,
  readInstallationDb,
  savePrivateFile,
  withInstallationLock,
  writeInstallationDb,
} from '@/lib/server/storage';

const VALID_DOC_CATEGORIES: DocumentCategory[] = ['rg', 'cpf', 'cnh', 'residencia', 'outros'];

export async function POST(req: NextRequest) {
  const auth = await requireAuthorizedContext(req, undefined, { isMutation: true });
  if (!auth.ok) return auth.response;

  const { installationId, user } = auth.ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Falha ao ler arquivo enviado.' }, { status: 400 });
  }

  const targetType = String(formData.get('targetType') ?? '');
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Nenhum arquivo selecionado.' }, { status: 400 });
  }

  if (targetType === 'logo' && !hasRolePermission(user.role, 'settings')) {
    return NextResponse.json({ error: 'Apenas o Administrador pode alterar a logo.' }, { status: 403 });
  }
  if (targetType === 'child_photo' && !hasRolePermission(user.role, 'children')) {
    return NextResponse.json({ error: 'Sem permissão para alterar foto da criança.' }, { status: 403 });
  }
  if (targetType === 'guardian_doc' && !hasRolePermission(user.role, 'guardians')) {
    return NextResponse.json({ error: 'Sem permissão para anexar documentos.' }, { status: 403 });
  }

  const allowPdf = targetType === 'guardian_doc';
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  try {
    const saved = await savePrivateFile({
      installationId,
      buffer,
      declaredMimeType: file.type,
      allowPdf,
      prefix:
        targetType === 'logo'
          ? 'logo'
          : targetType === 'child_photo'
            ? 'crianca'
            : 'doc',
    });

    return await withInstallationLock(installationId, async () => {
      const db = await readInstallationDb(installationId);

      if (targetType === 'logo') {
        if (db.settings.theme.logoFileId) {
          await deletePrivateFile(installationId, db.settings.theme.logoFileId);
        }
        db.settings.theme.logoFileId = saved.fileId;
        db.settings.theme.logoMimeType = saved.mimeType;

        appendAuditLog(db, {
          actorUserId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'LOGO_ATUALIZADA',
          entityType: 'settings',
          entityId: installationId,
          summary: 'Logotipo da instalação atualizado.',
        });

        await writeInstallationDb(installationId, db);
        return NextResponse.json({ fileId: saved.fileId, settings: db.settings });
      }

      if (targetType === 'child_photo') {
        const childId = String(formData.get('childId') ?? '');
        const child = db.children.find((c) => c.id === childId);
        if (!child) {
          await deletePrivateFile(installationId, saved.fileId);
          return NextResponse.json({ error: 'Criança não encontrada.' }, { status: 404 });
        }
        if (child.photoFileId) {
          await deletePrivateFile(installationId, child.photoFileId);
        }
        child.photoFileId = saved.fileId;
        child.photoMimeType = saved.mimeType;
        child.updatedAt = new Date().toISOString();
        child.history.unshift({
          id: `hist-${crypto.randomBytes(4).toString('hex')}`,
          timestamp: child.updatedAt,
          actorName: user.name,
          summary: 'Fotografia atualizada.',
        });

        appendAuditLog(db, {
          actorUserId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'FOTO_CRIANCA_ATUALIZADA',
          entityType: 'child',
          entityId: child.id,
          summary: `Fotografia de "${child.fullName}" atualizada.`,
        });

        await writeInstallationDb(installationId, db);
        return NextResponse.json({ fileId: saved.fileId, child });
      }

      if (targetType === 'guardian_doc') {
        const guardianId = String(formData.get('guardianId') ?? '');
        const category = String(formData.get('category') ?? 'outros') as DocumentCategory;
        const replaceDocId = String(formData.get('replaceDocId') ?? '');

        if (!VALID_DOC_CATEGORIES.includes(category)) {
          await deletePrivateFile(installationId, saved.fileId);
          return NextResponse.json({ error: 'Categoria de documento inválida.' }, { status: 400 });
        }
        const guardian = db.guardians.find((g) => g.id === guardianId);
        if (!guardian) {
          await deletePrivateFile(installationId, saved.fileId);
          return NextResponse.json({ error: 'Responsável não encontrado.' }, { status: 404 });
        }

        if (replaceDocId) {
          const oldDoc = guardian.documents.find((d) => d.id === replaceDocId);
          if (oldDoc) {
            await deletePrivateFile(installationId, oldDoc.fileId);
            guardian.documents = guardian.documents.filter((d) => d.id !== replaceDocId);
          }
        }

        const newDoc = {
          id: `doc-${crypto.randomBytes(5).toString('hex')}`,
          fileId: saved.fileId,
          category,
          originalName: file.name.slice(0, 120),
          mimeType: saved.mimeType,
          sizeBytes: saved.sizeBytes,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user.name,
        };
        guardian.documents.push(newDoc);
        guardian.updatedAt = new Date().toISOString();

        appendAuditLog(db, {
          actorUserId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'DOCUMENTO_ANEXADO',
          entityType: 'guardian',
          entityId: guardian.id,
          summary: `Documento (${category.toUpperCase()}) anexado para "${guardian.fullName}".`,
        });

        await writeInstallationDb(installationId, db);
        return NextResponse.json({ document: newDoc, guardian });
      }

      await deletePrivateFile(installationId, saved.fileId);
      return NextResponse.json({ error: 'Tipo de upload inválido.' }, { status: 400 });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar arquivo.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

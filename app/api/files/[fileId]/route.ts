import { NextRequest, NextResponse } from 'next/server';
import { hasRolePermission } from '@/lib/domain/installations';
import { requireAuthorizedContext } from '@/lib/server/api-guard';
import { readPrivateFile } from '@/lib/server/storage';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const auth = await requireAuthorizedContext(req, 'dashboard', { isMutation: false });
  if (!auth.ok) return auth.response;

  const { installationId, user, db } = auth.ctx;
  const { fileId } = await context.params;
  const download = req.nextUrl.searchParams.get('download') === '1';

  // Verify the file belongs to this installation's records and the user has permission
  const isLogo = db.settings.theme.logoFileId === fileId;
  const isChildPhoto = db.children.some((c) => c.photoFileId === fileId);
  const matchingGuardianDoc = db.guardians
    .flatMap((g) => g.documents)
    .find((d) => d.fileId === fileId);

  if (!isLogo && !isChildPhoto && !matchingGuardianDoc) {
    return NextResponse.json(
      { error: 'Arquivo não encontrado nesta instalação.' },
      { status: 404 }
    );
  }

  if (matchingGuardianDoc && !hasRolePermission(user.role, 'documents_sensitive')) {
    return NextResponse.json(
      { error: 'Seu perfil não possui permissão para visualizar documentos pessoais.' },
      { status: 403 }
    );
  }

  try {
    const { buffer, mimeType } = await readPrivateFile(installationId, fileId);
    const filename = matchingGuardianDoc?.originalName || fileId;
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/"/g, '')}"`
    );
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Arquivo indisponível.' }, { status: 404 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { INSTALLATION_LABELS, isValidInstallationId } from '@/lib/domain/installations';
import { readInstallationDb } from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  const installationId = req.nextUrl.searchParams.get('installationId');
  if (!isValidInstallationId(installationId)) {
    return NextResponse.json({ error: 'Instalação inválida.' }, { status: 400 });
  }

  const db = await readInstallationDb(installationId);
  return NextResponse.json({
    installationId,
    installationLabel: INSTALLATION_LABELS[installationId],
    hasUsers: db.users.length > 0,
    theme: db.settings.theme,
  });
}

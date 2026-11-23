import { NextRequest, NextResponse } from 'next/server';
import { isValidInstallationId } from '@/lib/domain/installations';
import { hashPassword, verifyCsrfProtection } from '@/lib/server/auth';
import {
  appendAuditLog,
  readInstallationDb,
  withInstallationLock,
  writeInstallationDb,
} from '@/lib/server/storage';

export async function POST(req: NextRequest) {
  if (!verifyCsrfProtection(req)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }

  let body: {
    installationId?: string;
    email?: string;
    adminEmail?: string;
    newPassword?: string;
    mode?: 'request' | 'reset_with_admin_verification';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const installationId = body.installationId;
  if (!isValidInstallationId(installationId)) {
    return NextResponse.json({ error: 'Instalação inválida.' }, { status: 400 });
  }

  const targetEmail = String(body.email ?? '').trim().toLowerCase();
  if (!targetEmail) {
    return NextResponse.json({ error: 'Informe o e-mail cadastrado.' }, { status: 400 });
  }

  if (body.mode === 'reset_with_admin_verification') {
    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'A nova senha deve ter no mínimo 6 caracteres.' },
        { status: 400 }
      );
    }

    return withInstallationLock(installationId, async () => {
      const db = await readInstallationDb(installationId);
      const user = db.users.find((u) => u.email.toLowerCase() === targetEmail);
      if (!user) {
        return NextResponse.json(
          { error: 'Não foi possível localizar este e-mail nesta instalação.' },
          { status: 404 }
        );
      }

      // Only allow self-reset if there is a single admin or admin email matches for verification,
      // otherwise require an authenticated admin inside Usuários.
      const admins = db.users.filter((u) => u.role === 'admin' && u.active);
      const adminConfirm = String(body.adminEmail ?? '').trim().toLowerCase();
      const verifiedByAdminEmail = admins.some((a) => a.email.toLowerCase() === adminConfirm);

      if (!verifiedByAdminEmail) {
        return NextResponse.json(
          {
            error:
              'Para redefinir a senha fora da sessão autenticada, informe o e-mail do Administrador da instalação para validação ou solicite a redefinição no menu Usuários.',
          },
          { status: 403 }
        );
      }

      const { salt, hash } = hashPassword(newPassword);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.updatedAt = new Date().toISOString();

      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'SENHA_REDEFINIDA',
        entityType: 'user',
        entityId: user.id,
        summary: `Senha redefinida por fluxo de recuperação para ${user.name}.`,
      });

      await writeInstallationDb(installationId, db);
      return NextResponse.json({
        ok: true,
        message: 'Senha atualizada com sucesso. Faça login com a nova senha.',
      });
    });
  }

  const db = await readInstallationDb(installationId);
  const hasAdmins = db.users.some((u) => u.role === 'admin' && u.active);
  return NextResponse.json({
    ok: true,
    hasAdmins,
    message:
      'Se o e-mail pertencer a esta instalação, você pode confirmar com o e-mail do Administrador abaixo ou solicitar a redefinição pelo painel Usuários.',
  });
}

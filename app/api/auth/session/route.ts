import { NextRequest, NextResponse } from 'next/server';
import { isValidInstallationId } from '@/lib/domain/installations';
import {
  buildClearSessionCookie,
  buildSessionSetCookie,
  extractSessionFromRequest,
  isHttpsRequest,
  signSessionToken,
  toPublicUser,
  verifyCsrfProtection,
  verifyPassword,
} from '@/lib/server/auth';
import {
  appendAuditLog,
  readInstallationDb,
  withInstallationLock,
  writeInstallationDb,
} from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  const { session, crossInstallationAttempt } = extractSessionFromRequest(req);
  if (crossInstallationAttempt) {
    return NextResponse.json(
      { error: 'Sessão vinculada a outro veículo.' },
      { status: 403 }
    );
  }
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const db = await readInstallationDb(session.installationId);
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || !user.active) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    installationId: session.installationId,
    user: toPublicUser(user),
  });
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfProtection(req)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }

  let body: { installationId?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const installationId = body.installationId;
  if (!isValidInstallationId(installationId)) {
    return NextResponse.json({ error: 'Instalação inválida.' }, { status: 400 });
  }

  const loginInput = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!loginInput || !password) {
    return NextResponse.json({ error: 'Informe e-mail/usuário e senha.' }, { status: 400 });
  }

  return withInstallationLock(installationId, async () => {
    const db = await readInstallationDb(installationId);
    const user = db.users.find(
      (u) => u.email.toLowerCase() === loginInput || u.name.toLowerCase() === loginInput
    );

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return NextResponse.json(
        { error: 'E-mail/usuário ou senha incorretos para esta instalação.' },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: 'Este usuário está bloqueado. Contate o administrador.' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    user.lastLoginAt = now;
    user.updatedAt = now;
    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LOGIN',
      entityType: 'session',
      entityId: user.id,
      summary: `Acesso realizado por ${user.name} (${user.role}).`,
    });
    await writeInstallationDb(installationId, db);

    const token = signSessionToken({
      userId: user.id,
      installationId,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json({
      authenticated: true,
      installationId,
      user: toPublicUser(user),
    });
    res.headers.set('Set-Cookie', buildSessionSetCookie(token, isHttpsRequest(req)));
    return res;
  });
}

export async function DELETE(req: NextRequest) {
  if (!verifyCsrfProtection(req)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', buildClearSessionCookie(isHttpsRequest(req)));
  return res;
}

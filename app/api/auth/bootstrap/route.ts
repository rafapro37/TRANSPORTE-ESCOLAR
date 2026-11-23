import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isValidInstallationId } from '@/lib/domain/installations';
import {
  buildSessionSetCookie,
  hashPassword,
  isHttpsRequest,
  signSessionToken,
  toPublicUser,
  verifyCsrfProtection,
} from '@/lib/server/auth';
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
    name?: string;
    email?: string;
    password?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const installationId = body.installationId;
  if (!isValidInstallationId(installationId)) {
    return NextResponse.json({ error: 'Selecione um veículo válido (Carro 01, 02 ou 03).' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (name.length < 3) {
    return NextResponse.json({ error: 'Informe o nome completo (mínimo 3 caracteres).' }, { status: 400 });
  }
  if (!email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
  }

  return withInstallationLock(installationId, async () => {
    const db = await readInstallationDb(installationId);
    if (db.users.length > 0) {
      return NextResponse.json(
        { error: 'Esta instalação já possui administrador configurado. Faça login.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { salt, hash } = hashPassword(password);
    const adminUser = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      name,
      email,
      role: 'admin' as const,
      active: true,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    db.users.push(adminUser);
    appendAuditLog(db, {
      actorUserId: adminUser.id,
      actorName: adminUser.name,
      actorRole: 'admin',
      action: 'INSTALACAO_INICIALIZADA',
      entityType: 'user',
      entityId: adminUser.id,
      summary: `Administrador inicial configurado para ${db.settings.installationName}.`,
    });

    await writeInstallationDb(installationId, db);

    const token = signSessionToken({
      userId: adminUser.id,
      installationId,
      role: adminUser.role,
      email: adminUser.email,
      name: adminUser.name,
    });

    const res = NextResponse.json(
      {
        user: toPublicUser(adminUser),
        installationId,
      },
      { status: 201 }
    );
    res.headers.set('Set-Cookie', buildSessionSetCookie(token, isHttpsRequest(req)));
    return res;
  });
}

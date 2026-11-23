import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import type { UserRole } from '@/lib/domain/types';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { hashPassword, toPublicUser } from '@/lib/server/auth';
import { appendAuditLog } from '@/lib/server/storage';

const VALID_ROLES: UserRole[] = ['admin', 'financeiro', 'operacional'];

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; password?: string; role?: UserRole };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'users', async ({ user, db }) => {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const role = (body.role ?? 'operacional') as UserRole;

    if (name.length < 3) throw new Error('Informe o nome completo (mínimo 3 caracteres).');
    if (!email.includes('@')) throw new Error('Informe um e-mail válido.');
    if (password.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres.');
    if (!VALID_ROLES.includes(role)) throw new Error('Perfil de acesso inválido.');

    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Já existe um usuário cadastrado com este e-mail nesta instalação.');
    }

    const now = new Date().toISOString();
    const { salt, hash } = hashPassword(password);
    const created = {
      id: `usr-${crypto.randomBytes(5).toString('hex')}`,
      name,
      email,
      role,
      active: true,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    db.users.push(created);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USUARIO_CRIADO',
      entityType: 'user',
      entityId: created.id,
      summary: `Usuário "${created.name}" criado com perfil ${created.role}.`,
    });

    return { status: 201, body: { user: toPublicUser(created) } };
  });
}

export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    name?: string;
    email?: string;
    role?: UserRole;
    active?: boolean;
    newPassword?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'users', async ({ user, db }) => {
    const target = db.users.find((u) => u.id === body.id);
    if (!target) throw new Error('Usuário não encontrado.');

    if (typeof body.name === 'string') {
      const next = body.name.trim();
      if (next.length < 3) throw new Error('Nome inválido.');
      target.name = next;
    }

    if (typeof body.email === 'string') {
      const nextEmail = body.email.trim().toLowerCase();
      if (!nextEmail.includes('@')) throw new Error('E-mail inválido.');
      if (db.users.some((u) => u.id !== target.id && u.email.toLowerCase() === nextEmail)) {
        throw new Error('Este e-mail já está em uso por outro usuário.');
      }
      target.email = nextEmail;
    }

    if (typeof body.role === 'string') {
      if (!VALID_ROLES.includes(body.role)) throw new Error('Perfil inválido.');
      if (target.id === user.id && body.role !== 'admin') {
        throw new Error('Você não pode rebaixar seu próprio perfil de Administrador.');
      }
      target.role = body.role;
    }

    if (typeof body.active === 'boolean') {
      if (target.id === user.id && !body.active) {
        throw new Error('Você não pode bloquear sua própria conta.');
      }
      if (!body.active && target.role === 'admin') {
        const otherActiveAdmins = db.users.filter(
          (u) => u.id !== target.id && u.role === 'admin' && u.active
        ).length;
        if (otherActiveAdmins === 0) {
          throw new Error('Deve existir ao menos um Administrador ativo na instalação.');
        }
      }
      target.active = body.active;
    }

    if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
      if (body.newPassword.length < 6) {
        throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
      }
      const { salt, hash } = hashPassword(body.newPassword);
      target.passwordSalt = salt;
      target.passwordHash = hash;
    }

    target.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USUARIO_ATUALIZADO',
      entityType: 'user',
      entityId: target.id,
      summary: `Usuário "${target.name}" atualizado (${target.role}, ${target.active ? 'Ativo' : 'Bloqueado'}).`,
    });

    return { body: { user: toPublicUser(target) } };
  });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  return runAuthorizedMutation(req, 'users', async ({ user, db }) => {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('Usuário não encontrado.');
    const target = db.users[idx];

    if (target.id === user.id) {
      throw new Error('Você não pode excluir o próprio usuário conectado.');
    }
    if (target.role === 'admin') {
      const otherAdmins = db.users.filter(
        (u) => u.id !== target.id && u.role === 'admin' && u.active
      ).length;
      if (otherAdmins === 0) {
        throw new Error('Não é possível excluir o único Administrador ativo da instalação.');
      }
    }

    db.users.splice(idx, 1);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USUARIO_EXCLUIDO',
      entityType: 'user',
      entityId: target.id,
      summary: `Usuário "${target.name}" removido da instalação.`,
    });

    return { body: { ok: true } };
  });
}

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog } from '@/lib/server/storage';

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    address?: string;
    phone?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'schools', async ({ user, db }) => {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) {
      throw new Error('Informe o nome da escola.');
    }
    const duplicate = db.schools.some(
      (s) => s.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      throw new Error('Já existe uma escola cadastrada com este nome nesta instalação.');
    }

    const now = new Date().toISOString();
    const school = {
      id: `escola-${crypto.randomBytes(4).toString('hex')}`,
      name,
      address: String(body.address ?? '').trim(),
      phone: String(body.phone ?? '').trim(),
      notes: String(body.notes ?? '').trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    db.schools.push(school);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ESCOLA_CRIADA',
      entityType: 'school',
      entityId: school.id,
      summary: `Escola "${school.name}" cadastrada.`,
    });

    return { status: 201, body: { school } };
  });
}

export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    name?: string;
    address?: string;
    phone?: string;
    notes?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'schools', async ({ user, db }) => {
    const school = db.schools.find((s) => s.id === body.id);
    if (!school) {
      throw new Error('Escola não encontrada nesta instalação.');
    }

    if (typeof body.name === 'string') {
      const nextName = body.name.trim();
      if (nextName.length < 2) {
        throw new Error('O nome da escola não pode ficar vazio.');
      }
      const duplicate = db.schools.some(
        (s) => s.id !== school.id && s.name.trim().toLowerCase() === nextName.toLowerCase()
      );
      if (duplicate) {
        throw new Error('Já existe outra escola com este nome.');
      }
      school.name = nextName;
    }

    if (typeof body.address === 'string') school.address = body.address.trim();
    if (typeof body.phone === 'string') school.phone = body.phone.trim();
    if (typeof body.notes === 'string') school.notes = body.notes.trim();
    if (typeof body.active === 'boolean') school.active = body.active;
    school.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ESCOLA_ATUALIZADA',
      entityType: 'school',
      entityId: school.id,
      summary: `Escola "${school.name}" atualizada (${school.active ? 'Ativa' : 'Inativa'}).`,
    });

    return { body: { school } };
  });
}

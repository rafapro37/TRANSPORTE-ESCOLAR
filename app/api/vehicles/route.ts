import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog } from '@/lib/server/storage';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'vehicles', async ({ user, db }) => {
    const name = String(body.name ?? '').trim();
    const capacity = Number(body.capacity ?? 15);
    if (name.length < 2) {
      throw new Error('Informe o nome do veículo.');
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      throw new Error('Informe uma capacidade válida entre 1 e 100 passageiros.');
    }

    const now = new Date().toISOString();
    const vehicle = {
      id: `veic-${crypto.randomBytes(4).toString('hex')}`,
      name,
      plate: String(body.plate ?? '').trim().toUpperCase(),
      model: String(body.model ?? '').trim(),
      year: String(body.year ?? '').trim(),
      capacity,
      driverName: String(body.driverName ?? '').trim(),
      driverPhone: String(body.driverPhone ?? '').trim(),
      helperName: String(body.helperName ?? '').trim(),
      helperPhone: String(body.helperPhone ?? '').trim(),
      notes: String(body.notes ?? '').trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    db.vehicles.push(vehicle);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'VEICULO_CADASTRADO',
      entityType: 'vehicle',
      entityId: vehicle.id,
      summary: `Veículo "${vehicle.name}" cadastrado (capacidade: ${vehicle.capacity}).`,
    });

    return { status: 201, body: { vehicle } };
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'vehicles', async ({ user, db }) => {
    const vehicle = db.vehicles.find((v) => v.id === body.id);
    if (!vehicle) {
      throw new Error('Veículo não encontrado.');
    }

    if (typeof body.name === 'string') {
      const nextName = body.name.trim();
      if (nextName.length < 2) throw new Error('Nome do veículo inválido.');
      vehicle.name = nextName;
    }

    if (typeof body.capacity === 'number') {
      const cap = Math.floor(body.capacity);
      if (!Number.isFinite(cap) || cap < 1 || cap > 100) {
        throw new Error('Capacidade inválida.');
      }
      const activePassengers = db.children.filter(
        (c) => c.active && c.vehicleId === vehicle.id
      ).length;
      if (cap < activePassengers) {
        throw new Error(
          `Não é possível reduzir a capacidade para ${cap}, pois já há ${activePassengers} criança(s) ativa(s) vinculada(s).`
        );
      }
      vehicle.capacity = cap;
    }

    if (typeof body.plate === 'string') vehicle.plate = body.plate.trim().toUpperCase();
    if (typeof body.model === 'string') vehicle.model = body.model.trim();
    if (typeof body.year === 'string') vehicle.year = body.year.trim();
    if (typeof body.driverName === 'string') vehicle.driverName = body.driverName.trim();
    if (typeof body.driverPhone === 'string') vehicle.driverPhone = body.driverPhone.trim();
    if (typeof body.helperName === 'string') vehicle.helperName = body.helperName.trim();
    if (typeof body.helperPhone === 'string') vehicle.helperPhone = body.helperPhone.trim();
    if (typeof body.notes === 'string') vehicle.notes = body.notes.trim();
    if (typeof body.active === 'boolean') vehicle.active = body.active;
    vehicle.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'VEICULO_ATUALIZADO',
      entityType: 'vehicle',
      entityId: vehicle.id,
      summary: `Veículo "${vehicle.name}" atualizado.`,
    });

    return { body: { vehicle } };
  });
}

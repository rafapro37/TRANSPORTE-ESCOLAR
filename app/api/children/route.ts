import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import type { PeriodoEscolar } from '@/lib/domain/types';
import { canAssignChildToVehicle } from '@/lib/domain/vehicles';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog, deletePrivateFile } from '@/lib/server/storage';

const VALID_PERIODS: PeriodoEscolar[] = ['manha', 'tarde', 'integral'];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'children', async ({ user, db }) => {
    const fullName = String(body.fullName ?? '').trim();
    const schoolId = String(body.schoolId ?? '');
    const guardianId = String(body.guardianId ?? '');
    const vehicleId = String(body.vehicleId ?? '');
    const period = String(body.period ?? 'manha') as PeriodoEscolar;
    const tuitionAmount = Number(body.tuitionAmount ?? db.settings.defaultTuitionAmount);
    const active = body.active !== false;

    if (fullName.length < 2) {
      throw new Error('Informe o nome completo da criança.');
    }
    const school = db.schools.find((s) => s.id === schoolId);
    if (!school) {
      throw new Error('Selecione uma escola válida.');
    }
    const guardian = db.guardians.find((g) => g.id === guardianId);
    if (!guardian) {
      throw new Error('Selecione um responsável válido.');
    }
    const vehicle = db.vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) {
      throw new Error('Selecione um veículo válido.');
    }
    if (!VALID_PERIODS.includes(period)) {
      throw new Error('Período escolar inválido.');
    }
    if (!Number.isFinite(tuitionAmount) || tuitionAmount <= 0) {
      throw new Error('Valor da mensalidade inválido.');
    }

    const capacityCheck = canAssignChildToVehicle({
      vehicle,
      children: db.children,
      childActive: active,
    });
    if (!capacityCheck.allowed) {
      throw new Error(capacityCheck.reason);
    }

    const now = new Date().toISOString();
    const child = {
      id: `cri-${crypto.randomBytes(5).toString('hex')}`,
      fullName,
      birthDate: String(body.birthDate ?? '').trim(),
      photoFileId: typeof body.photoFileId === 'string' ? body.photoFileId : null,
      photoMimeType: typeof body.photoMimeType === 'string' ? body.photoMimeType : null,
      schoolId,
      grade: String(body.grade ?? '').trim(),
      classroom: String(body.classroom ?? '').trim(),
      period,
      guardianId,
      pickupStreet: String(body.pickupStreet ?? guardian.street).trim(),
      pickupNumber: String(body.pickupNumber ?? guardian.number).trim(),
      pickupNeighborhood: String(body.pickupNeighborhood ?? guardian.neighborhood).trim(),
      pickupCity: String(body.pickupCity ?? guardian.city).trim(),
      vehicleId,
      tuitionAmount: Math.round(tuitionAmount * 100) / 100,
      startDate: String(body.startDate ?? now.slice(0, 10)).trim(),
      active,
      notes: String(body.notes ?? '').trim(),
      history: [
        {
          id: `hist-${crypto.randomBytes(4).toString('hex')}`,
          timestamp: now,
          actorName: user.name,
          summary: `Cadastro criado no veículo ${vehicle.name} (${school.name}).`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    db.children.push(child);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'CRIANCA_CADASTRADA',
      entityType: 'child',
      entityId: child.id,
      summary: `Criança "${child.fullName}" vinculada ao ${vehicle.name}.`,
    });

    return { status: 201, body: { child } };
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'children', async ({ installationId, user, db }) => {
    const child = db.children.find((c) => c.id === body.id);
    if (!child) {
      throw new Error('Criança não encontrada nesta instalação.');
    }

    const now = new Date().toISOString();

    if (body.action === 'remove_photo') {
      if (child.photoFileId) {
        await deletePrivateFile(installationId, child.photoFileId);
      }
      child.photoFileId = null;
      child.photoMimeType = null;
      child.updatedAt = now;
      child.history.unshift({
        id: `hist-${crypto.randomBytes(4).toString('hex')}`,
        timestamp: now,
        actorName: user.name,
        summary: 'Fotografia removida.',
      });
      return { body: { child } };
    }

    const nextActive = typeof body.active === 'boolean' ? body.active : child.active;
    const nextVehicleId =
      typeof body.vehicleId === 'string' ? body.vehicleId : child.vehicleId;

    const targetVehicle = db.vehicles.find((v) => v.id === nextVehicleId);
    if (!targetVehicle) {
      throw new Error('Veículo de destino não encontrado.');
    }

    const capacityCheck = canAssignChildToVehicle({
      vehicle: targetVehicle,
      children: db.children,
      childActive: nextActive,
      excludeChildId: child.id,
    });
    if (!capacityCheck.allowed) {
      throw new Error(capacityCheck.reason);
    }

    const changes: string[] = [];

    if (typeof body.fullName === 'string' && body.fullName.trim() !== child.fullName) {
      const next = body.fullName.trim();
      if (next.length < 2) throw new Error('Nome inválido.');
      child.fullName = next;
      changes.push('nome');
    }
    if (typeof body.birthDate === 'string') child.birthDate = body.birthDate.trim();
    if (typeof body.schoolId === 'string' && body.schoolId !== child.schoolId) {
      const school = db.schools.find((s) => s.id === body.schoolId);
      if (!school) throw new Error('Escola inválida.');
      child.schoolId = body.schoolId;
      changes.push(`escola (${school.name})`);
    }
    if (typeof body.grade === 'string') child.grade = body.grade.trim();
    if (typeof body.classroom === 'string') child.classroom = body.classroom.trim();
    if (typeof body.period === 'string') {
      if (!VALID_PERIODS.includes(body.period as PeriodoEscolar)) {
        throw new Error('Período inválido.');
      }
      child.period = body.period as PeriodoEscolar;
    }
    if (typeof body.guardianId === 'string' && body.guardianId !== child.guardianId) {
      const guardian = db.guardians.find((g) => g.id === body.guardianId);
      if (!guardian) throw new Error('Responsável inválido.');
      child.guardianId = body.guardianId;
      changes.push(`responsável (${guardian.fullName})`);
    }
    if (typeof body.pickupStreet === 'string') child.pickupStreet = body.pickupStreet.trim();
    if (typeof body.pickupNumber === 'string') child.pickupNumber = body.pickupNumber.trim();
    if (typeof body.pickupNeighborhood === 'string')
      child.pickupNeighborhood = body.pickupNeighborhood.trim();
    if (typeof body.pickupCity === 'string') child.pickupCity = body.pickupCity.trim();

    if (nextVehicleId !== child.vehicleId) {
      child.vehicleId = nextVehicleId;
      changes.push(`transferida para ${targetVehicle.name}`);
    }
    if (typeof body.tuitionAmount === 'number') {
      if (!Number.isFinite(body.tuitionAmount) || body.tuitionAmount <= 0) {
        throw new Error('Valor da mensalidade inválido.');
      }
      if (body.tuitionAmount !== child.tuitionAmount) {
        child.tuitionAmount = Math.round(body.tuitionAmount * 100) / 100;
        changes.push(`mensalidade para R$ ${child.tuitionAmount.toFixed(2)}`);
      }
    }
    if (typeof body.startDate === 'string') child.startDate = body.startDate.trim();
    if (typeof body.active === 'boolean' && body.active !== child.active) {
      child.active = body.active;
      changes.push(body.active ? 'ativada' : 'inativada');
    }
    if (typeof body.notes === 'string') child.notes = body.notes.trim();

    child.updatedAt = now;
    if (changes.length > 0) {
      child.history.unshift({
        id: `hist-${crypto.randomBytes(4).toString('hex')}`,
        timestamp: now,
        actorName: user.name,
        summary: `Alteração: ${changes.join(', ')}.`,
      });
    }

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'CRIANCA_ATUALIZADA',
      entityType: 'child',
      entityId: child.id,
      summary: `Cadastro de "${child.fullName}" atualizado${changes.length ? ` (${changes.join(', ')})` : ''}.`,
    });

    return { body: { child } };
  });
}

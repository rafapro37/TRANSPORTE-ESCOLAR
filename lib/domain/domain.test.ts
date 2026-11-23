import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, formatCpf, maskCpf, maskRg } from './cpf';
import {
  applyPaymentToTuition,
  computeDashboardMetrics,
  computeDueDate,
  computeTuitionStatus,
  generateMonthlyTuitionsForChildren,
} from './finance';
import { canAssignChildToVehicle, getVehicleOccupancy } from './vehicles';
import {
  createInitialDatabase,
  hasRolePermission,
  sanitizeAuditSummary,
  validateBackupCompatibility,
} from './installations';

test('CPF validation accepts valid CPFs and rejects invalid or repeated digits', () => {
  assert.equal(isValidCpf('52998224725'), true);
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('123.456.789-00'), false);
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
  assert.equal(maskCpf('52998224725'), '***.***.247-25');
  assert.equal(maskRg('12.345.678-9'), '*********8-9');
});

test('Monthly tuition generation skips inactive children, avoids duplicates, and preserves old amounts', () => {
  const now = '2026-03-01T10:00:00.000Z';
  const db = createInitialDatabase('carro-01', now);
  db.children = [
    {
      id: 'c1',
      fullName: 'Ana Clara',
      birthDate: '2018-05-10',
      photoFileId: null,
      photoMimeType: null,
      schoolId: 'escola-1',
      grade: '2º Ano',
      classroom: 'A',
      period: 'manha',
      guardianId: 'g1',
      pickupStreet: 'Rua das Flores',
      pickupNumber: '120',
      pickupNeighborhood: 'Centro',
      pickupCity: 'São Paulo',
      vehicleId: 'veiculo-01',
      tuitionAmount: 230,
      startDate: '2026-02-01',
      active: true,
      notes: '',
      history: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c2',
      fullName: 'Pedro Henrique',
      birthDate: '2017-08-22',
      photoFileId: null,
      photoMimeType: null,
      schoolId: 'escola-2',
      grade: '3º Ano',
      classroom: 'B',
      period: 'tarde',
      guardianId: 'g1',
      pickupStreet: 'Rua das Flores',
      pickupNumber: '120',
      pickupNeighborhood: 'Centro',
      pickupCity: 'São Paulo',
      vehicleId: 'veiculo-01',
      tuitionAmount: 260,
      startDate: '2026-02-01',
      active: false,
      notes: '',
      history: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const firstRun = generateMonthlyTuitionsForChildren({
    children: db.children,
    existingTuitions: db.tuitions,
    year: 2026,
    month: 3,
    todayIso: '2026-03-05',
  });
  assert.equal(firstRun.created.length, 1);
  assert.equal(firstRun.created[0].amount, 230);
  assert.equal(firstRun.created[0].dueDate, '2026-03-10');
  assert.equal(firstRun.created[0].status, 'pendente');

  const secondRun = generateMonthlyTuitionsForChildren({
    children: db.children,
    existingTuitions: firstRun.created,
    year: 2026,
    month: 3,
    todayIso: '2026-03-05',
  });
  assert.equal(secondRun.created.length, 0);
});

test('Partial and full payments update tuition status and overdue logic works after day 10', () => {
  const dueDate = computeDueDate(2026, 3, 10);
  assert.equal(dueDate, '2026-03-10');
  assert.equal(computeTuitionStatus(230, 0, dueDate, '2026-03-10'), 'pendente');
  assert.equal(computeTuitionStatus(230, 0, dueDate, '2026-03-11'), 'atrasado');

  const tuition = {
    id: 'm1',
    childId: 'c1',
    guardianId: 'g1',
    referenceYear: 2026,
    referenceMonth: 3,
    dueDate,
    amount: 230,
    paidAmount: 0,
    status: 'pendente' as const,
    payments: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  };

  const partial = applyPaymentToTuition({
    tuition,
    paymentAmount: 100,
    method: 'pix',
    paymentDate: '2026-03-08',
    recordedByUserId: 'u1',
    recordedByName: 'Admin',
    todayIso: '2026-03-08',
  });
  assert.equal(partial.updatedTuition.paidAmount, 100);
  assert.equal(partial.updatedTuition.status, 'parcial');

  const full = applyPaymentToTuition({
    tuition: partial.updatedTuition,
    paymentAmount: 130,
    method: 'dinheiro',
    paymentDate: '2026-03-09',
    recordedByUserId: 'u1',
    recordedByName: 'Admin',
    todayIso: '2026-03-15',
  });
  assert.equal(full.updatedTuition.paidAmount, 230);
  assert.equal(full.updatedTuition.status, 'pago');
});

test('Vehicle capacity enforcement blocks exceeding capacity for active children', () => {
  const db = createInitialDatabase('carro-01');
  const vehicle = { ...db.vehicles[0], capacity: 1 };
  const child1 = {
    id: 'c1',
    fullName: 'Lucas',
    birthDate: '2018-01-01',
    photoFileId: null,
    photoMimeType: null,
    schoolId: 'escola-1',
    grade: '1º Ano',
    classroom: 'A',
    period: 'manha' as const,
    guardianId: 'g1',
    pickupStreet: 'Rua A',
    pickupNumber: '1',
    pickupNeighborhood: 'Bairro',
    pickupCity: 'Cidade',
    vehicleId: vehicle.id,
    tuitionAmount: 230,
    startDate: '2026-01-01',
    active: true,
    notes: '',
    history: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const occupancy = getVehicleOccupancy(vehicle, [child1]);
  assert.equal(occupancy.ocupacao, 1);
  assert.equal(occupancy.vagasDisponiveis, 0);

  const check = canAssignChildToVehicle({
    vehicle,
    children: [child1],
    childActive: true,
  });
  assert.equal(check.allowed, false);
});

test('Installation isolation, RBAC, audit sanitization, and backup compatibility checks', () => {
  assert.equal(hasRolePermission('operacional', 'finance'), false);
  assert.equal(hasRolePermission('operacional', 'passengers'), true);
  assert.equal(hasRolePermission('financeiro', 'finance'), true);
  assert.equal(hasRolePermission('financeiro', 'users'), false);
  assert.equal(hasRolePermission('admin', 'backup'), true);

  assert.equal(
    sanitizeAuditSummary('Responsável 529.982.247-25 cadastrado'),
    'Responsável [CPF-OCULTO] cadastrado'
  );

  const mismatchBlocked = validateBackupCompatibility({
    backupInstallationId: 'carro-01',
    targetInstallationId: 'carro-02',
    allowCrossInstallationOverride: false,
    userRole: 'admin',
  });
  assert.equal(mismatchBlocked.allowed, false);

  const sameAllowed = validateBackupCompatibility({
    backupInstallationId: 'carro-01',
    targetInstallationId: 'carro-01',
    allowCrossInstallationOverride: false,
    userRole: 'admin',
  });
  assert.equal(sameAllowed.allowed, true);
});

test('Dashboard metrics compute totals and alerts accurately', () => {
  const db = createInitialDatabase('carro-01', '2026-03-01T10:00:00.000Z');
  assert.equal(db.schools.length, 6);
  const metrics = computeDashboardMetrics(db, '2026-03-15');
  assert.equal(metrics.totalSchools, 6);
  assert.equal(metrics.totalVehicles, 3);
  assert.equal(metrics.totalChildren, 0);
});

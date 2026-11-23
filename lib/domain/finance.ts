import type {
  Child,
  DashboardAlert,
  DashboardMetrics,
  Guardian,
  InstallationDatabase,
  MonthlyRevenuePoint,
  PaymentMethod,
  PaymentRecord,
  TuitionRecord,
  TuitionStatus,
} from './types';

export const DEFAULT_TUITION_AMOUNT = 230;
export const DEFAULT_DUE_DAY = 10;

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function formatMonthYearLabel(month: number, year: number): string {
  const m = MONTH_NAMES_SHORT[Math.max(0, Math.min(11, month - 1))] ?? String(month);
  return `${m}/${year}`;
}

export function computeDueDate(year: number, month: number, dueDay: number = DEFAULT_DUE_DAY): string {
  const safeDay = Math.max(1, Math.min(28, Math.floor(dueDay)));
  const mm = String(month).padStart(2, '0');
  const dd = String(safeDay).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function getTodayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeTuitionStatus(
  amount: number,
  paidAmount: number,
  dueDate: string,
  todayIso: string = getTodayIsoDate()
): TuitionStatus {
  const remaining = Math.round((amount - paidAmount) * 100) / 100;
  if (remaining <= 0) return 'pago';
  if (todayIso > dueDate) return 'atrasado';
  if (paidAmount > 0) return 'parcial';
  return 'pendente';
}

export function refreshTuitionStatuses(
  tuitions: TuitionRecord[],
  todayIso: string = getTodayIsoDate()
): { updated: TuitionRecord[]; changedCount: number } {
  let changedCount = 0;
  const updated = tuitions.map((t) => {
    const nextStatus = computeTuitionStatus(t.amount, t.paidAmount, t.dueDate, todayIso);
    if (nextStatus !== t.status) {
      changedCount++;
      return { ...t, status: nextStatus };
    }
    return t;
  });
  return { updated, changedCount };
}

export function generateMonthlyTuitionsForChildren(params: {
  children: Child[];
  existingTuitions: TuitionRecord[];
  year: number;
  month: number;
  defaultAmount?: number;
  dueDay?: number;
  todayIso?: string;
  nowIso?: string;
  createId?: () => string;
}): { created: TuitionRecord[]; skippedCount: number } {
  const {
    children,
    existingTuitions,
    year,
    month,
    defaultAmount = DEFAULT_TUITION_AMOUNT,
    dueDay = DEFAULT_DUE_DAY,
    todayIso = getTodayIsoDate(),
    nowIso = new Date().toISOString(),
    createId = () => `mens-${year}-${month}-${Math.random().toString(36).slice(2, 10)}`,
  } = params;

  const existingKeys = new Set(
    existingTuitions
      .filter((t) => t.referenceYear === year && t.referenceMonth === month)
      .map((t) => t.childId)
  );

  const dueDate = computeDueDate(year, month, dueDay);
  const created: TuitionRecord[] = [];
  let skippedCount = 0;

  for (const child of children) {
    if (!child.active) {
      skippedCount++;
      continue;
    }
    if (existingKeys.has(child.id)) {
      skippedCount++;
      continue;
    }
    const amount = child.tuitionAmount > 0 ? child.tuitionAmount : defaultAmount;
    const status = computeTuitionStatus(amount, 0, dueDate, todayIso);
    created.push({
      id: createId(),
      childId: child.id,
      guardianId: child.guardianId,
      referenceYear: year,
      referenceMonth: month,
      dueDate,
      amount: Math.round(amount * 100) / 100,
      paidAmount: 0,
      status,
      payments: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return { created, skippedCount };
}

export function applyPaymentToTuition(params: {
  tuition: TuitionRecord;
  paymentAmount: number;
  method: PaymentMethod;
  paymentDate: string;
  notes?: string;
  recordedByUserId: string;
  recordedByName: string;
  todayIso?: string;
  nowIso?: string;
  createPaymentId?: () => string;
}): { updatedTuition: TuitionRecord; payment: PaymentRecord } {
  const {
    tuition,
    paymentAmount,
    method,
    paymentDate,
    notes = '',
    recordedByUserId,
    recordedByName,
    todayIso = getTodayIsoDate(),
    nowIso = new Date().toISOString(),
    createPaymentId = () => `pag-${Math.random().toString(36).slice(2, 10)}`,
  } = params;

  const cleanAmount = Math.round(paymentAmount * 100) / 100;
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('O valor do pagamento deve ser maior que zero.');
  }

  const remainingBefore = Math.round((tuition.amount - tuition.paidAmount) * 100) / 100;
  if (remainingBefore <= 0) {
    throw new Error('Esta mensalidade já está integralmente quitada.');
  }
  if (cleanAmount > remainingBefore + 0.01) {
    throw new Error(
      `O valor informado excede o saldo em aberto de R$ ${remainingBefore.toFixed(2)}.`
    );
  }

  const payment: PaymentRecord = {
    id: createPaymentId(),
    tuitionId: tuition.id,
    childId: tuition.childId,
    guardianId: tuition.guardianId,
    amount: cleanAmount,
    method,
    paymentDate,
    notes: notes.trim(),
    recordedByUserId,
    recordedByName,
    createdAt: nowIso,
  };

  const nextPaid = Math.min(
    tuition.amount,
    Math.round((tuition.paidAmount + cleanAmount) * 100) / 100
  );
  const nextStatus = computeTuitionStatus(tuition.amount, nextPaid, tuition.dueDate, todayIso);

  const updatedTuition: TuitionRecord = {
    ...tuition,
    paidAmount: nextPaid,
    status: nextStatus,
    payments: [...tuition.payments, payment],
    updatedAt: nowIso,
  };

  return { updatedTuition, payment };
}

export function recalculateTuitionTotals(
  tuition: TuitionRecord,
  todayIso: string = getTodayIsoDate()
): TuitionRecord {
  const paidAmount = Math.round(
    tuition.payments.reduce((acc, p) => acc + p.amount, 0) * 100
  ) / 100;
  const clampedPaid = Math.min(tuition.amount, Math.max(0, paidAmount));
  return {
    ...tuition,
    paidAmount: clampedPaid,
    status: computeTuitionStatus(tuition.amount, clampedPaid, tuition.dueDate, todayIso),
  };
}

export function computeDashboardMetrics(
  db: InstallationDatabase,
  todayIso: string = getTodayIsoDate()
): DashboardMetrics {
  const { updated: normalizedTuitions } = refreshTuitionStatuses(db.tuitions, todayIso);

  const activeChildren = db.children.filter((c) => c.active).length;
  const inactiveChildren = db.children.length - activeChildren;

  let paidTuitionsCount = 0;
  let pendingTuitionsCount = 0;
  let overdueTuitionsCount = 0;
  let expectedAmount = 0;
  let receivedAmount = 0;
  let openAmount = 0;

  const openByChild = new Map<string, number>();

  for (const t of normalizedTuitions) {
    const remaining = Math.max(0, Math.round((t.amount - t.paidAmount) * 100) / 100);
    expectedAmount += t.amount;
    receivedAmount += t.paidAmount;
    openAmount += remaining;

    if (t.status === 'pago') {
      paidTuitionsCount++;
    } else if (t.status === 'atrasado') {
      overdueTuitionsCount++;
      openByChild.set(t.childId, (openByChild.get(t.childId) ?? 0) + 1);
    } else {
      pendingTuitionsCount++;
      openByChild.set(t.childId, (openByChild.get(t.childId) ?? 0) + 1);
    }
  }

  const childMap = new Map<string, Child>(db.children.map((c) => [c.id, c]));
  const guardianMap = new Map<string, Guardian>(db.guardians.map((g) => [g.id, g]));

  const alerts: DashboardAlert[] = normalizedTuitions
    .filter((t) => t.status !== 'pago')
    .sort((a, b) => {
      if (a.status === 'atrasado' && b.status !== 'atrasado') return -1;
      if (a.status !== 'atrasado' && b.status === 'atrasado') return 1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 20)
    .map((t) => {
      const child = childMap.get(t.childId);
      const guardian = guardianMap.get(t.guardianId);
      return {
        tuitionId: t.id,
        childId: t.childId,
        childName: child?.fullName ?? 'Criança não localizada',
        guardianId: t.guardianId,
        guardianName: guardian?.fullName ?? 'Responsável não localizado',
        guardianPhone: guardian?.whatsapp || guardian?.primaryPhone || 'Não informado',
        referenceMonth: t.referenceMonth,
        referenceYear: t.referenceYear,
        amount: t.amount,
        remainingAmount: Math.max(0, Math.round((t.amount - t.paidAmount) * 100) / 100),
        dueDate: t.dueDate,
        openMonthsCount: openByChild.get(t.childId) ?? 1,
        status: t.status,
      };
    });

  // Build up to 6 recent reference months for chart
  const monthBuckets = new Map<string, MonthlyRevenuePoint>();
  for (const t of normalizedTuitions) {
    const key = `${t.referenceYear}-${String(t.referenceMonth).padStart(2, '0')}`;
    const current = monthBuckets.get(key) ?? {
      key,
      label: formatMonthYearLabel(t.referenceMonth, t.referenceYear),
      expected: 0,
      received: 0,
      open: 0,
    };
    const rem = Math.max(0, t.amount - t.paidAmount);
    current.expected = Math.round((current.expected + t.amount) * 100) / 100;
    current.received = Math.round((current.received + t.paidAmount) * 100) / 100;
    current.open = Math.round((current.open + rem) * 100) / 100;
    monthBuckets.set(key, current);
  }

  const monthlySeries = Array.from(monthBuckets.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);

  return {
    totalChildren: db.children.length,
    activeChildren,
    inactiveChildren,
    totalGuardians: db.guardians.length,
    totalSchools: db.schools.length,
    totalVehicles: db.vehicles.length,
    paidTuitionsCount,
    pendingTuitionsCount,
    overdueTuitionsCount,
    expectedAmount: Math.round(expectedAmount * 100) / 100,
    receivedAmount: Math.round(receivedAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    monthlySeries,
    alerts,
  };
}

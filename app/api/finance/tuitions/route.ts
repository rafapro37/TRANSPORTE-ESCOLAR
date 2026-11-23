import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import type { PaymentMethod } from '@/lib/domain/types';
import {
  applyPaymentToTuition,
  computeTuitionStatus,
  generateMonthlyTuitionsForChildren,
  getTodayIsoDate,
  recalculateTuitionTotals,
} from '@/lib/domain/finance';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog } from '@/lib/server/storage';

const VALID_METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'transferencia', 'cartao', 'outros'];

export async function POST(req: NextRequest) {
  let body: { year?: number; month?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'finance', async ({ user, db }) => {
    const now = new Date();
    const year = Number(body.year ?? now.getFullYear());
    const month = Number(body.month ?? now.getMonth() + 1);

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new Error('Ano de referência inválido.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('Mês de referência inválido.');
    }

    const { created, skippedCount } = generateMonthlyTuitionsForChildren({
      children: db.children,
      existingTuitions: db.tuitions,
      year,
      month,
      defaultAmount: db.settings.defaultTuitionAmount,
      dueDay: db.settings.defaultDueDay,
      todayIso: getTodayIsoDate(),
      createId: () => `mens-${year}${String(month).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex')}`,
    });

    db.tuitions.push(...created);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'MENSALIDADES_GERADAS',
      entityType: 'tuition',
      entityId: `${year}-${month}`,
      summary: `Geradas ${created.length} mensalidade(s) para ${String(month).padStart(2, '0')}/${year} (${skippedCount} ignorada(s)).`,
    });

    return {
      status: 201,
      body: {
        createdCount: created.length,
        skippedCount,
        tuitions: created,
      },
    };
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation<Record<string, unknown>>(req, 'finance', async ({ user, role, db }) => {
    const tuition = db.tuitions.find((t) => t.id === body.tuitionId);
    if (!tuition) {
      throw new Error('Mensalidade não encontrada.');
    }

    const action = String(body.action ?? 'pay');
    const child = db.children.find((c) => c.id === tuition.childId);

    if (action === 'pay') {
      const amount = Number(body.amount);
      const method = String(body.method ?? 'pix') as PaymentMethod;
      const paymentDate = String(body.paymentDate ?? getTodayIsoDate());
      const notes = String(body.notes ?? '');

      if (!VALID_METHODS.includes(method)) {
        throw new Error('Forma de pagamento inválida.');
      }

      const { updatedTuition, payment } = applyPaymentToTuition({
        tuition,
        paymentAmount: amount,
        method,
        paymentDate,
        notes,
        recordedByUserId: user.id,
        recordedByName: user.name,
        todayIso: getTodayIsoDate(),
        createPaymentId: () => `pag-${crypto.randomBytes(5).toString('hex')}`,
      });

      const idx = db.tuitions.findIndex((t) => t.id === tuition.id);
      db.tuitions[idx] = updatedTuition;

      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'PAGAMENTO_REGISTRADO',
        entityType: 'payment',
        entityId: payment.id,
        summary: `Pagamento de R$ ${payment.amount.toFixed(2)} (${method.toUpperCase()}) registrado para ${child?.fullName ?? 'criança'} (${String(tuition.referenceMonth).padStart(2, '0')}/${tuition.referenceYear}).`,
      });

      return { body: { tuition: updatedTuition, payment } };
    }

    if (action === 'edit_tuition') {
      if (role !== 'admin' && role !== 'financeiro') {
        throw new Error('Apenas Administrador ou Financeiro podem editar lançamentos.');
      }
      if (typeof body.amount === 'number') {
        if (!Number.isFinite(body.amount) || body.amount <= 0) {
          throw new Error('Valor inválido.');
        }
        tuition.amount = Math.round(body.amount * 100) / 100;
      }
      if (typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
        tuition.dueDate = body.dueDate;
      }
      tuition.status = computeTuitionStatus(
        tuition.amount,
        tuition.paidAmount,
        tuition.dueDate,
        getTodayIsoDate()
      );
      tuition.updatedAt = new Date().toISOString();

      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'MENSALIDADE_EDITADA',
        entityType: 'tuition',
        entityId: tuition.id,
        summary: `Lançamento de ${child?.fullName ?? 'criança'} ajustado para R$ ${tuition.amount.toFixed(2)} (vencimento ${tuition.dueDate}).`,
      });

      return { body: { tuition } };
    }

    if (action === 'delete_payment') {
      if (role !== 'admin') {
        throw new Error('Somente o Administrador pode estornar um pagamento registrado.');
      }
      const paymentId = String(body.paymentId ?? '');
      const paymentIndex = tuition.payments.findIndex((p) => p.id === paymentId);
      if (paymentIndex === -1) {
        throw new Error('Pagamento não encontrado.');
      }
      const removed = tuition.payments[paymentIndex];
      tuition.payments.splice(paymentIndex, 1);
      const recalculated = recalculateTuitionTotals(tuition, getTodayIsoDate());
      recalculated.updatedAt = new Date().toISOString();

      const idx = db.tuitions.findIndex((t) => t.id === tuition.id);
      db.tuitions[idx] = recalculated;

      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'PAGAMENTO_ESTORNADO',
        entityType: 'payment',
        entityId: removed.id,
        summary: `Estorno de R$ ${removed.amount.toFixed(2)} na mensalidade de ${child?.fullName ?? 'criança'}.`,
      });

      return { body: { tuition: recalculated } };
    }

    throw new Error('Ação financeira inválida.');
  });
}

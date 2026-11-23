'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileDown,
  Trash2,
} from 'lucide-react';
import type { PaymentMethod, PaymentRecord, TuitionRecord, TuitionStatus } from '@/lib/domain/types';
import { formatCurrencyBr, formatDateBr } from '@/lib/domain/cpf';
import { formatMonthYearLabel, getTodayIsoDate } from '@/lib/domain/finance';
import { apiFetch } from '@/lib/client/api';
import { exportPaymentReceiptPdf } from '@/lib/client/export';
import { Modal } from '@/components/ui/Modal';
import type { WorkspacePayload } from '@/lib/client/workspace-types';

interface FinanceViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  focusTuitionId?: string;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  cartao: 'Cartão',
  outros: 'Outros',
};

const STATUS_META: Record<TuitionStatus, { label: string; textClass: string }> = {
  pago: { label: 'Pago', textClass: 'text-emerald-700' },
  pendente: { label: 'Pendente', textClass: 'text-amber-700' },
  parcial: { label: 'Parcial', textClass: 'text-blue-700' },
  atrasado: { label: 'Atrasado', textClass: 'text-red-700' },
};

export function FinanceView({ workspace, onRefresh, focusTuitionId }: FinanceViewProps) {
  const { tuitions, children, guardians, currentUser, settings } = workspace;

  const now = new Date();
  const [genYear, setGenYear] = useState(now.getFullYear());
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [tab, setTab] = useState<'mensalidades' | 'pagamentos' | 'abertos'>('mensalidades');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [filterChild, setFilterChild] = useState<string>('all');
  const [filterGuardian, setFilterGuardian] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');

  // Payment modal
  const [payTuition, setPayTuition] = useState<TuitionRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('pix');
  const [payDate, setPayDate] = useState(getTodayIsoDate());
  const [payNotes, setPayNotes] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Edit tuition modal
  const [editTuition, setEditTuition] = useState<TuitionRecord | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  // Dossier / payments detail modal
  const [detailTuitionId, setDetailTuitionId] = useState<string | null>(focusTuitionId ?? null);

  const detailTuition = useMemo(
    () => tuitions.find((t) => t.id === detailTuitionId) ?? null,
    [tuitions, detailTuitionId]
  );

  const filteredTuitions = useMemo(() => {
    return tuitions
      .filter((t) => {
        if (tab === 'abertos' && t.status === 'pago') return false;
        if (filterMonth !== 'all' && t.referenceMonth !== Number(filterMonth)) return false;
        if (filterYear !== 'all' && t.referenceYear !== Number(filterYear)) return false;
        if (filterChild !== 'all' && t.childId !== filterChild) return false;
        if (filterGuardian !== 'all' && t.guardianId !== filterGuardian) return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (
          filterMethod !== 'all' &&
          !t.payments.some((p) => p.method === filterMethod)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.referenceYear !== a.referenceYear) return b.referenceYear - a.referenceYear;
        if (b.referenceMonth !== a.referenceMonth) return b.referenceMonth - a.referenceMonth;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [
    tuitions,
    tab,
    filterMonth,
    filterYear,
    filterChild,
    filterGuardian,
    filterStatus,
    filterMethod,
  ]);

  const allPayments = useMemo(() => {
    const list: Array<{ payment: PaymentRecord; tuition: TuitionRecord }> = [];
    for (const t of tuitions) {
      if (filterMonth !== 'all' && t.referenceMonth !== Number(filterMonth)) continue;
      if (filterYear !== 'all' && t.referenceYear !== Number(filterYear)) continue;
      if (filterChild !== 'all' && t.childId !== filterChild) continue;
      if (filterGuardian !== 'all' && t.guardianId !== filterGuardian) continue;
      for (const p of t.payments) {
        if (filterMethod !== 'all' && p.method !== filterMethod) continue;
        list.push({ payment: p, tuition: t });
      }
    }
    return list.sort((a, b) => b.payment.paymentDate.localeCompare(a.payment.paymentDate));
  }, [tuitions, filterMonth, filterYear, filterChild, filterGuardian, filterMethod]);

  async function handleGenerateTuitions() {
    setError(null);
    setFeedback(null);
    setGenerating(true);
    try {
      const res = await apiFetch<{ createdCount: number; skippedCount: number }>(
        '/api/finance/tuitions',
        {
          method: 'POST',
          body: JSON.stringify({ year: genYear, month: genMonth }),
        }
      );
      await onRefresh();
      setFeedback(
        `${res.createdCount} mensalidade(s) gerada(s) para ${formatMonthYearLabel(genMonth, genYear)}. ${res.skippedCount} ignorada(s) (inativas ou já geradas).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar mensalidades.');
    } finally {
      setGenerating(false);
    }
  }

  function openPayModal(t: TuitionRecord) {
    const remaining = Math.max(0, Math.round((t.amount - t.paidAmount) * 100) / 100);
    setPayTuition(t);
    setPayAmount(remaining.toFixed(2));
    setPayMethod('pix');
    setPayDate(getTodayIsoDate());
    setPayNotes('');
    setError(null);
  }

  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payTuition) return;
    setError(null);
    setSubmittingPay(true);
    try {
      await apiFetch('/api/finance/tuitions', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'pay',
          tuitionId: payTuition.id,
          amount: Number(payAmount),
          method: payMethod,
          paymentDate: payDate,
          notes: payNotes,
        }),
      });
      await onRefresh();
      setDetailTuitionId(payTuition.id);
      setPayTuition(null);
      setFeedback('Pagamento registrado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar pagamento.');
    } finally {
      setSubmittingPay(false);
    }
  }

  async function handleEditTuition(e: React.FormEvent) {
    e.preventDefault();
    if (!editTuition) return;
    setError(null);
    try {
      await apiFetch('/api/finance/tuitions', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'edit_tuition',
          tuitionId: editTuition.id,
          amount: Number(editAmount),
          dueDate: editDueDate,
        }),
      });
      await onRefresh();
      setEditTuition(null);
      setFeedback('Lançamento atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar lançamento.');
    }
  }

  async function handleDeletePayment(tuitionId: string, paymentId: string) {
    setError(null);
    try {
      await apiFetch('/api/finance/tuitions', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'delete_payment',
          tuitionId,
          paymentId,
        }),
      });
      await onRefresh();
      setFeedback('Pagamento estornado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao estornar pagamento.');
    }
  }

  const yearsAvailable = Array.from(
    new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, ...tuitions.map((t) => t.referenceYear)])
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Financeiro e Mensalidades
          </h1>
          <p className="text-sm text-slate-500">
            Padrão {formatCurrencyBr(settings.defaultTuitionAmount)} · Vencimento todo dia{' '}
            {settings.defaultDueDay} · Baixa integral ou parcial
          </p>
        </div>

        {/* Monthly Generator Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 flex-wrap">
          <select
            aria-label="Mês para geração"
            value={genMonth}
            onChange={(e) => setGenMonth(Number(e.target.value))}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {formatMonthYearLabel(m, genYear)}
              </option>
            ))}
          </select>
          <select
            aria-label="Ano para geração"
            value={genYear}
            onChange={(e) => setGenYear(Number(e.target.value))}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            {yearsAvailable.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerateTuitions}
            style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
            className="min-h-[40px] px-4 rounded-lg text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-60 whitespace-nowrap"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>{generating ? 'Gerando...' : 'Gerar Mensalidades'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setTab('mensalidades')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
              tab === 'mensalidades' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Todas as Mensalidades
          </button>
          <button
            type="button"
            onClick={() => setTab('abertos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
              tab === 'abertos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Pendentes e Atrasadas
          </button>
          <button
            type="button"
            onClick={() => setTab('pagamentos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
              tab === 'pagamentos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Pagamentos Recebidos
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <select
            aria-label="Filtrar por mês"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todos os meses</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Mês {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por ano"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todos os anos</option>
            {yearsAvailable.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por criança"
            value={filterChild}
            onChange={(e) => setFilterChild(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todas as crianças</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por responsável"
            value={filterGuardian}
            onChange={(e) => setFilterGuardian(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todos os responsáveis</option>
            {guardians.map((g) => (
              <option key={g.id} value={g.id}>
                {g.fullName}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por situação"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todas as situações</option>
            <option value="pago">Pago</option>
            <option value="pendente">Pendente</option>
            <option value="parcial">Parcial</option>
            <option value="atrasado">Atrasado</option>
          </select>

          <select
            aria-label="Filtrar por forma de pagamento"
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todas as formas</option>
            {Object.entries(METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      {tab === 'pagamentos' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {allPayments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Nenhum pagamento registrado para os filtros selecionados.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {allPayments.map(({ payment, tuition }) => {
                const child = children.find((c) => c.id === payment.childId);
                const guardian = guardians.find((g) => g.id === payment.guardianId);
                return (
                  <div
                    key={payment.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-sm text-slate-900">
                        {child?.fullName || '—'} ·{' '}
                        <span className="text-emerald-700 font-mono-num">
                          {formatCurrencyBr(payment.amount)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Resp.: {guardian?.fullName || '—'} · Ref.:{' '}
                        {formatMonthYearLabel(tuition.referenceMonth, tuition.referenceYear)} · Data:{' '}
                        {formatDateBr(payment.paymentDate)} · {METHOD_LABELS[payment.method]}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          exportPaymentReceiptPdf({
                            installationName: settings.installationName,
                            childName: child?.fullName || '—',
                            guardianName: guardian?.fullName || '—',
                            tuition,
                            payment,
                            theme: settings.theme,
                          })
                        }
                        className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Comprovante PDF</span>
                      </button>
                      {currentUser.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(tuition.id, payment.id)}
                          className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Estornar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredTuitions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Nenhuma mensalidade encontrada. Clique em <strong>Gerar Mensalidades</strong> acima
              para criar os lançamentos das crianças ativas.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTuitions.map((t) => {
                const child = children.find((c) => c.id === t.childId);
                const guardian = guardians.find((g) => g.id === t.guardianId);
                const remaining = Math.max(0, Math.round((t.amount - t.paidAmount) * 100) / 100);
                const meta = STATUS_META[t.status];

                return (
                  <div
                    key={t.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900">
                          {child?.fullName || '—'}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {formatMonthYearLabel(t.referenceMonth, t.referenceYear)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.textClass}`}
                        >
                          {t.status === 'pago' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : t.status === 'atrasado' ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Resp.: {guardian?.fullName || '—'} · Vencimento:{' '}
                        {formatDateBr(t.dueDate)} · Valor:{' '}
                        <span className="font-mono-num font-medium text-slate-800">
                          {formatCurrencyBr(t.amount)}
                        </span>{' '}
                        · Pago:{' '}
                        <span className="font-mono-num text-emerald-700">
                          {formatCurrencyBr(t.paidAmount)}
                        </span>{' '}
                        · Em aberto:{' '}
                        <span className="font-mono-num font-semibold text-rose-700">
                          {formatCurrencyBr(remaining)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => openPayModal(t)}
                          style={{
                            backgroundColor:
                              settings.theme.buttonColor || settings.theme.primaryColor,
                          }}
                          className="min-h-[38px] px-3.5 rounded-lg text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 whitespace-nowrap"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Registrar Pagamento</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDetailTuitionId(t.id)}
                        className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Detalhes ({t.payments.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditTuition(t);
                          setEditAmount(String(t.amount));
                          setEditDueDate(t.dueDate);
                        }}
                        aria-label={`Editar mensalidade de ${child?.fullName || 'criança'}`}
                        className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Register Payment Modal */}
      <Modal
        open={Boolean(payTuition)}
        onClose={() => setPayTuition(null)}
        title="Registrar Pagamento"
        subtitle={
          payTuition
            ? `Ref.: ${formatMonthYearLabel(payTuition.referenceMonth, payTuition.referenceYear)} · Saldo em aberto: ${formatCurrencyBr(Math.max(0, payTuition.amount - payTuition.paidAmount))}`
            : ''
        }
      >
        {payTuition && (
          <form onSubmit={handleRegisterPayment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="p-val" className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor pago (R$) * (integral ou parcial)
                </label>
                <input
                  id="p-val"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label htmlFor="p-date" className="block text-xs font-semibold text-slate-700 mb-1">
                  Data do pagamento *
                </label>
                <input
                  id="p-date"
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="p-method" className="block text-xs font-semibold text-slate-700 mb-1">
                Forma de pagamento *
              </label>
              <select
                id="p-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {Object.entries(METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="p-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                Observações
              </label>
              <textarea
                id="p-notes"
                rows={2}
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayTuition(null)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingPay}
                style={{
                  backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor,
                }}
                className="min-h-[42px] px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              >
                {submittingPay ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Tuition Modal */}
      <Modal
        open={Boolean(editTuition)}
        onClose={() => setEditTuition(null)}
        title="Editar Lançamento de Mensalidade"
      >
        {editTuition && (
          <form onSubmit={handleEditTuition} className="space-y-4">
            <div>
              <label htmlFor="et-amount" className="block text-xs font-semibold text-slate-700 mb-1">
                Valor da mensalidade (R$)
              </label>
              <input
                id="et-amount"
                type="number"
                step="0.01"
                min="1"
                required
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="et-due" className="block text-xs font-semibold text-slate-700 mb-1">
                Data de vencimento
              </label>
              <input
                id="et-due"
                type="date"
                required
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTuition(null)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                Salvar Ajuste
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Tuition Detail Modal */}
      <Modal
        open={Boolean(detailTuition)}
        onClose={() => setDetailTuitionId(null)}
        title="Detalhes da Mensalidade e Recibos"
        size="lg"
      >
        {detailTuition &&
          (() => {
            const child = children.find((c) => c.id === detailTuition.childId);
            const guardian = guardians.find((g) => g.id === detailTuition.guardianId);
            const remaining = Math.max(0, detailTuition.amount - detailTuition.paidAmount);

            return (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">{child?.fullName || '—'}</div>
                    <div className="text-xs text-slate-600">
                      Responsável: {guardian?.fullName || '—'} · Referência:{' '}
                      {formatMonthYearLabel(
                        detailTuition.referenceMonth,
                        detailTuition.referenceYear
                      )}{' '}
                      · Venc.: {formatDateBr(detailTuition.dueDate)}
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-sm">
                    <div>
                      Pago: <strong>{formatCurrencyBr(detailTuition.paidAmount)}</strong> /{' '}
                      {formatCurrencyBr(detailTuition.amount)}
                    </div>
                    <div className="text-xs text-rose-700">
                      Em aberto: {formatCurrencyBr(remaining)}
                    </div>
                  </div>
                </div>

                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = detailTuition;
                      setDetailTuitionId(null);
                      openPayModal(t);
                    }}
                    style={{
                      backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor,
                    }}
                    className="min-h-[42px] px-4 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Registrar Pagamento (Integral ou Parcial)</span>
                  </button>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    Pagamentos Registrados ({detailTuition.payments.length})
                  </h4>
                  {detailTuition.payments.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                      Nenhum pagamento registrado nesta mensalidade ainda.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                      {detailTuition.payments.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {formatCurrencyBr(p.amount)} · {METHOD_LABELS[p.method]}
                            </div>
                            <div className="text-slate-500">
                              Data: {formatDateBr(p.paymentDate)} · Registrado por{' '}
                              {p.recordedByName}
                              {p.notes ? ` · Obs.: ${p.notes}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                exportPaymentReceiptPdf({
                                  installationName: settings.installationName,
                                  childName: child?.fullName || '—',
                                  guardianName: guardian?.fullName || '—',
                                  tuition: detailTuition,
                                  payment: p,
                                  theme: settings.theme,
                                })
                              }
                              className="min-h-[36px] px-3 rounded-lg border border-slate-200 font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>Comprovante PDF</span>
                            </button>
                            {currentUser.role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(detailTuition.id, p.id)}
                                className="min-h-[36px] px-2.5 rounded-lg text-red-700 hover:bg-red-50"
                              >
                                Estornar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}

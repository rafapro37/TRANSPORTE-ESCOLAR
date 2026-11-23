'use client';

import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Bus,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Wallet,
} from 'lucide-react';
import { formatCurrencyBr, formatDateBr, formatPhoneBr } from '@/lib/domain/cpf';
import { formatMonthYearLabel } from '@/lib/domain/finance';
import { getVehicleOccupancy } from '@/lib/domain/vehicles';
import { hasRolePermission } from '@/lib/domain/installations';
import type { NavigationFocusTarget, WorkspacePayload } from '@/lib/client/workspace-types';

interface DashboardViewProps {
  workspace: WorkspacePayload;
  onNavigate: (target: NavigationFocusTarget) => void;
}

export function DashboardView({ workspace, onNavigate }: DashboardViewProps) {
  const { dashboard, currentUser, vehicles, children, schools, settings } = workspace;
  const canFinance = hasRolePermission(currentUser.role, 'finance');

  const maxChartValue = Math.max(
    100,
    ...dashboard.monthlySeries.map((p) => Math.max(p.expected, p.received + p.open))
  );

  const primaryColor = settings.theme.primaryColor || '#e11d62';

  const schoolDistribution = schools
    .map((s) => ({
      id: s.id,
      name: s.name,
      count: children.filter((c) => c.active && c.schoolId === s.id).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance">
            Painel Geral · {settings.installationName}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Indicadores operacionais e financeiros atualizados automaticamente
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasRolePermission(currentUser.role, 'children') && (
            <button
              type="button"
              onClick={() => onNavigate({ section: 'criancas', action: 'new' })}
              style={{ backgroundColor: settings.theme.buttonColor || primaryColor }}
              className="min-h-[40px] px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-95 transition-opacity whitespace-nowrap"
            >
              Nova Criança
            </button>
          )}
          {canFinance && (
            <button
              type="button"
              onClick={() => onNavigate({ section: 'financeiro' })}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Gerenciar Mensalidades
            </button>
          )}
        </div>
      </div>

      {/* Operational KPIs (6 indicators) */}
      <section aria-label="Indicadores Operacionais">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => onNavigate({ section: 'criancas' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Crianças</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.totalChildren}
            </div>
            <div className="mt-1 text-xs text-slate-500">Total cadastradas</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ section: 'criancas' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-emerald-700 text-xs font-medium">
              <span>Ativas</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.activeChildren}
            </div>
            <div className="mt-1 text-xs text-slate-500">Em transporte</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ section: 'criancas' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Inativas</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.inactiveChildren}
            </div>
            <div className="mt-1 text-xs text-slate-500">Desligadas</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ section: 'responsaveis' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Responsáveis</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.totalGuardians}
            </div>
            <div className="mt-1 text-xs text-slate-500">Cadastrados</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ section: 'escolas' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Escolas</span>
              <Building2 className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.totalSchools}
            </div>
            <div className="mt-1 text-xs text-slate-500">Instituições</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ section: 'veiculos' })}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Veículos</span>
              <Bus className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {dashboard.totalVehicles}
            </div>
            <div className="mt-1 text-xs text-slate-500">Cadastrados</div>
          </button>
        </div>
      </section>

      {/* Financial KPIs (6 indicators - visible for Admin & Financeiro) */}
      {canFinance && (
        <section aria-label="Indicadores Financeiros">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-medium">
                <span>Pagas</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
                {dashboard.paidTuitionsCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">Mensalidades</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-amber-700 text-xs font-medium">
                <span>Pendentes</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
                {dashboard.pendingTuitionsCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">A vencer / parcial</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-red-700 text-xs font-medium">
                <span>Atrasadas</span>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-red-700 tabular-nums">
                {dashboard.overdueTuitionsCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">Vencidas</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
                <span>Previsto</span>
                <Wallet className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 text-lg sm:text-xl font-bold text-slate-900 font-mono-num">
                {formatCurrencyBr(dashboard.expectedAmount)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Total gerado</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-medium">
                <span>Recebido</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-lg sm:text-xl font-bold text-emerald-700 font-mono-num">
                {formatCurrencyBr(dashboard.receivedAmount)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Confirmado</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-rose-700 text-xs font-medium">
                <span>Em Aberto</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 text-lg sm:text-xl font-bold text-rose-700 font-mono-num">
                {formatCurrencyBr(dashboard.openAmount)}
              </div>
              <div className="mt-1 text-xs text-slate-500">Saldo restante</div>
            </div>
          </div>
        </section>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {canFinance && (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Evolução Financeira Mensal
                </h2>
                <p className="text-xs text-slate-500">
                  Comparativo entre valores recebidos e valores em aberto
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" /> Recebido
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Em aberto
                </span>
              </div>
            </div>

            {dashboard.monthlySeries.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Nenhuma mensalidade gerada ainda. Acesse <strong>Financeiro</strong> para gerar o
                mês atual.
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.monthlySeries.map((pt) => {
                  const recPct = Math.round((pt.received / maxChartValue) * 100);
                  const openPct = Math.round((pt.open / maxChartValue) * 100);
                  return (
                    <div key={pt.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{pt.label}</span>
                        <span className="font-mono-num text-slate-600">
                          Recebido {formatCurrencyBr(pt.received)} · Aberto{' '}
                          {formatCurrencyBr(pt.open)}
                        </span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-600 h-full transition-all"
                          style={{ width: `${recPct}%` }}
                          title={`Recebido: ${formatCurrencyBr(pt.received)}`}
                        />
                        <div
                          className="bg-rose-500 h-full transition-all"
                          style={{ width: `${openPct}%` }}
                          title={`Em aberto: ${formatCurrencyBr(pt.open)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div
          className={`${
            canFinance ? 'lg:col-span-5' : 'lg:col-span-12'
          } bg-white border border-slate-200 rounded-xl p-5`}
        >
          <h2 className="text-base font-semibold text-slate-900">Ocupação dos Veículos</h2>
          <p className="text-xs text-slate-500 mb-4">
            Passageiros ativos em relação à capacidade cadastrada
          </p>
          <div className="space-y-3.5">
            {vehicles.map((v) => {
              const occ = getVehicleOccupancy(v, children);
              return (
                <div key={v.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {v.name} {!v.active && '(Inativo)'}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      {occ.ocupacao}/{occ.capacidade} vagas ({occ.vagasDisponiveis} livres)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${occ.percentual}%`,
                        backgroundColor:
                          occ.percentual >= 95 ? '#dc2626' : primaryColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-700 mb-2.5">
              Crianças Ativas por Escola
            </h3>
            <div className="space-y-2">
              {schoolDistribution.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-xs text-slate-600"
                >
                  <span className="truncate pr-3">{s.name}</span>
                  <span className="font-mono-num font-semibold text-slate-900 shrink-0">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Important Alerts Section */}
      {canFinance && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Alertas Importantes de Mensalidades
              </h2>
              <p className="text-xs text-slate-500">
                Clique em qualquer alerta para abrir a ficha financeira correspondente
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 tabular-nums">
              {dashboard.alerts.length} registro(s)
            </span>
          </div>

          {dashboard.alerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma mensalidade pendente ou atrasada no momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboard.alerts.map((alert) => {
                const isOverdue = alert.status === 'atrasado';
                const statusLabel =
                  alert.status === 'atrasado'
                    ? 'Atrasado'
                    : alert.status === 'parcial'
                      ? 'Parcial'
                      : 'Pendente';
                return (
                  <button
                    key={alert.tuitionId}
                    type="button"
                    onClick={() =>
                      onNavigate({
                        section: 'financeiro',
                        entityId: alert.tuitionId,
                      })
                    }
                    className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900">
                          {alert.childName}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-600">
                          Resp.: {alert.guardianName} ({formatPhoneBr(alert.guardianPhone)})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>
                          Ref.: {formatMonthYearLabel(alert.referenceMonth, alert.referenceYear)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Venc.: {formatDateBr(alert.dueDate)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {alert.openMonthsCount} mensalidade(s) em aberto
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono-num text-slate-900">
                          {formatCurrencyBr(alert.remainingAmount)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          Total {formatCurrencyBr(alert.amount)}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isOverdue ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {isOverdue ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {statusLabel}
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

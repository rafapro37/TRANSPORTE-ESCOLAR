'use client';

import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, Shield } from 'lucide-react';
import {
  formatCurrencyBr,
  formatDateBr,
  formatPhoneBr,
  maskCpf,
  maskRg,
} from '@/lib/domain/cpf';
import { formatMonthYearLabel } from '@/lib/domain/finance';
import { getVehicleOccupancy } from '@/lib/domain/vehicles';
import { hasRolePermission } from '@/lib/domain/installations';
import {
  exportReportToExcel,
  exportReportToPdf,
  type ReportExportColumn,
} from '@/lib/client/export';
import type { WorkspacePayload } from '@/lib/client/workspace-types';
import { BrandLogo } from '@/components/BrandLogo';

interface ReportsViewProps {
  workspace: WorkspacePayload;
}

type ReportTypeId =
  | 'criancas_todas'
  | 'criancas_ativas_inativas'
  | 'responsaveis'
  | 'criancas_por_escola'
  | 'criancas_por_veiculo'
  | 'ocupacao_veiculos'
  | 'mensalidades_pagas'
  | 'mensalidades_pendentes'
  | 'mensalidades_atrasadas'
  | 'faturamento_mensal'
  | 'valores_recebidos'
  | 'valores_em_aberto'
  | 'historico_individual'
  | 'contatos_responsaveis';

const REPORT_OPTIONS: Array<{
  id: ReportTypeId;
  label: string;
  financeOnly?: boolean;
}> = [
  { id: 'criancas_todas', label: 'Crianças Cadastradas' },
  { id: 'criancas_ativas_inativas', label: 'Crianças Ativas e Inativas' },
  { id: 'responsaveis', label: 'Responsáveis' },
  { id: 'criancas_por_escola', label: 'Crianças por Escola' },
  { id: 'criancas_por_veiculo', label: 'Crianças por Veículo' },
  { id: 'ocupacao_veiculos', label: 'Ocupação dos Veículos' },
  { id: 'contatos_responsaveis', label: 'Lista de Contatos dos Responsáveis' },
  { id: 'mensalidades_pagas', label: 'Mensalidades Pagas', financeOnly: true },
  { id: 'mensalidades_pendentes', label: 'Mensalidades Pendentes', financeOnly: true },
  { id: 'mensalidades_atrasadas', label: 'Mensalidades Atrasadas', financeOnly: true },
  { id: 'faturamento_mensal', label: 'Faturamento Mensal', financeOnly: true },
  { id: 'valores_recebidos', label: 'Valores Recebidos', financeOnly: true },
  { id: 'valores_em_aberto', label: 'Valores em Aberto', financeOnly: true },
  { id: 'historico_individual', label: 'Histórico Financeiro Individual', financeOnly: true },
];

export function ReportsView({ workspace }: ReportsViewProps) {
  const { children, guardians, schools, vehicles, tuitions, currentUser, settings } = workspace;
  const canFinance = hasRolePermission(currentUser.role, 'reports_finance');
  const canSensitiveDocs = hasRolePermission(currentUser.role, 'documents_sensitive');

  const availableReports = REPORT_OPTIONS.filter((r) => !r.financeOnly || canFinance);

  const [reportType, setReportType] = useState<ReportTypeId>('criancas_todas');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterVehicle, setFilterVehicle] = useState<string>('all');
  const [filterGuardian, setFilterGuardian] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [revealPersonalDocs, setRevealPersonalDocs] = useState(false);

  const filteredChildren = useMemo(() => {
    return children.filter((c) => {
      if (filterSchool !== 'all' && c.schoolId !== filterSchool) return false;
      if (filterVehicle !== 'all' && c.vehicleId !== filterVehicle) return false;
      if (filterGuardian !== 'all' && c.guardianId !== filterGuardian) return false;
      if (filterStatus === 'active' && !c.active) return false;
      if (filterStatus === 'inactive' && c.active) return false;
      return true;
    });
  }, [children, filterSchool, filterVehicle, filterGuardian, filterStatus]);

  const filteredTuitions = useMemo(() => {
    return tuitions.filter((t) => {
      const child = children.find((c) => c.id === t.childId);
      if (filterMonth !== 'all' && t.referenceMonth !== Number(filterMonth)) return false;
      if (filterYear !== 'all' && t.referenceYear !== Number(filterYear)) return false;
      if (filterGuardian !== 'all' && t.guardianId !== filterGuardian) return false;
      if (filterSchool !== 'all' && child?.schoolId !== filterSchool) return false;
      if (filterVehicle !== 'all' && child?.vehicleId !== filterVehicle) return false;
      return true;
    });
  }, [tuitions, children, filterMonth, filterYear, filterGuardian, filterSchool, filterVehicle]);

  const { columns, rows, title } = useMemo((): {
    title: string;
    columns: ReportExportColumn[];
    rows: Array<Record<string, string | number>>;
  } => {
    const label = REPORT_OPTIONS.find((r) => r.id === reportType)?.label ?? 'Relatório';

    if (reportType === 'criancas_todas' || reportType === 'criancas_ativas_inativas') {
      return {
        title: label,
        columns: [
          { header: 'Criança', key: 'nome' },
          { header: 'Situação', key: 'situacao' },
          { header: 'Escola', key: 'escola' },
          { header: 'Período', key: 'periodo' },
          { header: 'Veículo', key: 'veiculo' },
          { header: 'Responsável', key: 'responsavel' },
        ],
        rows: filteredChildren.map((c) => ({
          nome: c.fullName,
          situacao: c.active ? 'Ativa' : 'Inativa',
          escola: schools.find((s) => s.id === c.schoolId)?.name || '—',
          periodo: c.period === 'manha' ? 'Manhã' : c.period === 'tarde' ? 'Tarde' : 'Integral',
          veiculo: vehicles.find((v) => v.id === c.vehicleId)?.name || '—',
          responsavel: guardians.find((g) => g.id === c.guardianId)?.fullName || '—',
        })),
      };
    }

    if (reportType === 'responsaveis') {
      return {
        title: label,
        columns: [
          { header: 'Responsável', key: 'nome' },
          { header: 'CPF', key: 'cpf' },
          { header: 'RG', key: 'rg' },
          { header: 'Telefone', key: 'telefone' },
          { header: 'Crianças', key: 'criancas' },
        ],
        rows: guardians
          .filter((g) => filterGuardian === 'all' || g.id === filterGuardian)
          .map((g) => ({
            nome: g.fullName,
            cpf: revealPersonalDocs && canSensitiveDocs ? g.cpf : maskCpf(g.cpf),
            rg: revealPersonalDocs && canSensitiveDocs ? g.rg || '—' : maskRg(g.rg),
            telefone: formatPhoneBr(g.whatsapp || g.primaryPhone),
            criancas: children.filter((c) => c.guardianId === g.id).length,
          })),
      };
    }

    if (reportType === 'contatos_responsaveis') {
      return {
        title: label,
        columns: [
          { header: 'Responsável', key: 'nome' },
          { header: 'Telefone Principal', key: 'tel' },
          { header: 'WhatsApp', key: 'whats' },
          { header: 'E-mail', key: 'email' },
          { header: 'Crianças', key: 'criancas' },
        ],
        rows: guardians
          .filter((g) => filterGuardian === 'all' || g.id === filterGuardian)
          .map((g) => ({
            nome: g.fullName,
            tel: formatPhoneBr(g.primaryPhone),
            whats: formatPhoneBr(g.whatsapp),
            email: g.email || '—',
            criancas: children
              .filter((c) => c.guardianId === g.id)
              .map((c) => c.fullName)
              .join(', '),
          })),
      };
    }

    if (reportType === 'criancas_por_escola') {
      return {
        title: label,
        columns: [
          { header: 'Escola', key: 'escola' },
          { header: 'Criança', key: 'crianca' },
          { header: 'Série/Turma', key: 'serie' },
          { header: 'Período', key: 'periodo' },
          { header: 'Veículo', key: 'veiculo' },
        ],
        rows: [...filteredChildren]
          .sort((a, b) => a.schoolId.localeCompare(b.schoolId))
          .map((c) => ({
            escola: schools.find((s) => s.id === c.schoolId)?.name || '—',
            crianca: c.fullName,
            serie: `${c.grade} ${c.classroom}`.trim() || '—',
            periodo: c.period === 'manha' ? 'Manhã' : c.period === 'tarde' ? 'Tarde' : 'Integral',
            veiculo: vehicles.find((v) => v.id === c.vehicleId)?.name || '—',
          })),
      };
    }

    if (reportType === 'criancas_por_veiculo') {
      return {
        title: label,
        columns: [
          { header: 'Veículo', key: 'veiculo' },
          { header: 'Criança', key: 'crianca' },
          { header: 'Escola', key: 'escola' },
          { header: 'Período', key: 'periodo' },
          { header: 'Situação', key: 'situacao' },
        ],
        rows: [...filteredChildren]
          .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId))
          .map((c) => ({
            veiculo: vehicles.find((v) => v.id === c.vehicleId)?.name || '—',
            crianca: c.fullName,
            escola: schools.find((s) => s.id === c.schoolId)?.name || '—',
            periodo: c.period === 'manha' ? 'Manhã' : c.period === 'tarde' ? 'Tarde' : 'Integral',
            situacao: c.active ? 'Ativa' : 'Inativa',
          })),
      };
    }

    if (reportType === 'ocupacao_veiculos') {
      return {
        title: label,
        columns: [
          { header: 'Veículo', key: 'veiculo' },
          { header: 'Motorista', key: 'motorista' },
          { header: 'Ocupação', key: 'ocupacao' },
          { header: 'Capacidade', key: 'capacidade' },
          { header: 'Vagas Livres', key: 'vagas' },
          { header: 'Taxa', key: 'taxa' },
        ],
        rows: vehicles
          .filter((v) => filterVehicle === 'all' || v.id === filterVehicle)
          .map((v) => {
            const occ = getVehicleOccupancy(v, children);
            return {
              veiculo: v.name,
              motorista: v.driverName || '—',
              ocupacao: occ.ocupacao,
              capacidade: occ.capacidade,
              vagas: occ.vagasDisponiveis,
              taxa: `${occ.percentual}%`,
            };
          }),
      };
    }

    if (
      reportType === 'mensalidades_pagas' ||
      reportType === 'mensalidades_pendentes' ||
      reportType === 'mensalidades_atrasadas' ||
      reportType === 'valores_em_aberto' ||
      reportType === 'historico_individual'
    ) {
      const targetList = filteredTuitions.filter((t) => {
        if (reportType === 'mensalidades_pagas') return t.status === 'pago';
        if (reportType === 'mensalidades_pendentes')
          return t.status === 'pendente' || t.status === 'parcial';
        if (reportType === 'mensalidades_atrasadas') return t.status === 'atrasado';
        if (reportType === 'valores_em_aberto') return t.amount - t.paidAmount > 0.01;
        return true;
      });
      return {
        title: label,
        columns: [
          { header: 'Criança', key: 'crianca' },
          { header: 'Responsável', key: 'responsavel' },
          { header: 'Referência', key: 'ref' },
          { header: 'Vencimento', key: 'venc' },
          { header: 'Valor', key: 'valor' },
          { header: 'Pago', key: 'pago' },
          { header: 'Aberto', key: 'aberto' },
          { header: 'Situação', key: 'situacao' },
        ],
        rows: targetList.map((t) => ({
          crianca: children.find((c) => c.id === t.childId)?.fullName || '—',
          responsavel: guardians.find((g) => g.id === t.guardianId)?.fullName || '—',
          ref: formatMonthYearLabel(t.referenceMonth, t.referenceYear),
          venc: formatDateBr(t.dueDate),
          valor: formatCurrencyBr(t.amount),
          pago: formatCurrencyBr(t.paidAmount),
          aberto: formatCurrencyBr(Math.max(0, t.amount - t.paidAmount)),
          situacao: t.status.toUpperCase(),
        })),
      };
    }

    if (reportType === 'valores_recebidos') {
      const paymentRows = filteredTuitions.flatMap((t) =>
        t.payments.map((p) => ({
          data: formatDateBr(p.paymentDate),
          crianca: children.find((c) => c.id === p.childId)?.fullName || '—',
          responsavel: guardians.find((g) => g.id === p.guardianId)?.fullName || '—',
          ref: formatMonthYearLabel(t.referenceMonth, t.referenceYear),
          forma: p.method.toUpperCase(),
          valor: formatCurrencyBr(p.amount),
        }))
      );
      return {
        title: label,
        columns: [
          { header: 'Data', key: 'data' },
          { header: 'Criança', key: 'crianca' },
          { header: 'Responsável', key: 'responsavel' },
          { header: 'Referência', key: 'ref' },
          { header: 'Forma', key: 'forma' },
          { header: 'Valor Recebido', key: 'valor' },
        ],
        rows: paymentRows,
      };
    }

    // faturamento_mensal
    const bucketMap = new Map<
      string,
      { label: string; count: number; expected: number; received: number; open: number }
    >();
    for (const t of filteredTuitions) {
      const key = `${t.referenceYear}-${String(t.referenceMonth).padStart(2, '0')}`;
      const cur = bucketMap.get(key) ?? {
        label: formatMonthYearLabel(t.referenceMonth, t.referenceYear),
        count: 0,
        expected: 0,
        received: 0,
        open: 0,
      };
      cur.count++;
      cur.expected += t.amount;
      cur.received += t.paidAmount;
      cur.open += Math.max(0, t.amount - t.paidAmount);
      bucketMap.set(key, cur);
    }

    return {
      title: label,
      columns: [
        { header: 'Mês/Ano', key: 'mes' },
        { header: 'Mensalidades', key: 'qtd' },
        { header: 'Previsto', key: 'previsto' },
        { header: 'Recebido', key: 'recebido' },
        { header: 'Em Aberto', key: 'aberto' },
      ],
      rows: Array.from(bucketMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([, b]) => ({
          mes: b.label,
          qtd: b.count,
          previsto: formatCurrencyBr(b.expected),
          recebido: formatCurrencyBr(b.received),
          aberto: formatCurrencyBr(b.open),
        })),
    };
  }, [
    reportType,
    filteredChildren,
    filteredTuitions,
    schools,
    vehicles,
    guardians,
    children,
    filterGuardian,
    filterVehicle,
    revealPersonalDocs,
    canSensitiveDocs,
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500">
            Exportação em PDF, Excel (.xlsx) e impressão com a identidade visual da instalação
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportReportToPdf({
                title,
                installationName: settings.installationName,
                columns,
                rows,
                theme: settings.theme,
                fileName: `relatorio-${reportType}`,
              })
            }
            style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
            className="min-h-[40px] px-3.5 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95"
          >
            <FileText className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportReportToExcel({
                title,
                installationName: settings.installationName,
                columns,
                rows,
                fileName: `relatorio-${reportType}`,
              })
            }
            className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-800"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Filters & Report Picker */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="r-type" className="block text-xs font-semibold text-slate-700 mb-1">
              Tipo de relatório
            </label>
            <select
              id="r-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportTypeId)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
            >
              {availableReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="r-school" className="block text-xs font-semibold text-slate-700 mb-1">
              Escola
            </label>
            <select
              id="r-school"
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="all">Todas as escolas</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="r-vehicle" className="block text-xs font-semibold text-slate-700 mb-1">
              Veículo
            </label>
            <select
              id="r-vehicle"
              value={filterVehicle}
              onChange={(e) => setFilterVehicle(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="all">Todos os veículos</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            aria-label="Filtrar por mês"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
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
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todos os anos</option>
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por responsável"
            value={filterGuardian}
            onChange={(e) => setFilterGuardian(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
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
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="all">Todas as situações</option>
            <option value="active">Somente ativas</option>
            <option value="inactive">Somente inativas</option>
          </select>
        </div>

        {reportType === 'responsaveis' && canSensitiveDocs && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              Proteção LGPD: CPF e RG permanecem ocultos por padrão nos relatórios comuns.
            </span>
            <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={revealPersonalDocs}
                onChange={(e) => setRevealPersonalDocs(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span>Exibir CPF e RG completos (autorizado)</span>
            </label>
          </div>
        )}
      </div>

      {/* Report Preview & Print Sheet */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo logoFileId={settings.theme.logoFileId} size="sm" />
            <div>
              <h2 className="font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">
                ELEFANTE ROSA – 3 CARROS ESCOLARES · {settings.installationName} · {rows.length}{' '}
                registro(s)
              </p>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum registro encontrado para este relatório com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  {columns.map((c) => (
                    <th key={c.key} className="py-3 px-4 font-semibold whitespace-nowrap">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {columns.map((c) => (
                      <td key={c.key} className="py-2.5 px-4 text-slate-800 tabular-nums">
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

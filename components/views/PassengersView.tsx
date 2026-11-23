'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Printer, Search } from 'lucide-react';
import type { Child, PeriodoEscolar } from '@/lib/domain/types';
import { formatPhoneBr } from '@/lib/domain/cpf';
import { getVehicleOccupancy } from '@/lib/domain/vehicles';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ChildAvatar } from './ChildrenView';
import type { WorkspacePayload } from '@/lib/client/workspace-types';

interface PassengersViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  focusVehicleId?: string;
}

const PERIOD_LABELS: Record<PeriodoEscolar, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  integral: 'Integral',
};

export function PassengersView({
  workspace,
  onRefresh,
  focusVehicleId,
}: PassengersViewProps) {
  const { vehicles, children, schools, guardians, settings } = workspace;

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    focusVehicleId || vehicles[0]?.id || ''
  );
  const [periodFilter, setPeriodFilter] = useState<'all' | PeriodoEscolar>('all');
  const [search, setSearch] = useState('');
  const [transferChild, setTransferChild] = useState<Child | null>(null);
  const [targetVehicleId, setTargetVehicleId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const occupancy = currentVehicle ? getVehicleOccupancy(currentVehicle, children) : null;

  const passengers = useMemo(() => {
    if (!currentVehicle) return [];
    const q = search.trim().toLowerCase();
    return children
      .filter((c) => {
        if (!c.active || c.vehicleId !== currentVehicle.id) return false;
        if (periodFilter !== 'all' && c.period !== periodFilter) return false;
        if (!q) return true;
        const school = schools.find((s) => s.id === c.schoolId);
        const guardian = guardians.find((g) => g.id === c.guardianId);
        return (
          c.fullName.toLowerCase().includes(q) ||
          (school?.name.toLowerCase().includes(q) ?? false) ||
          (guardian?.fullName.toLowerCase().includes(q) ?? false) ||
          c.pickupStreet.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  }, [currentVehicle, children, schools, guardians, periodFilter, search]);

  function openTransfer(child: Child) {
    setTransferChild(child);
    const other = vehicles.find((v) => v.id !== child.vehicleId && v.active);
    setTargetVehicleId(other?.id ?? child.vehicleId);
    setError(null);
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferChild) return;
    setError(null);
    setTransferring(true);
    try {
      await apiFetch('/api/children', {
        method: 'PATCH',
        body: JSON.stringify({
          id: transferChild.id,
          vehicleId: targetVehicleId,
        }),
      });
      await onRefresh();
      setTransferChild(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir passageiro.');
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Lista de Passageiros</h1>
          <p className="text-sm text-slate-500">
            Relação organizada por veículo, escola, período e endereço de embarque
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-slate-50 whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir Lista</span>
        </button>
      </div>

      {/* Vehicle Selector Tabs & Occupancy */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 no-print">
        <div className="flex items-center gap-2 flex-wrap">
          {vehicles.map((v) => {
            const occ = getVehicleOccupancy(v, children);
            const activeTab = currentVehicle?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVehicleId(v.id)}
                style={
                  activeTab
                    ? { backgroundColor: settings.theme.primaryColor || '#e11d62', color: '#fff' }
                    : undefined
                }
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab
                    ? 'shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {v.name} ({occ.ocupacao}/{occ.capacidade})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por criança, escola, responsável ou rua..."
              aria-label="Filtrar passageiros"
              className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <select
              aria-label="Filtrar por período"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as 'all' | PeriodoEscolar)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              <option value="all">Todos os períodos</option>
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="integral">Integral</option>
            </select>
          </div>
          {occupancy && (
            <div className="md:col-span-3 text-xs text-slate-600 text-right tabular-nums">
              Ocupação: <strong>{occupancy.ocupacao}</strong> · Vagas livres:{' '}
              <strong className="text-emerald-700">{occupancy.vagasDisponiveis}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print-only mb-4 border-b border-slate-300 pb-3">
        <h2 className="text-lg font-bold">
          ELEFANTE ROSA – 3 CARROS ESCOLARES · {settings.installationName}
        </h2>
        <p className="text-sm">
          Lista de Passageiros: {currentVehicle?.name} · Motorista:{' '}
          {currentVehicle?.driverName || '—'} · Emitida em {new Date().toLocaleString('pt-BR')}
        </p>
      </div>

      {passengers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Nenhum passageiro ativo encontrado para este veículo e filtro.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {passengers.map((child) => {
            const school = schools.find((s) => s.id === child.schoolId);
            const guardian = guardians.find((g) => g.id === child.guardianId);
            return (
              <div
                key={child.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <ChildAvatar child={child} size="md" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-semibold text-sm text-slate-900">
                      {child.fullName}
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      <span>{school?.name || '—'}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {child.grade || '—'} {child.classroom}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{PERIOD_LABELS[child.period]}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Resp.: {guardian?.fullName || '—'} (
                      {formatPhoneBr(guardian?.whatsapp || guardian?.primaryPhone || '')}) ·{' '}
                      Embarque:{' '}
                      {child.pickupStreet
                        ? `${child.pickupStreet}, ${child.pickupNumber || 'S/N'} - ${child.pickupNeighborhood}`
                        : 'Não informado'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openTransfer(child)}
                  className="no-print min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Transferir Veículo</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(transferChild)}
        onClose={() => setTransferChild(null)}
        title={transferChild ? `Transferir ${transferChild.fullName}` : 'Transferir Passageiro'}
        subtitle="A transferência respeita a capacidade máxima cadastrada do veículo de destino."
      >
        {transferChild && (
          <form onSubmit={handleTransfer} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="t-veh" className="block text-xs font-semibold text-slate-700 mb-1">
                Selecione o veículo de destino
              </label>
              <select
                id="t-veh"
                value={targetVehicleId}
                onChange={(e) => setTargetVehicleId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {vehicles.map((v) => {
                  const occ = getVehicleOccupancy(v, children);
                  return (
                    <option key={v.id} value={v.id}>
                      {v.name} — {occ.ocupacao}/{occ.capacidade} ({occ.vagasDisponiveis} vagas
                      livres)
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferChild(null)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={transferring}
                style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
                className="min-h-[42px] px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              >
                {transferring ? 'Transferindo...' : 'Confirmar Transferência'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

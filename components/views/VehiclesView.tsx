'use client';

import React, { useState } from 'react';
import { Bus, Edit3, Eye, Phone, Plus, UserCheck } from 'lucide-react';
import type { Vehicle } from '@/lib/domain/types';
import { formatPhoneBr } from '@/lib/domain/cpf';
import { getVehicleOccupancy } from '@/lib/domain/vehicles';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { NavigationFocusTarget, WorkspacePayload } from '@/lib/client/workspace-types';

interface VehiclesViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onNavigate: (target: NavigationFocusTarget) => void;
}

export function VehiclesView({ workspace, onRefresh, onNavigate }: VehiclesViewProps) {
  const { vehicles, children, guardians, schools, settings } = workspace;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);

  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [capacity, setCapacity] = useState('15');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [helperName, setHelperName] = useState('');
  const [helperPhone, setHelperPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName('');
    setPlate('');
    setModel('');
    setYear('');
    setCapacity('15');
    setDriverName('');
    setDriverPhone('');
    setHelperName('');
    setHelperPhone('');
    setNotes('');
    setActive(true);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setName(v.name);
    setPlate(v.plate);
    setModel(v.model);
    setYear(v.year);
    setCapacity(String(v.capacity));
    setDriverName(v.driverName);
    setDriverPhone(v.driverPhone);
    setHelperName(v.helperName);
    setHelperPhone(v.helperPhone);
    setNotes(v.notes);
    setActive(v.active);
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        id: editing?.id,
        name,
        plate,
        model,
        year,
        capacity: Number(capacity),
        driverName,
        driverPhone,
        helperName,
        helperPhone,
        notes,
        active,
      };
      await apiFetch('/api/vehicles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar veículo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Veículos</h1>
          <p className="text-sm text-slate-500">
            Controle de frota, motoristas, ajudantes e vagas disponíveis nesta instalação
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-4 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Veículo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vehicles.map((v) => {
          const occ = getVehicleOccupancy(v, children);
          return (
            <div
              key={v.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <Bus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base text-slate-900">{v.name}</h3>
                      <p className="text-xs text-slate-500">
                        {v.plate || 'Sem placa'} · {v.model || 'Modelo não informado'}{' '}
                        {v.year ? `(${v.year})` : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      v.active ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {v.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Motorista:</span>
                    <span className="font-medium text-slate-900">
                      {v.driverName || 'Não informado'}
                      {v.driverPhone ? ` · ${formatPhoneBr(v.driverPhone)}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ajudante:</span>
                    <span className="font-medium text-slate-900">
                      {v.helperName || 'Não informado'}
                      {v.helperPhone ? ` · ${formatPhoneBr(v.helperPhone)}` : ''}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-600">Ocupação de passageiros</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {occ.ocupacao}/{occ.capacidade} ({occ.vagasDisponiveis} vagas livres)
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${occ.percentual}%`,
                        backgroundColor:
                          occ.percentual >= 95 ? '#dc2626' : settings.theme.primaryColor,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetailVehicle(v)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ficha e Passageiros</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(v)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.name}` : 'Cadastrar Veículo'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="v-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do veículo *
              </label>
              <input
                id="v-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="v-plate" className="block text-xs font-semibold text-slate-700 mb-1">
                Placa
              </label>
              <input
                id="v-plate"
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC-1D23"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="v-model" className="block text-xs font-semibold text-slate-700 mb-1">
                Modelo
              </label>
              <input
                id="v-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex.: Sprinter Escolar"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="v-year" className="block text-xs font-semibold text-slate-700 mb-1">
                Ano
              </label>
              <input
                id="v-year"
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2023"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="v-cap" className="block text-xs font-semibold text-slate-700 mb-1">
                Capacidade de passageiros *
              </label>
              <input
                id="v-cap"
                type="number"
                min={1}
                max={100}
                required
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="v-driver" className="block text-xs font-semibold text-slate-700 mb-1">
                Motorista
              </label>
              <input
                id="v-driver"
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="v-driver-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone do motorista
              </label>
              <input
                id="v-driver-phone"
                type="text"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="v-helper" className="block text-xs font-semibold text-slate-700 mb-1">
                Ajudante / Monitor(a)
              </label>
              <input
                id="v-helper"
                type="text"
                value={helperName}
                onChange={(e) => setHelperName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="v-helper-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone do ajudante
              </label>
              <input
                id="v-helper-phone"
                type="text"
                value={helperPhone}
                onChange={(e) => setHelperPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="v-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Observações
            </label>
            <textarea
              id="v-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span>Veículo ativo para transporte</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[42px] px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
              className="min-h-[42px] px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar Veículo'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(detailVehicle)}
        onClose={() => setDetailVehicle(null)}
        title={detailVehicle ? `Ficha do Veículo · ${detailVehicle.name}` : 'Veículo'}
        size="lg"
      >
        {detailVehicle &&
          (() => {
            const occ = getVehicleOccupancy(detailVehicle, children);
            const linkedChildren = children.filter(
              (c) => c.active && c.vehicleId === detailVehicle.id
            );
            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Capacidade Total</div>
                    <div className="text-xl font-bold tabular-nums text-slate-900">
                      {occ.capacidade}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Passageiros</div>
                    <div className="text-xl font-bold tabular-nums text-slate-900">
                      {occ.ocupacao}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Vagas Disponíveis</div>
                    <div className="text-xl font-bold tabular-nums text-emerald-700">
                      {occ.vagasDisponiveis}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Placa</div>
                    <div className="text-base font-bold font-mono-num text-slate-900">
                      {detailVehicle.plate || 'Não informada'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-slate-500 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Motorista</div>
                      <div className="font-semibold text-slate-900">
                        {detailVehicle.driverName || 'Não informado'}
                      </div>
                      {detailVehicle.driverPhone && (
                        <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {formatPhoneBr(detailVehicle.driverPhone)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-slate-500 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-500">Ajudante</div>
                      <div className="font-semibold text-slate-900">
                        {detailVehicle.helperName || 'Não informado'}
                      </div>
                      {detailVehicle.helperPhone && (
                        <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {formatPhoneBr(detailVehicle.helperPhone)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Crianças Vinculadas ({linkedChildren.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailVehicle(null);
                        onNavigate({ section: 'passageiros', entityId: detailVehicle.id });
                      }}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700"
                    >
                      Abrir Lista de Passageiros
                    </button>
                  </div>
                  {linkedChildren.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                      Nenhuma criança ativa vinculada a este veículo.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {linkedChildren.map((c) => {
                        const school = schools.find((s) => s.id === c.schoolId);
                        const guardian = guardians.find((g) => g.id === c.guardianId);
                        return (
                          <div
                            key={c.id}
                            className="p-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900 text-sm">
                                {c.fullName}
                              </div>
                              <div className="text-slate-500">
                                {school?.name} · Resp.: {guardian?.fullName}
                              </div>
                            </div>
                            <span className="text-slate-600">
                              {c.period === 'manha'
                                ? 'Manhã'
                                : c.period === 'tarde'
                                  ? 'Tarde'
                                  : 'Integral'}
                            </span>
                          </div>
                        );
                      })}
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

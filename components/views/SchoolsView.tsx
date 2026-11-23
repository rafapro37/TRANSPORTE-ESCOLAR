'use client';

import React, { useMemo, useState } from 'react';
import { Building2, Edit3, Plus, Search, Users } from 'lucide-react';
import type { School } from '@/lib/domain/types';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { NavigationFocusTarget, WorkspacePayload } from '@/lib/client/workspace-types';

interface SchoolsViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onNavigate: (target: NavigationFocusTarget) => void;
}

export function SchoolsView({ workspace, onRefresh, onNavigate }: SchoolsViewProps) {
  const { schools, children, settings } = workspace;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<School | null>(null);
  const [linkedSchool, setLinkedSchool] = useState<School | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => {
      if (statusFilter === 'active' && !s.active) return false;
      if (statusFilter === 'inactive' && s.active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
      );
    });
  }, [schools, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setName('');
    setAddress('');
    setPhone('');
    setNotes('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(school: School) {
    setEditing(school);
    setName(school.name);
    setAddress(school.address);
    setPhone(school.phone);
    setNotes(school.notes);
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await apiFetch('/api/schools', {
          method: 'PATCH',
          body: JSON.stringify({ id: editing.id, name, address, phone, notes }),
        });
      } else {
        await apiFetch('/api/schools', {
          method: 'POST',
          body: JSON.stringify({ name, address, phone, notes }),
        });
      }
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar escola.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(school: School) {
    try {
      await apiFetch('/api/schools', {
        method: 'PATCH',
        body: JSON.stringify({ id: school.id, active: !school.active }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar situação.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Escolas</h1>
          <p className="text-sm text-slate-500">
            Instituições atendidas nesta instalação · Inativar preserva o histórico das crianças
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-4 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Escola</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar escola por nome..."
            aria-label="Pesquisar escola por nome"
            className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(['all', 'active', 'inactive'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'all' ? 'Todas' : tab === 'active' ? 'Ativas' : 'Inativas'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Nenhuma escola encontrada para o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((school) => {
            const linked = children.filter((c) => c.schoolId === school.id);
            const activeCount = linked.filter((c) => c.active).length;
            return (
              <div
                key={school.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{school.name}</h3>
                        <p className="text-xs text-slate-500">
                          {school.active ? 'Ativa' : 'Inativa'} ·{' '}
                          <span className="tabular-nums">{activeCount} ativa(s)</span> /{' '}
                          <span className="tabular-nums">{linked.length} total</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  {(school.address || school.phone) && (
                    <div className="mt-3 text-xs text-slate-600 space-y-1">
                      {school.address && <p>Endereço: {school.address}</p>}
                      {school.phone && <p>Telefone: {school.phone}</p>}
                    </div>
                  )}
                  {school.notes && (
                    <p className="mt-2 text-xs text-slate-500 line-clamp-2">{school.notes}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkedSchool(school)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Ver crianças ({linked.length})</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(school)}
                      aria-label={`Editar escola ${school.name}`}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(school)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium ${
                        school.active
                          ? 'text-amber-700 hover:bg-amber-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {school.active ? 'Inativar' : 'Reativar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Escola' : 'Cadastrar Nova Escola'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="school-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Nome da escola *
            </label>
            <input
              id="school-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="school-address" className="block text-xs font-semibold text-slate-700 mb-1">
                Endereço
              </label>
              <input
                id="school-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="school-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone
              </label>
              <input
                id="school-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="school-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Observações
            </label>
            <textarea
              id="school-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-sm"
            />
          </div>
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
              {saving ? 'Salvando...' : 'Salvar Escola'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(linkedSchool)}
        onClose={() => setLinkedSchool(null)}
        title={linkedSchool ? `Crianças · ${linkedSchool.name}` : 'Crianças'}
        subtitle="Histórico de crianças vinculadas a esta escola"
      >
        {linkedSchool && (
          <div className="space-y-2">
            {children.filter((c) => c.schoolId === linkedSchool.id).length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Nenhuma criança vinculada a esta escola até o momento.
              </p>
            ) : (
              children
                .filter((c) => c.schoolId === linkedSchool.id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setLinkedSchool(null);
                      onNavigate({ section: 'criancas', entityId: c.id });
                    }}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{c.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {c.grade || 'Série não informada'} {c.classroom} ·{' '}
                        {c.period === 'manha'
                          ? 'Manhã'
                          : c.period === 'tarde'
                            ? 'Tarde'
                            : 'Integral'}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        c.active ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {c.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </button>
                ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import {
  Camera,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import type { Child, PeriodoEscolar } from '@/lib/domain/types';
import { formatCurrencyBr, formatDateBr, formatPhoneBr } from '@/lib/domain/cpf';
import { formatMonthYearLabel } from '@/lib/domain/finance';
import { hasRolePermission } from '@/lib/domain/installations';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { NavigationFocusTarget, WorkspacePayload } from '@/lib/client/workspace-types';

interface ChildrenViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onNavigate: (target: NavigationFocusTarget) => void;
  focusEntityId?: string;
  initialAction?: string;
}

const PERIOD_LABELS: Record<PeriodoEscolar, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  integral: 'Integral',
};

export function ChildAvatar({
  child,
  size = 'md',
}: {
  child: Pick<Child, 'fullName' | 'photoFileId'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const dim =
    size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-24 h-24' : 'w-11 h-11';

  if (child.photoFileId && !failed) {
    return (
      <img
        src={`/api/files/${encodeURIComponent(child.photoFileId)}`}
        alt={`Foto de ${child.fullName}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dim} rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0`}
      aria-label={`Sem foto de ${child.fullName}`}
    >
      <User className={size === 'lg' ? 'w-9 h-9' : 'w-5 h-5'} />
    </div>
  );
}

export function ChildrenView({
  workspace,
  onRefresh,
  onNavigate,
  focusEntityId,
  initialAction,
}: ChildrenViewProps) {
  const { children, guardians, schools, vehicles, tuitions, currentUser, settings } = workspace;
  const canFinance = hasRolePermission(currentUser.role, 'finance');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(initialAction === 'new');
  const [editing, setEditing] = useState<Child | null>(null);
  const [dossierChildId, setDossierChildId] = useState<string | null>(focusEntityId ?? null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [schoolId, setSchoolId] = useState(
    () => schools.find((s) => s.active)?.id ?? schools[0]?.id ?? ''
  );
  const [grade, setGrade] = useState('');
  const [classroom, setClassroom] = useState('');
  const [period, setPeriod] = useState<PeriodoEscolar>('manha');
  const [guardianId, setGuardianId] = useState(() => guardians[0]?.id ?? '');
  const [pickupStreet, setPickupStreet] = useState(() => guardians[0]?.street ?? '');
  const [pickupNumber, setPickupNumber] = useState(() => guardians[0]?.number ?? '');
  const [pickupNeighborhood, setPickupNeighborhood] = useState(
    () => guardians[0]?.neighborhood ?? ''
  );
  const [pickupCity, setPickupCity] = useState(() => guardians[0]?.city ?? '');
  const [vehicleId, setVehicleId] = useState(
    () => vehicles.find((v) => v.active)?.id ?? vehicles[0]?.id ?? ''
  );
  const [tuitionAmount, setTuitionAmount] = useState(String(settings.defaultTuitionAmount));
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');

  // Photo staging (preview before save)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dossierChild = useMemo(
    () => children.find((c) => c.id === dossierChildId) ?? null,
    [children, dossierChildId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((c) => {
      if (statusFilter === 'active' && !c.active) return false;
      if (statusFilter === 'inactive' && c.active) return false;
      if (schoolFilter !== 'all' && c.schoolId !== schoolFilter) return false;
      if (vehicleFilter !== 'all' && c.vehicleId !== vehicleFilter) return false;
      if (!q) return true;
      const guardian = guardians.find((g) => g.id === c.guardianId);
      const school = schools.find((s) => s.id === c.schoolId);
      return (
        c.fullName.toLowerCase().includes(q) ||
        (guardian?.fullName.toLowerCase().includes(q) ?? false) ||
        (school?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [children, guardians, schools, search, statusFilter, schoolFilter, vehicleFilter]);

  function openCreate() {
    setEditing(null);
    setFullName('');
    setBirthDate('');
    setSchoolId(schools.find((s) => s.active)?.id ?? schools[0]?.id ?? '');
    setGrade('');
    setClassroom('');
    setPeriod('manha');
    const firstGuardian = guardians[0];
    setGuardianId(firstGuardian?.id ?? '');
    setPickupStreet(firstGuardian?.street ?? '');
    setPickupNumber(firstGuardian?.number ?? '');
    setPickupNeighborhood(firstGuardian?.neighborhood ?? '');
    setPickupCity(firstGuardian?.city ?? '');
    setVehicleId(vehicles.find((v) => v.active)?.id ?? vehicles[0]?.id ?? '');
    setTuitionAmount(String(settings.defaultTuitionAmount));
    setStartDate(new Date().toISOString().slice(0, 10));
    setActive(true);
    setNotes('');
    setPendingPhotoFile(null);
    setPendingPhotoPreview(null);
    setRemoveExistingPhoto(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(c: Child) {
    setEditing(c);
    setFullName(c.fullName);
    setBirthDate(c.birthDate);
    setSchoolId(c.schoolId);
    setGrade(c.grade);
    setClassroom(c.classroom);
    setPeriod(c.period);
    setGuardianId(c.guardianId);
    setPickupStreet(c.pickupStreet);
    setPickupNumber(c.pickupNumber);
    setPickupNeighborhood(c.pickupNeighborhood);
    setPickupCity(c.pickupCity);
    setVehicleId(c.vehicleId);
    setTuitionAmount(String(c.tuitionAmount));
    setStartDate(c.startDate);
    setActive(c.active);
    setNotes(c.notes);
    setPendingPhotoFile(null);
    setPendingPhotoPreview(null);
    setRemoveExistingPhoto(false);
    setFormError(null);
    setFormOpen(true);
  }

  function handleGuardianSelect(id: string) {
    setGuardianId(id);
    if (!editing) {
      const g = guardians.find((item) => item.id === id);
      if (g) {
        setPickupStreet(g.street);
        setPickupNumber(g.number);
        setPickupNeighborhood(g.neighborhood);
        setPickupCity(g.city);
      }
    }
  }

  function handlePhotoPick(file: File | null) {
    if (pendingPhotoPreview) {
      URL.revokeObjectURL(pendingPhotoPreview);
    }
    if (!file) {
      setPendingPhotoFile(null);
      setPendingPhotoPreview(null);
      return;
    }
    setPendingPhotoFile(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
    setRemoveExistingPhoto(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!guardianId) {
      setFormError('Cadastre e selecione um responsável antes de salvar a criança.');
      return;
    }
    if (!schoolId) {
      setFormError('Selecione uma escola.');
      return;
    }
    if (!vehicleId) {
      setFormError('Selecione um veículo.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editing?.id,
        fullName,
        birthDate,
        schoolId,
        grade,
        classroom,
        period,
        guardianId,
        pickupStreet,
        pickupNumber,
        pickupNeighborhood,
        pickupCity,
        vehicleId,
        tuitionAmount: Number(tuitionAmount),
        startDate,
        active,
        notes,
      };

      const savedRes = await apiFetch<{ child: Child }>('/api/children', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });

      const savedChildId = savedRes.child.id;

      if (removeExistingPhoto && editing?.photoFileId && !pendingPhotoFile) {
        await apiFetch('/api/children', {
          method: 'PATCH',
          body: JSON.stringify({ id: savedChildId, action: 'remove_photo' }),
        });
      }

      if (pendingPhotoFile) {
        const fd = new FormData();
        fd.append('targetType', 'child_photo');
        fd.append('childId', savedChildId);
        fd.append('file', pendingPhotoFile);
        await apiFetch('/api/files/upload', {
          method: 'POST',
          body: fd,
        });
      }

      await onRefresh();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cadastro da criança.');
    } finally {
      setSaving(false);
    }
  }

  const selectedGuardianObj = guardians.find((g) => g.id === guardianId);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Crianças</h1>
          <p className="text-sm text-slate-500">
            Cadastro completo com fotografia privada, escola, responsável e controle de vagas
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-4 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Criança</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar criança, responsável ou escola..."
            aria-label="Buscar crianças"
            className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filtrar por escola"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="all">Todas as escolas</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <select
            aria-label="Filtrar por veículo"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            <option value="all">Todos os veículos</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-center gap-1 p-1 bg-slate-100 rounded-lg justify-center">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {st === 'all' ? 'Todas' : st === 'active' ? 'Ativas' : 'Inativas'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-500">
            {children.length === 0
              ? 'Nenhuma criança cadastrada nesta instalação ainda.'
              : 'Nenhuma criança encontrada com os filtros aplicados.'}
          </p>
          {guardians.length === 0 && (
            <p className="text-xs text-amber-700">
              Dica: cadastre primeiro um responsável em <strong>Responsáveis</strong> para vincular
              à criança.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filtered.map((child) => {
            const guardian = guardians.find((g) => g.id === child.guardianId);
            const school = schools.find((s) => s.id === child.schoolId);
            const vehicle = vehicles.find((v) => v.id === child.vehicleId);
            return (
              <div
                key={child.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <ChildAvatar child={child} size="md" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">
                        {child.fullName}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          child.active ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {child.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      <span>{school?.name || 'Escola não informada'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{PERIOD_LABELS[child.period]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{vehicle?.name || 'Sem veículo'}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Resp.: {guardian?.fullName || '—'} ·{' '}
                      {formatPhoneBr(guardian?.whatsapp || guardian?.primaryPhone || '')} ·{' '}
                      <span className="font-mono-num font-medium text-slate-700">
                        {formatCurrencyBr(child.tuitionAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDossierChildId(child.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ficha</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(child)}
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
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Editar Criança · ${editing.fullName}` : 'Cadastrar Criança'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          {/* Photo preview & selector */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {pendingPhotoPreview ? (
                <img
                  src={pendingPhotoPreview}
                  alt="Prévia da fotografia"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-300"
                />
              ) : editing && !removeExistingPhoto ? (
                <ChildAvatar child={editing} size="md" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                  <Camera className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-slate-900">Fotografia da Criança</div>
                <div className="text-xs text-slate-500">
                  JPG, JPEG, PNG ou WEBP · Visualização prévia antes de salvar
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                <span>{editing?.photoFileId || pendingPhotoPreview ? 'Substituir' : 'Enviar Foto'}</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => handlePhotoPick(e.target.files?.[0] ?? null)}
                />
              </label>
              {(pendingPhotoPreview || (editing?.photoFileId && !removeExistingPhoto)) && (
                <button
                  type="button"
                  onClick={() => {
                    handlePhotoPick(null);
                    setRemoveExistingPhoto(true);
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="c-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome completo da criança *
              </label>
              <input
                id="c-name"
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-birth" className="block text-xs font-semibold text-slate-700 mb-1">
                Data de nascimento
              </label>
              <input
                id="c-birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-guardian" className="block text-xs font-semibold text-slate-700 mb-1">
                Responsável vinculado *
              </label>
              <select
                id="c-guardian"
                required
                value={guardianId}
                onChange={(e) => handleGuardianSelect(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">Selecione um responsável...</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName} ({g.cpf})
                  </option>
                ))}
              </select>
              {selectedGuardianObj && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Tel. do responsável: {formatPhoneBr(selectedGuardianObj.primaryPhone)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="c-school" className="block text-xs font-semibold text-slate-700 mb-1">
                Escola *
              </label>
              <select
                id="c-school"
                required
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">Selecione uma escola...</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {!s.active ? '(Inativa)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="c-grade" className="block text-xs font-semibold text-slate-700 mb-1">
                Série
              </label>
              <input
                id="c-grade"
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Ex.: 3º Ano"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-class" className="block text-xs font-semibold text-slate-700 mb-1">
                Turma
              </label>
              <input
                id="c-class"
                type="text"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                placeholder="Ex.: B"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-period" className="block text-xs font-semibold text-slate-700 mb-1">
                Período *
              </label>
              <select
                id="c-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodoEscolar)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="integral">Integral</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <div className="sm:col-span-3">
              <label htmlFor="c-street" className="block text-xs font-semibold text-slate-700 mb-1">
                Endereço de embarque
              </label>
              <input
                id="c-street"
                type="text"
                value={pickupStreet}
                onChange={(e) => setPickupStreet(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="c-num" className="block text-xs font-semibold text-slate-700 mb-1">
                Número
              </label>
              <input
                id="c-num"
                type="text"
                value={pickupNumber}
                onChange={(e) => setPickupNumber(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="c-neigh" className="block text-xs font-semibold text-slate-700 mb-1">
                Bairro
              </label>
              <input
                id="c-neigh"
                type="text"
                value={pickupNeighborhood}
                onChange={(e) => setPickupNeighborhood(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="c-city" className="block text-xs font-semibold text-slate-700 mb-1">
                Cidade
              </label>
              <input
                id="c-city"
                type="text"
                value={pickupCity}
                onChange={(e) => setPickupCity(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="c-vehicle" className="block text-xs font-semibold text-slate-700 mb-1">
                Veículo responsável *
              </label>
              <select
                id="c-vehicle"
                required
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (cap. {v.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="c-tuition" className="block text-xs font-semibold text-slate-700 mb-1">
                Valor da mensalidade (R$) *
              </label>
              <input
                id="c-tuition"
                type="number"
                step="0.01"
                min="1"
                required
                value={tuitionAmount}
                onChange={(e) => setTuitionAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="c-start" className="block text-xs font-semibold text-slate-700 mb-1">
                Data de início
              </label>
              <input
                id="c-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="c-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Observações
            </label>
            <textarea
              id="c-notes"
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
            <span>Criança ativa no transporte</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
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
              {saving ? 'Salvando...' : 'Salvar Criança'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Child Individual Dossier Modal */}
      <Modal
        open={Boolean(dossierChild)}
        onClose={() => setDossierChildId(null)}
        title={dossierChild ? `Ficha da Criança · ${dossierChild.fullName}` : 'Ficha'}
        size="xl"
      >
        {dossierChild &&
          (() => {
            const guardian = guardians.find((g) => g.id === dossierChild.guardianId);
            const school = schools.find((s) => s.id === dossierChild.schoolId);
            const vehicle = vehicles.find((v) => v.id === dossierChild.vehicleId);
            const childTuitions = tuitions.filter((t) => t.childId === dossierChild.id);

            return (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-4">
                    <ChildAvatar child={dossierChild} size="lg" />
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {dossierChild.fullName}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Nascimento: {formatDateBr(dossierChild.birthDate)} · Situação:{' '}
                        <strong>{dossierChild.active ? 'Ativa' : 'Inativa'}</strong>
                      </p>
                      <p className="text-xs text-slate-600">
                        Início no transporte: {formatDateBr(dossierChild.startDate)} · Mensalidade:{' '}
                        <strong className="font-mono-num">
                          {formatCurrencyBr(dossierChild.tuitionAmount)}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const c = dossierChild;
                      setDossierChildId(null);
                      openEdit(c);
                    }}
                    className="min-h-[40px] px-4 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Editar Cadastro
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-500">Dados Escolares</div>
                    <div className="text-sm font-semibold text-slate-900">{school?.name}</div>
                    <div>
                      Série/Turma: {dossierChild.grade || '—'} {dossierChild.classroom}
                    </div>
                    <div>Período: {PERIOD_LABELS[dossierChild.period]}</div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-500">Responsável</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {guardian?.fullName || '—'}
                    </div>
                    <div>
                      Tel.: {formatPhoneBr(guardian?.primaryPhone || '')} · WhatsApp:{' '}
                      {formatPhoneBr(guardian?.whatsapp || '')}
                    </div>
                    {guardian && (
                      <button
                        type="button"
                        onClick={() => {
                          setDossierChildId(null);
                          onNavigate({ section: 'responsaveis', entityId: guardian.id });
                        }}
                        className="text-rose-600 font-medium underline underline-offset-2 pt-1"
                      >
                        Abrir ficha e documentos do responsável
                      </button>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-500">Transporte e Embarque</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {vehicle?.name || '—'}
                    </div>
                    <div>
                      {dossierChild.pickupStreet
                        ? `${dossierChild.pickupStreet}, ${dossierChild.pickupNumber || 'S/N'} - ${dossierChild.pickupNeighborhood}, ${dossierChild.pickupCity}`
                        : 'Endereço de embarque não informado'}
                    </div>
                    {dossierChild.notes && (
                      <div className="text-slate-500 pt-1">Obs.: {dossierChild.notes}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {canFinance && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-2">
                        Histórico Financeiro ({childTuitions.length})
                      </h4>
                      {childTuitions.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhuma mensalidade gerada.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-52 overflow-y-auto">
                          {childTuitions.map((t) => (
                            <div
                              key={t.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <span>
                                {formatMonthYearLabel(t.referenceMonth, t.referenceYear)} (Venc.{' '}
                                {formatDateBr(t.dueDate)})
                              </span>
                              <span className="font-mono-num font-semibold">
                                {formatCurrencyBr(t.paidAmount)} / {formatCurrencyBr(t.amount)} ·{' '}
                                {t.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      Histórico de Alterações ({dossierChild.history.length})
                    </h4>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-52 overflow-y-auto">
                      {dossierChild.history.map((h) => (
                        <div key={h.id} className="p-2.5 text-xs">
                          <div className="font-medium text-slate-800">{h.summary}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatDateBr(h.timestamp)} · {h.actorName}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}

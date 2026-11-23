'use client';

import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DocumentCategory, Guardian, GuardianDocument } from '@/lib/domain/types';
import {
  formatCep,
  formatCpf,
  formatCurrencyBr,
  formatDateBr,
  formatPhoneBr,
  isValidCpf,
  normalizeCpf,
} from '@/lib/domain/cpf';
import { formatMonthYearLabel } from '@/lib/domain/finance';
import { hasRolePermission } from '@/lib/domain/installations';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { NavigationFocusTarget, WorkspacePayload } from '@/lib/client/workspace-types';

interface GuardiansViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onNavigate: (target: NavigationFocusTarget) => void;
  focusEntityId?: string;
}

const DOC_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  rg: 'RG',
  cpf: 'CPF',
  cnh: 'CNH',
  residencia: 'Comprovante de Residência',
  outros: 'Outros Documentos',
};

export function GuardiansView({
  workspace,
  onRefresh,
  onNavigate,
  focusEntityId,
}: GuardiansViewProps) {
  const { guardians, children, tuitions, currentUser, settings } = workspace;
  const canDocs = hasRolePermission(currentUser.role, 'documents_sensitive');
  const canFinance = hasRolePermission(currentUser.role, 'finance');

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [dossierGuardianId, setDossierGuardianId] = useState<string | null>(focusEntityId ?? null);
  const [previewDoc, setPreviewDoc] = useState<GuardianDocument | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('SP');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Doc upload state
  const [docCategory, setDocCategory] = useState<DocumentCategory>('rg');
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const dossierGuardian = useMemo(
    () => guardians.find((g) => g.id === dossierGuardianId) ?? null,
    [guardians, dossierGuardianId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = search.replace(/\D/g, '');
    return guardians.filter((g) => {
      if (!q) return true;
      const linkedNames = children
        .filter((c) => c.guardianId === g.id)
        .map((c) => c.fullName.toLowerCase());
      return (
        g.fullName.toLowerCase().includes(q) ||
        g.rg.toLowerCase().includes(q) ||
        (qDigits && normalizeCpf(g.cpf).includes(qDigits)) ||
        (qDigits && g.primaryPhone.replace(/\D/g, '').includes(qDigits)) ||
        (qDigits && g.whatsapp.replace(/\D/g, '').includes(qDigits)) ||
        linkedNames.some((n) => n.includes(q))
      );
    });
  }, [guardians, children, search]);

  function openCreate() {
    setEditing(null);
    setFullName('');
    setCpf('');
    setRg('');
    setBirthDate('');
    setPrimaryPhone('');
    setWhatsapp('');
    setAlternativePhone('');
    setEmail('');
    setCep('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setStateUf('SP');
    setNotes('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(g: Guardian) {
    setEditing(g);
    setFullName(g.fullName);
    setCpf(g.cpf);
    setRg(g.rg);
    setBirthDate(g.birthDate);
    setPrimaryPhone(g.primaryPhone);
    setWhatsapp(g.whatsapp);
    setAlternativePhone(g.alternativePhone);
    setEmail(g.email);
    setCep(g.cep);
    setStreet(g.street);
    setNumber(g.number);
    setComplement(g.complement);
    setNeighborhood(g.neighborhood);
    setCity(g.city);
    setStateUf(g.state);
    setNotes(g.notes);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!isValidCpf(cpf)) {
      setFormError('CPF inválido. Confira os 11 dígitos antes de salvar.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editing?.id,
        fullName,
        cpf,
        rg,
        birthDate,
        primaryPhone,
        whatsapp: whatsapp || primaryPhone,
        alternativePhone,
        email,
        cep,
        street,
        number,
        complement,
        neighborhood,
        city,
        state: stateUf,
        notes,
      };
      await apiFetch('/api/guardians', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onRefresh();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar responsável.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDocumentUpload(file: File, replaceDocId?: string, categoryOverride?: DocumentCategory) {
    if (!dossierGuardian) return;
    setDocError(null);
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('targetType', 'guardian_doc');
      fd.append('guardianId', dossierGuardian.id);
      fd.append('category', categoryOverride ?? docCategory);
      if (replaceDocId) fd.append('replaceDocId', replaceDocId);
      fd.append('file', file);

      await apiFetch('/api/files/upload', {
        method: 'POST',
        body: fd,
      });
      await onRefresh();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Erro ao enviar documento.');
    } finally {
      setDocUploading(false);
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!dossierGuardian) return;
    setDocError(null);
    try {
      await apiFetch('/api/guardians', {
        method: 'PATCH',
        body: JSON.stringify({
          id: dossierGuardian.id,
          action: 'remove_document',
          documentId,
        }),
      });
      setConfirmDeleteDocId(null);
      await onRefresh();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Erro ao excluir documento.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Responsáveis</h1>
          <p className="text-sm text-slate-500">
            Cadastro completo com validação de CPF, múltiplas crianças e documentos privados
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-4 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Responsável</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, CPF, RG, telefone ou nome da criança..."
            aria-label="Pesquisar responsáveis"
            className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-500">
            {guardians.length === 0
              ? 'Nenhum responsável cadastrado nesta instalação ainda.'
              : 'Nenhum responsável encontrado para os termos pesquisados.'}
          </p>
          {guardians.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium"
            >
              Cadastrar Primeiro Responsável
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((g) => {
              const linkedChildren = children.filter((c) => c.guardianId === g.id);
              return (
                <div
                  key={g.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{g.fullName}</span>
                      <span className="text-xs font-mono-num text-slate-500">
                        CPF {g.cpf}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      <span>Tel.: {formatPhoneBr(g.primaryPhone)}</span>
                      {g.whatsapp && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>WhatsApp: {formatPhoneBr(g.whatsapp)}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {linkedChildren.length} criança(s) vinculada(s)
                      </span>
                      {canDocs && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{g.documents.length} documento(s)</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDossierGuardianId(g.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Abrir Ficha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      aria-label={`Editar ${g.fullName}`}
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
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Editar Responsável · ${editing.fullName}` : 'Cadastrar Responsável'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="g-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome completo *
              </label>
              <input
                id="g-name"
                type="text"
                required
                minLength={3}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="g-cpf" className="block text-xs font-semibold text-slate-700 mb-1">
                CPF *
              </label>
              <input
                id="g-cpf"
                type="text"
                required
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="g-rg" className="block text-xs font-semibold text-slate-700 mb-1">
                RG
              </label>
              <input
                id="g-rg"
                type="text"
                value={rg}
                onChange={(e) => setRg(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label htmlFor="g-birth" className="block text-xs font-semibold text-slate-700 mb-1">
                Data de nascimento
              </label>
              <input
                id="g-birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="g-email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail
              </label>
              <input
                id="g-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="g-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone principal *
              </label>
              <input
                id="g-phone"
                type="text"
                required
                value={primaryPhone}
                onChange={(e) => setPrimaryPhone(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="g-whats" className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp
              </label>
              <input
                id="g-whats"
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="g-alt-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone alternativo
              </label>
              <input
                id="g-alt-phone"
                type="text"
                value={alternativePhone}
                onChange={(e) => setAlternativePhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="g-cep" className="block text-xs font-semibold text-slate-700 mb-1">
                CEP
              </label>
              <input
                id="g-cep"
                type="text"
                value={cep}
                onChange={(e) => setCep(formatCep(e.target.value))}
                placeholder="00000-000"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="g-street" className="block text-xs font-semibold text-slate-700 mb-1">
                Rua
              </label>
              <input
                id="g-street"
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="g-number" className="block text-xs font-semibold text-slate-700 mb-1">
                Número
              </label>
              <input
                id="g-number"
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="g-comp" className="block text-xs font-semibold text-slate-700 mb-1">
                Complemento
              </label>
              <input
                id="g-comp"
                type="text"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="g-neigh" className="block text-xs font-semibold text-slate-700 mb-1">
                Bairro
              </label>
              <input
                id="g-neigh"
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="g-city" className="block text-xs font-semibold text-slate-700 mb-1">
                Cidade
              </label>
              <input
                id="g-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="g-uf" className="block text-xs font-semibold text-slate-700 mb-1">
                UF
              </label>
              <input
                id="g-uf"
                type="text"
                maxLength={2}
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="g-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Observações
            </label>
            <textarea
              id="g-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-sm"
            />
          </div>

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
              {saving ? 'Salvando...' : 'Salvar Responsável'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Guardian Individual Dossier Modal */}
      <Modal
        open={Boolean(dossierGuardian)}
        onClose={() => {
          setDossierGuardianId(null);
          setConfirmDeleteDocId(null);
        }}
        title={dossierGuardian ? `Ficha do Responsável · ${dossierGuardian.fullName}` : 'Ficha'}
        size="xl"
      >
        {dossierGuardian &&
          (() => {
            const linkedChildren = children.filter((c) => c.guardianId === dossierGuardian.id);
            const guardianTuitions = tuitions.filter((t) => t.guardianId === dossierGuardian.id);
            const allPayments = guardianTuitions.flatMap((t) => t.payments);
            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <h3 className="text-xs font-semibold text-slate-500">Dados Pessoais</h3>
                    <p className="font-semibold text-slate-900">{dossierGuardian.fullName}</p>
                    <p className="text-xs text-slate-700 font-mono-num">
                      CPF: {dossierGuardian.cpf} · RG: {dossierGuardian.rg || 'Não informado'}
                    </p>
                    <p className="text-xs text-slate-700">
                      Nascimento: {formatDateBr(dossierGuardian.birthDate)}
                    </p>
                    <p className="text-xs text-slate-700">
                      E-mail: {dossierGuardian.email || 'Não informado'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <h3 className="text-xs font-semibold text-slate-500">Contatos e Endereço</h3>
                    <p className="text-xs text-slate-700">
                      Principal: {formatPhoneBr(dossierGuardian.primaryPhone)} · WhatsApp:{' '}
                      {formatPhoneBr(dossierGuardian.whatsapp)}
                    </p>
                    {dossierGuardian.alternativePhone && (
                      <p className="text-xs text-slate-700">
                        Alternativo: {formatPhoneBr(dossierGuardian.alternativePhone)}
                      </p>
                    )}
                    <p className="text-xs text-slate-700">
                      {dossierGuardian.street
                        ? `${dossierGuardian.street}, ${dossierGuardian.number || 'S/N'} ${dossierGuardian.complement} - ${dossierGuardian.neighborhood}, ${dossierGuardian.city}/${dossierGuardian.state} (CEP ${dossierGuardian.cep})`
                        : 'Endereço não informado'}
                    </p>
                    {dossierGuardian.notes && (
                      <p className="text-xs text-slate-500 pt-1">Obs.: {dossierGuardian.notes}</p>
                    )}
                  </div>
                </div>

                {/* Linked Children */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">
                    Crianças Vinculadas ({linkedChildren.length})
                  </h3>
                  {linkedChildren.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">Nenhuma criança vinculada ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {linkedChildren.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setDossierGuardianId(null);
                            onNavigate({ section: 'criancas', entityId: c.id });
                          }}
                          className="text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-sm text-slate-900">{c.fullName}</div>
                            <div className="text-xs text-slate-500">
                              Mensalidade: {formatCurrencyBr(c.tuitionAmount)}
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
                      ))}
                    </div>
                  )}
                </div>

                {/* Private Documents Section */}
                {canDocs && (
                  <div className="border-t border-slate-200 pt-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Documentos Privados (RG, CPF, CNH, Comprovante)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Armazenamento privado exclusivo desta instalação · PDF, JPG, JPEG, PNG ou
                          WEBP
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Categoria do documento"
                          value={docCategory}
                          onChange={(e) => setDocCategory(e.target.value as DocumentCategory)}
                          className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs bg-white"
                        >
                          {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <label className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-800 whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{docUploading ? 'Enviando...' : 'Anexar Documento'}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            disabled={docUploading}
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleDocumentUpload(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {docError && (
                      <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                        {docError}
                      </div>
                    )}

                    {dossierGuardian.documents.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                        Nenhum documento anexado para este responsável.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                        {dossierGuardian.documents.map((docItem) => (
                          <div
                            key={docItem.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 truncate">
                                  {DOC_CATEGORY_LABELS[docItem.category]} · {docItem.originalName}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Enviado em {formatDateBr(docItem.uploadedAt)} por{' '}
                                  {docItem.uploadedBy}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(docItem)}
                                className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Visualizar</span>
                              </button>
                              <a
                                href={`/api/files/${encodeURIComponent(docItem.fileId)}?download=1`}
                                className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Baixar</span>
                              </a>
                              <label className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer">
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Substituir</span>
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f)
                                      handleDocumentUpload(f, docItem.id, docItem.category);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {confirmDeleteDocId === docItem.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDocument(docItem.id)}
                                    className="min-h-[32px] px-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                                  >
                                    Confirmar exclusão
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteDocId(null)}
                                    className="min-h-[32px] px-2 text-xs text-slate-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteDocId(docItem.id)}
                                  className="min-h-[34px] px-2.5 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Excluir</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Guardian Financial History */}
                {canFinance && (
                  <div className="border-t border-slate-200 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Histórico de Mensalidades ({guardianTuitions.length})
                      </h3>
                      {guardianTuitions.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhuma mensalidade registrada.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
                          {guardianTuitions.map((t) => (
                            <div
                              key={t.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <span>
                                {formatMonthYearLabel(t.referenceMonth, t.referenceYear)} · Venc.{' '}
                                {formatDateBr(t.dueDate)}
                              </span>
                              <span className="font-mono-num font-semibold">
                                {formatCurrencyBr(t.paidAmount)} / {formatCurrencyBr(t.amount)} (
                                {t.status})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Histórico de Pagamentos ({allPayments.length})
                      </h3>
                      {allPayments.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhum pagamento registrado.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
                          {allPayments.map((p) => (
                            <div
                              key={p.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <span>
                                {formatDateBr(p.paymentDate)} · {p.method.toUpperCase()}
                              </span>
                              <span className="font-mono-num font-semibold text-emerald-700">
                                {formatCurrencyBr(p.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </Modal>

      {/* Private Document Preview Modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc ? previewDoc.originalName : 'Visualizar Documento'}
        size="lg"
      >
        {previewDoc && (
          <div className="space-y-3">
            {previewDoc.mimeType === 'application/pdf' ? (
              <iframe
                src={`/api/files/${encodeURIComponent(previewDoc.fileId)}`}
                title={previewDoc.originalName}
                className="w-full h-[65vh] rounded-xl border border-slate-200"
              />
            ) : (
              <img
                src={`/api/files/${encodeURIComponent(previewDoc.fileId)}`}
                alt={previewDoc.originalName}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] mx-auto rounded-xl border border-slate-200 object-contain"
              />
            )}
            <div className="flex justify-end">
              <a
                href={`/api/files/${encodeURIComponent(previewDoc.fileId)}?download=1`}
                className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Arquivo Original</span>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Edit3, Lock, Plus, Shield, Trash2, Unlock } from 'lucide-react';
import type { PublicUser, UserRole } from '@/lib/domain/types';
import { formatDateBr } from '@/lib/domain/cpf';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { WorkspacePayload } from '@/lib/client/workspace-types';

interface UsersViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
};

export function UsersView({ workspace, onRefresh }: UsersViewProps) {
  const { users, auditLogs, currentUser, settings } = workspace;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('operacional');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName('');
    setEmail('');
    setRole('operacional');
    setPassword('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(u: PublicUser) {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setPassword('');
    setError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await apiFetch('/api/users', {
          method: 'PATCH',
          body: JSON.stringify({
            id: editing.id,
            name,
            email,
            role,
            newPassword: password || undefined,
          }),
        });
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({ name, email, role, password }),
        });
      }
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(u: PublicUser) {
    setError(null);
    try {
      await apiFetch('/api/users', {
        method: 'PATCH',
        body: JSON.stringify({ id: u.id, active: !u.active }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/users?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      setConfirmDeleteId(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Usuários e Permissões
          </h1>
          <p className="text-sm text-slate-500">
            Perfis de acesso isolados para {settings.installationName}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-4 py-2 rounded-xl text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Usuário</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-900">{u.name}</span>
                <span className="text-xs font-medium text-slate-600">
                  · {ROLE_LABELS[u.role]}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    u.active ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  · {u.active ? 'Ativo' : 'Bloqueado'}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {u.email} · Último acesso: {u.lastLoginAt ? formatDateBr(u.lastLoginAt) : 'Nunca'}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openEdit(u)}
                className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
              {u.id !== currentUser.id && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1"
                  >
                    {u.active ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Bloquear</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Desbloquear</span>
                      </>
                    )}
                  </button>
                  {confirmDeleteId === u.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        className="min-h-[34px] px-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[34px] px-2 text-xs text-slate-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sanitized Audit Log */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Histórico de Auditoria</h2>
            <p className="text-xs text-slate-500">
              Registro de ações importantes (sem armazenamento de senhas, CPF ou RG)
            </p>
          </div>
        </div>
        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum evento registrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {auditLogs.slice(0, 100).map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{log.action}</span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="text-slate-700">{log.summary}</span>
                </div>
                <div className="text-slate-500 shrink-0 tabular-nums">
                  {log.actorName} ({ROLE_LABELS[log.actorRole]}) ·{' '}
                  {new Date(log.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Usuário · ${editing.name}` : 'Novo Usuário'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="u-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Nome completo *
            </label>
            <input
              id="u-name"
              type="text"
              required
              minLength={3}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label htmlFor="u-email" className="block text-xs font-semibold text-slate-700 mb-1">
              E-mail de acesso *
            </label>
            <input
              id="u-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label htmlFor="u-role" className="block text-xs font-semibold text-slate-700 mb-1">
              Perfil de acesso *
            </label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="admin">Administrador (acesso completo)</option>
              <option value="financeiro">Financeiro (mensalidades, pagamentos, responsáveis)</option>
              <option value="operacional">Operacional (crianças, escolas, veículos, passageiros)</option>
            </select>
          </div>
          <div>
            <label htmlFor="u-pass" className="block text-xs font-semibold text-slate-700 mb-1">
              {editing ? 'Nova senha (deixe em branco para manter)' : 'Senha (mínimo 6 caracteres) *'}
            </label>
            <input
              id="u-pass"
              type="password"
              required={!editing}
              minLength={editing ? undefined : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
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
              {saving ? 'Salvando...' : 'Salvar Usuário'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

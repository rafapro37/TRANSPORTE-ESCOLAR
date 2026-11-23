'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bus,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { InstallationId, PublicUser, ThemeConfig } from '@/lib/domain/types';
import {
  DEFAULT_THEME,
  INSTALLATION_LABELS,
  VALID_INSTALLATIONS,
} from '@/lib/domain/installations';
import { apiFetch, clearBoundInstallationId, setBoundInstallationId } from '@/lib/client/api';
import { BrandLogo } from './BrandLogo';

interface InstallationStatusResponse {
  installationId: InstallationId;
  installationLabel: string;
  hasUsers: boolean;
  theme: ThemeConfig;
}

interface SetupAndAuthProps {
  initialInstallationId: InstallationId | null;
  onAuthenticated: (installationId: InstallationId, user: PublicUser) => void;
}

export function SetupAndAuth({
  initialInstallationId,
  onAuthenticated,
}: SetupAndAuthProps) {
  const [selectedInstallation, setSelectedInstallation] = useState<InstallationId | null>(
    initialInstallationId
  );
  const [pendingChoice, setPendingChoice] = useState<InstallationId>('carro-01');
  const [statusLoading, setStatusLoading] = useState(false);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Bootstrap form (first admin)
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Password recovery mode
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recEmail, setRecEmail] = useState('');
  const [recAdminEmail, setRecAdminEmail] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');

  // Reset binding confirmation
  const [confirmUnbind, setConfirmUnbind] = useState(false);

  useEffect(() => {
    if (!selectedInstallation) return;
    let active = true;

    async function fetchStatus(id: InstallationId) {
      await Promise.resolve();
      if (!active) return;
      setStatusLoading(true);
      setError(null);
      try {
        const res = await apiFetch<InstallationStatusResponse>(
          `/api/installation/status?installationId=${encodeURIComponent(id)}`,
          { installationId: id }
        );
        if (!active) return;
        setHasUsers(res.hasUsers);
        setTheme(res.theme || DEFAULT_THEME);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao consultar instalação.');
      } finally {
        if (active) setStatusLoading(false);
      }
    }

    void fetchStatus(selectedInstallation);

    return () => {
      active = false;
    };
  }, [selectedInstallation]);

  function handleBindInstallation(id: InstallationId) {
    setBoundInstallationId(id);
    setSelectedInstallation(id);
    setConfirmUnbind(false);
    setError(null);
    setInfoMessage(null);
  }

  function handleUnbind() {
    clearBoundInstallationId();
    setSelectedInstallation(null);
    setHasUsers(null);
    setConfirmUnbind(false);
    setRecoveryOpen(false);
    setError(null);
    setInfoMessage(null);
  }

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallation) return;
    setError(null);

    if (adminPassword !== adminConfirm) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: PublicUser; installationId: InstallationId }>(
        '/api/auth/bootstrap',
        {
          method: 'POST',
          installationId: selectedInstallation,
          body: JSON.stringify({
            installationId: selectedInstallation,
            name: adminName,
            email: adminEmail,
            password: adminPassword,
          }),
        }
      );
      onAuthenticated(res.installationId, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao configurar administrador.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallation) return;
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: PublicUser; installationId: InstallationId }>(
        '/api/auth/session',
        {
          method: 'POST',
          installationId: selectedInstallation,
          body: JSON.stringify({
            installationId: selectedInstallation,
            email: loginEmail,
            password: loginPassword,
          }),
        }
      );
      onAuthenticated(res.installationId, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallation) return;
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/recover', {
        method: 'POST',
        installationId: selectedInstallation,
        body: JSON.stringify({
          installationId: selectedInstallation,
          mode: 'reset_with_admin_verification',
          email: recEmail,
          adminEmail: recAdminEmail,
          newPassword: recNewPassword,
        }),
      });
      setInfoMessage(res.message);
      setRecoveryOpen(false);
      setRecNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  // =====================================================================
  // SCREEN 1: INSTALLATION SELECTION (CARRO 01, CARRO 02, CARRO 03)
  // =====================================================================
  if (!selectedInstallation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <BrandLogo logoFileId={null} size="md" />
                <div>
                  <p className="text-xs font-medium text-rose-300">Gestão de Transporte Escolar</p>
                  <h1 className="text-lg font-bold tracking-tight text-white">
                    ELEFANTE ROSA
                  </h1>
                </div>
              </div>
              <h2 className="text-2xl font-bold leading-tight text-balance">
                Configuração Inicial da Instalação
              </h2>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Cada celular opera com uma base de dados completamente independente, sem
                sincronização ou mistura de registros entre os três veículos.
              </p>
            </div>

            <div className="mt-8 space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Isolamento real no servidor: cadastros, mensalidades, fotos e documentos
                  ficam restritos ao veículo selecionado.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Troca ou formatação de aparelho: selecione o mesmo veículo e acesse com sua
                  conta para recuperar todos os dados e backups.
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Selecione o veículo deste aparelho
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Após confirmar, este dispositivo ficará vinculado exclusivamente ao veículo
                escolhido.
              </p>

              <div className="mt-6 space-y-3" role="radiogroup" aria-label="Selecionar veículo">
                {VALID_INSTALLATIONS.map((id) => {
                  const selected = pendingChoice === id;
                  const label = INSTALLATION_LABELS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPendingChoice(id)}
                      className={`w-full min-h-[68px] text-left px-4 py-3.5 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                        selected
                          ? 'border-rose-600 bg-rose-50/70 text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            selected ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Bus className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-base text-slate-900">{label}</div>
                          <div className="text-xs text-slate-500">
                            Base isolada · Identificador: {id.toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-rose-600' : 'border-slate-300'
                        }`}
                      >
                        {selected && <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Instalação selecionada: <strong className="text-slate-800">{INSTALLATION_LABELS[pendingChoice]}</strong>
              </span>
              <button
                type="button"
                onClick={() => handleBindInstallation(pendingChoice)}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors whitespace-nowrap"
              >
                Vincular ao {INSTALLATION_LABELS[pendingChoice]}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // SCREEN 2: FIRST ADMIN SETUP OR LOGIN
  // =====================================================================
  const label = INSTALLATION_LABELS[selectedInstallation];
  const primaryColor = theme.primaryColor || '#e11d62';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: theme.backgroundColor || '#f8fafc' }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo logoFileId={theme.logoFileId} size="md" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">
                ELEFANTE ROSA
              </h1>
              <p className="text-xs text-slate-500 truncate">
                3 Carros Escolares · <strong className="text-slate-800">{label}</strong>
              </p>
            </div>
          </div>
          {!confirmUnbind ? (
            <button
              type="button"
              onClick={() => setConfirmUnbind(true)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline underline-offset-2 shrink-0 py-2 px-1"
            >
              Trocar veículo
            </button>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleUnbind}
                className="text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg hover:bg-rose-100"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmUnbind(false)}
                className="text-xs text-slate-600 px-2 py-1.5"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {statusLoading || hasUsers === null ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Verificando instalação do {label}...
          </div>
        ) : !hasUsers ? (
          <form onSubmit={handleBootstrapSubmit} className="mt-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UserCheck className="w-4 h-4 text-rose-600" />
                <span>Primeiro Acesso · {label}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Crie a conta do Administrador principal para iniciar esta instalação isolada.
              </p>
            </div>

            <div>
              <label htmlFor="admin-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome completo
              </label>
              <input
                id="admin-name"
                type="text"
                required
                minLength={3}
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Ex.: Maria Oliveira"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail de acesso
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@elefanterosa.com.br"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Senha (mínimo 6 caracteres)
              </label>
              <input
                id="admin-password"
                type="password"
                required
                minLength={6}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label htmlFor="admin-confirm" className="block text-xs font-semibold text-slate-700 mb-1">
                Confirmar senha
              </label>
              <input
                id="admin-confirm"
                type="password"
                required
                minLength={6}
                value={adminConfirm}
                onChange={(e) => setAdminConfirm(e.target.value)}
                placeholder="••••••"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: primaryColor }}
              className="w-full min-h-[46px] rounded-xl text-white font-semibold text-sm hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {submitting ? 'Configurando...' : `Criar Administrador (${label})`}
            </button>
          </form>
        ) : recoveryOpen ? (
          <form onSubmit={handleRecoverySubmit} className="mt-5 space-y-4">
            <button
              type="button"
              onClick={() => {
                setRecoveryOpen(false);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para o login
            </button>

            <div>
              <h2 className="text-base font-semibold text-slate-900">Recuperação de Senha</h2>
              <p className="text-xs text-slate-500 mt-1">
                Informe seu e-mail cadastrado e confirme com o e-mail do Administrador do{' '}
                {label} para redefinir sua senha.
              </p>
            </div>

            <div>
              <label htmlFor="rec-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Seu e-mail cadastrado
              </label>
              <input
                id="rec-email"
                type="email"
                required
                value={recEmail}
                onChange={(e) => setRecEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label htmlFor="rec-admin" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail do Administrador da instalação
              </label>
              <input
                id="rec-admin"
                type="email"
                required
                value={recAdminEmail}
                onChange={(e) => setRecAdminEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label htmlFor="rec-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                Nova senha (mínimo 6 caracteres)
              </label>
              <input
                id="rec-pass"
                type="password"
                required
                minLength={6}
                value={recNewPassword}
                onChange={(e) => setRecNewPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: primaryColor }}
              className="w-full min-h-[46px] rounded-xl text-white font-semibold text-sm hover:opacity-95 disabled:opacity-60"
            >
              {submitting ? 'Redefinindo...' : 'Redefinir Senha'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Entrar no Sistema</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Acesso exclusivo à base de dados do {label}
              </p>
            </div>

            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail ou usuário
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="text"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryOpen(true);
                    setError(null);
                  }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: primaryColor }}
              className="w-full min-h-[46px] rounded-xl text-white font-semibold text-sm hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{submitting ? 'Entrando...' : 'Entrar'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  HardDriveUpload,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { BackupMetadata } from '@/lib/domain/types';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import type { WorkspacePayload } from '@/lib/client/workspace-types';

interface BackupViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}

export function BackupView({ workspace, onRefresh }: BackupViewProps) {
  const { backups, settings } = workspace;

  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(settings.autoBackupEnabled);
  const [autoHours, setAutoHours] = useState(String(settings.autoBackupIntervalHours));

  const [restoreTarget, setRestoreTarget] = useState<BackupMetadata | null>(null);
  const [uploadRestoreFile, setUploadRestoreFile] = useState<File | null>(null);
  const [confirmRestoreModal, setConfirmRestoreModal] = useState(false);
  const [allowOverride, setAllowOverride] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastBackup = backups[0] ?? null;

  async function handleCreateBackup() {
    setError(null);
    setFeedback(null);
    setCreating(true);
    try {
      const res = await apiFetch<{ backup: BackupMetadata }>('/api/backups', {
        method: 'POST',
      });
      await onRefresh();
      setFeedback(
        `Backup completo gerado (${res.backup.counts.children} crianças, ${res.backup.counts.files} arquivo(s) privado(s)).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar backup.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingSchedule(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          autoBackupEnabled: autoEnabled,
          autoBackupIntervalHours: Number(autoHours),
        }),
      });
      await onRefresh();
      setFeedback('Agendamento de backup automático atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar agendamento.');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleConfirmRestore() {
    setError(null);
    setFeedback(null);
    setRestoring(true);
    try {
      let res: {
        restoredCounts: BackupMetadata['counts'];
        sourceInstallationId: string;
      };
      if (uploadRestoreFile) {
        const fd = new FormData();
        fd.append('file', uploadRestoreFile);
        fd.append('allowOverride', String(allowOverride));
        res = await apiFetch('/api/backups', {
          method: 'PUT',
          body: fd,
        });
      } else if (restoreTarget) {
        res = await apiFetch('/api/backups', {
          method: 'PUT',
          body: JSON.stringify({
            backupId: restoreTarget.id,
            allowOverride,
          }),
        });
      } else {
        throw new Error('Nenhum backup selecionado para restauração.');
      }

      await onRefresh();
      setConfirmRestoreModal(false);
      setRestoreTarget(null);
      setUploadRestoreFile(null);
      setAllowOverride(false);
      setFeedback(
        `Restauração concluída com sucesso (${res.restoredCounts.children} crianças, ${res.restoredCounts.guardians} responsáveis e ${res.restoredCounts.files} fotos/documentos recuperados).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na restauração do backup.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            BACKUP E RESTAURAÇÃO
          </h1>
          <p className="text-sm text-slate-500">
            Pacote completo e isolado do <strong>{settings.installationName}</strong> (dados +
            fotos + documentos privados)
          </p>
        </div>

        <button
          type="button"
          disabled={creating}
          onClick={handleCreateBackup}
          style={{ backgroundColor: settings.theme.buttonColor || settings.theme.primaryColor }}
          className="min-h-[44px] px-5 py-2 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 whitespace-nowrap"
        >
          <Archive className="w-4 h-4" />
          <span>{creating ? 'Gerando Backup...' : 'Gerar Backup Manual Agora'}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary & Auto-Backup Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            <span>Identificação e Estado do Backup</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Instalação / Veículo</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {settings.installationName} ({settings.installationId.toUpperCase()})
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Último Backup</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {lastBackup
                  ? new Date(lastBackup.createdAt).toLocaleString('pt-BR')
                  : 'Nenhum realizado'}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Cada arquivo <code>.zip</code> inclui o banco de dados completo e todas as fotografias
            e documentos anexados com verificação criptográfica SHA-256.
          </p>
        </div>

        <form
          onSubmit={handleSaveSchedule}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-slate-900">Backup Automático Programado</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span>Ativar backup automático no servidor</span>
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="bkp-hours" className="text-xs text-slate-600">
                A cada (horas):
              </label>
              <input
                id="bkp-hours"
                type="number"
                min={1}
                max={720}
                value={autoHours}
                onChange={(e) => setAutoHours(e.target.value)}
                className="w-20 min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Último automático:{' '}
              {settings.lastAutoBackupAt
                ? new Date(settings.lastAutoBackupAt).toLocaleString('pt-BR')
                : 'Ainda não executado'}
            </span>
            <button
              type="submit"
              disabled={savingSchedule}
              className="min-h-[38px] px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {savingSchedule ? 'Salvando...' : 'Salvar Programação'}
            </button>
          </div>
        </form>
      </div>

      {/* External Package Restore */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Restaurar a partir de Arquivo Externo (.zip)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Utilize esta opção após formatação ou troca de aparelho usando uma cópia externa do{' '}
            {settings.installationName}.
          </p>
        </div>
        <label className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer shrink-0">
          <HardDriveUpload className="w-4 h-4" />
          <span>Selecionar Pacote .ZIP</span>
          <input
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setRestoreTarget(null);
                setUploadRestoreFile(f);
                setAllowOverride(false);
                setConfirmRestoreModal(true);
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* Backup History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Histórico de Backups ({backups.length})
          </h2>
        </div>

        {backups.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum backup gerado para esta instalação ainda. Clique em{' '}
            <strong>Gerar Backup Manual Agora</strong>.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backups.map((b) => (
              <div
                key={b.id}
                className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">
                      {new Date(b.createdAt).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs text-slate-500">
                      · {b.type === 'manual' ? 'Manual' : 'Automático'} · {b.installationLabel}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 tabular-nums">
                    {b.counts.children} criança(s) · {b.counts.guardians} responsável(is) ·{' '}
                    {b.counts.tuitions} mensalidade(s) · {b.counts.files} foto(s)/documento(s) ·{' '}
                    {(b.sizeBytes / 1024).toFixed(1)} KB
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-400 truncate">
                    SHA-256: {b.sha256}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/api/backups?download=${encodeURIComponent(b.id)}`}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar .ZIP</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadRestoreFile(null);
                      setRestoreTarget(b);
                      setAllowOverride(false);
                      setConfirmRestoreModal(true);
                    }}
                    className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation & Integrity Warning Modal */}
      <Modal
        open={confirmRestoreModal}
        onClose={() => {
          setConfirmRestoreModal(false);
          setRestoreTarget(null);
          setUploadRestoreFile(null);
        }}
        title="Confirmar Restauração de Backup"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Atenção antes de restaurar</div>
              <p>
                Esta ação substituirá todos os cadastros, mensalidades, fotos e documentos atuais
                do <strong>{settings.installationName}</strong> pelo conteúdo do backup
                selecionado. Um backup de segurança pré-restauração será salvo automaticamente antes
                da substituição.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
            {uploadRestoreFile ? (
              <div>
                Arquivo selecionado: <strong>{uploadRestoreFile.name}</strong> (
                {(uploadRestoreFile.size / 1024).toFixed(1)} KB)
              </div>
            ) : restoreTarget ? (
              <div>
                Backup selecionado:{' '}
                <strong>{new Date(restoreTarget.createdAt).toLocaleString('pt-BR')}</strong> ·{' '}
                {restoreTarget.installationLabel}
              </div>
            ) : null}
          </div>

          {uploadRestoreFile && (
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowOverride}
                onChange={(e) => setAllowOverride(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 mt-0.5"
              />
              <span>
                Procedimento administrativo explícito: permitir restauração somente se eu confirmar
                que este pacote deve sobrescrever o {settings.installationName} (por padrão,
                backups de outro veículo são bloqueados).
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmRestoreModal(false)}
              className="min-h-[42px] px-4 rounded-xl border border-slate-300 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={restoring}
              onClick={handleConfirmRestore}
              className="min-h-[42px] px-5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
            >
              {restoring ? 'Verificando e Restaurando...' : 'Confirmar Restauração'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

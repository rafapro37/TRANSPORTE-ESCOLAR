'use client';

import React, { useState } from 'react';
import { CheckCircle2, Palette, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { ThemeConfig } from '@/lib/domain/types';
import { DEFAULT_THEME } from '@/lib/domain/installations';
import { apiFetch } from '@/lib/client/api';
import { extractDominantColorsFromImageFile } from '@/lib/client/export';
import { BrandLogo } from '@/components/BrandLogo';
import type { WorkspacePayload } from '@/lib/client/workspace-types';

interface SettingsViewProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onPreviewTheme: (theme: ThemeConfig | null) => void;
}

export function SettingsView({
  workspace,
  onRefresh,
  onPreviewTheme,
}: SettingsViewProps) {
  const { settings } = workspace;

  const [draftTheme, setDraftTheme] = useState<ThemeConfig>(settings.theme);
  const [suggestedColors, setSuggestedColors] = useState<string[]>([]);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null);
  const [previewLive, setPreviewLive] = useState(false);

  const [defaultAmount, setDefaultAmount] = useState(String(settings.defaultTuitionAmount));
  const [defaultDueDay, setDefaultDueDay] = useState(String(settings.defaultDueDay));

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateThemeField(field: keyof ThemeConfig, value: string) {
    const next = { ...draftTheme, [field]: value };
    setDraftTheme(next);
    if (previewLive) {
      onPreviewTheme(next);
    }
  }

  async function handleLogoSelect(file: File | null) {
    if (pendingLogoPreview) {
      URL.revokeObjectURL(pendingLogoPreview);
    }
    if (!file) {
      setPendingLogoFile(null);
      setPendingLogoPreview(null);
      return;
    }
    setPendingLogoFile(file);
    setPendingLogoPreview(URL.createObjectURL(file));

    const colors = await extractDominantColorsFromImageFile(file);
    setSuggestedColors(colors);
  }

  function applySuggestedPalette() {
    if (suggestedColors.length === 0) return;
    const next: ThemeConfig = {
      ...draftTheme,
      primaryColor: suggestedColors[0] || draftTheme.primaryColor,
      buttonColor: suggestedColors[0] || draftTheme.buttonColor,
      secondaryColor: suggestedColors[1] || draftTheme.secondaryColor,
      highlightColor: suggestedColors[2] || suggestedColors[0] || draftTheme.highlightColor,
    };
    setDraftTheme(next);
    if (previewLive) onPreviewTheme(next);
  }

  function toggleLivePreview() {
    const next = !previewLive;
    setPreviewLive(next);
    onPreviewTheme(next ? draftTheme : null);
  }

  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      if (pendingLogoFile) {
        const fd = new FormData();
        fd.append('targetType', 'logo');
        fd.append('file', pendingLogoFile);
        await apiFetch('/api/files/upload', {
          method: 'POST',
          body: fd,
        });
      }

      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          defaultTuitionAmount: Number(defaultAmount),
          defaultDueDay: Number(defaultDueDay),
          theme: {
            primaryColor: draftTheme.primaryColor,
            secondaryColor: draftTheme.secondaryColor,
            buttonColor: draftTheme.buttonColor,
            menuColor: draftTheme.menuColor,
            backgroundColor: draftTheme.backgroundColor,
            textColor: draftTheme.textColor,
            highlightColor: draftTheme.highlightColor,
          },
        }),
      });

      setPendingLogoFile(null);
      if (pendingLogoPreview) URL.revokeObjectURL(pendingLogoPreview);
      setPendingLogoPreview(null);
      setPreviewLive(false);
      onPreviewTheme(null);
      await onRefresh();
      setFeedback('Identidade visual e configurações salvas para esta instalação.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveLogo() {
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'remove_logo' }),
      });
      setPendingLogoFile(null);
      setPendingLogoPreview(null);
      setDraftTheme((prev) => ({ ...prev, logoFileId: null, logoMimeType: null }));
      await onRefresh();
      setFeedback('Logotipo personalizado removido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover logotipo.');
    }
  }

  function handleResetDefaultColors() {
    const next: ThemeConfig = {
      ...DEFAULT_THEME,
      logoFileId: draftTheme.logoFileId,
      logoMimeType: draftTheme.logoMimeType,
    };
    setDraftTheme(next);
    if (previewLive) onPreviewTheme(next);
  }

  const colorPickers: Array<{ key: keyof ThemeConfig; label: string }> = [
    { key: 'primaryColor', label: 'Cor Principal' },
    { key: 'secondaryColor', label: 'Cor Secundária' },
    { key: 'buttonColor', label: 'Botões' },
    { key: 'menuColor', label: 'Menu Lateral' },
    { key: 'backgroundColor', label: 'Fundo da Tela' },
    { key: 'textColor', label: 'Textos' },
    { key: 'highlightColor', label: 'Destaques' },
  ];

  return (
    <form onSubmit={handleSaveAll} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Configurações e Identidade Visual
          </h1>
          <p className="text-sm text-slate-500">
            Personalização individual para o <strong>{settings.installationName}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLivePreview}
            className={`min-h-[42px] px-4 rounded-xl border text-xs font-semibold transition-colors ${
              previewLive
                ? 'border-rose-600 bg-rose-50 text-rose-700'
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            {previewLive ? 'Pré-visualização Ativa' : 'Visualizar Alterações'}
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ backgroundColor: draftTheme.buttonColor }}
            className="min-h-[42px] px-5 rounded-xl text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Confirmar e Salvar'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Logo Upload + Dominant Colors */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Logotipo da Instalação</h2>
          <div className="flex items-center gap-4">
            <BrandLogo
              logoFileId={draftTheme.logoFileId}
              previewUrl={pendingLogoPreview}
              size="lg"
            />
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Aceita PNG, JPG, JPEG e WEBP. Visualize a logo e as cores sugeridas antes de
                salvar.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{draftTheme.logoFileId ? 'Substituir Logo' : 'Enviar Logo'}</span>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="sr-only"
                    onChange={(e) => handleLogoSelect(e.target.files?.[0] ?? null)}
                  />
                </label>
                {(draftTheme.logoFileId || pendingLogoPreview) && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {suggestedColors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-rose-600" />
                  Cores predominantes detectadas
                </span>
                <button
                  type="button"
                  onClick={applySuggestedPalette}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline"
                >
                  Aplicar paleta sugerida
                </button>
              </div>
              <div className="flex items-center gap-2">
                {suggestedColors.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => updateThemeField('primaryColor', hex)}
                    title={`Usar ${hex} como cor principal`}
                    className="w-8 h-8 rounded-lg border border-slate-300"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Financial Defaults */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Parâmetros Financeiros Padrão</h3>
            <p className="text-xs text-slate-500">
              Alterar o valor padrão afeta apenas novas crianças e novas mensalidades, preservando
              lançamentos antigos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="s-amount" className="block text-xs font-semibold text-slate-700 mb-1">
                  Mensalidade padrão (R$)
                </label>
                <input
                  id="s-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={defaultAmount}
                  onChange={(e) => setDefaultAmount(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label htmlFor="s-day" className="block text-xs font-semibold text-slate-700 mb-1">
                  Dia de vencimento
                </label>
                <input
                  id="s-day"
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={defaultDueDay}
                  onChange={(e) => setDefaultDueDay(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Color Pickers + Visual Preview Box */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Personalização de Cores</h2>
            <button
              type="button"
              onClick={handleResetDefaultColors}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar padrão Elefante Rosa</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {colorPickers.map(({ key, label }) => {
              const val = String(draftTheme[key] || '#000000');
              return (
                <div
                  key={key}
                  className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                >
                  <label htmlFor={`color-${key}`} className="text-xs font-semibold text-slate-800">
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono-num text-slate-500 uppercase">{val}</span>
                    <input
                      id={`color-${key}`}
                      type="color"
                      value={val}
                      onChange={(e) => updateThemeField(key, e.target.value)}
                      className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer bg-transparent"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini Preview */}
          <div
            className="rounded-xl border border-slate-200 p-4 space-y-3"
            style={{ backgroundColor: draftTheme.backgroundColor, color: draftTheme.textColor }}
          >
            <div className="text-xs font-semibold opacity-70">Prévia da Identidade Visual</div>
            <div
              className="rounded-xl p-3 border border-slate-200 flex items-center justify-between gap-3"
              style={{ backgroundColor: draftTheme.menuColor }}
            >
              <div className="flex items-center gap-2.5">
                <BrandLogo
                  logoFileId={draftTheme.logoFileId}
                  previewUrl={pendingLogoPreview}
                  size="sm"
                />
                <div>
                  <div className="text-sm font-bold" style={{ color: draftTheme.secondaryColor }}>
                    ELEFANTE ROSA
                  </div>
                  <div className="text-xs font-medium" style={{ color: draftTheme.highlightColor }}>
                    {settings.installationName}
                  </div>
                </div>
              </div>
              <span
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: draftTheme.buttonColor }}
              >
                Botão Principal
              </span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

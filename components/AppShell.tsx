'use client';

import React, { useMemo, useState } from 'react';
import {
  Archive,
  Baby,
  BarChart3,
  Building2,
  Bus,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { ThemeConfig } from '@/lib/domain/types';
import { formatCurrencyBr, formatPhoneBr, normalizeCpf } from '@/lib/domain/cpf';
import { formatMonthYearLabel } from '@/lib/domain/finance';
import { hasRolePermission } from '@/lib/domain/installations';
import type {
  NavSectionId,
  NavigationFocusTarget,
  WorkspacePayload,
} from '@/lib/client/workspace-types';
import { BrandLogo } from './BrandLogo';
import { DashboardView } from './views/DashboardView';
import { SchoolsView } from './views/SchoolsView';
import { GuardiansView } from './views/GuardiansView';
import { ChildrenView } from './views/ChildrenView';
import { VehiclesView } from './views/VehiclesView';
import { PassengersView } from './views/PassengersView';
import { FinanceView } from './views/FinanceView';
import { ReportsView } from './views/ReportsView';
import { UsersView } from './views/UsersView';
import { BackupView } from './views/BackupView';
import { SettingsView } from './views/SettingsView';

interface AppShellProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  area: Parameters<typeof hasRolePermission>[1];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, area: 'dashboard' },
  { id: 'criancas', label: 'Crianças', icon: Baby, area: 'children' },
  { id: 'responsaveis', label: 'Responsáveis', icon: Users, area: 'guardians' },
  { id: 'escolas', label: 'Escolas', icon: Building2, area: 'schools' },
  { id: 'veiculos', label: 'Veículos', icon: Bus, area: 'vehicles' },
  { id: 'passageiros', label: 'Passageiros', icon: ClipboardList, area: 'passengers' },
  { id: 'financeiro', label: 'Financeiro', icon: CreditCard, area: 'finance' },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3, area: 'reports_general' },
  { id: 'usuarios', label: 'Usuários', icon: UserCheck, area: 'users' },
  { id: 'backup', label: 'Backup e Restauração', icon: Archive, area: 'backup' },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, area: 'settings' },
];

export function AppShell({ workspace, onRefresh, onLogout }: AppShellProps) {
  const { currentUser, settings, children, guardians, schools, vehicles, tuitions } = workspace;

  const [activeSection, setActiveSection] = useState<NavSectionId>('dashboard');
  const [focusEntityId, setFocusEntityId] = useState<string | undefined>(undefined);
  const [focusAction, setFocusAction] = useState<string | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<ThemeConfig | null>(null);

  const activeTheme = previewTheme ?? settings.theme;
  const visibleNav = NAV_ITEMS.filter((item) =>
    hasRolePermission(currentUser.role, item.area)
  );

  const canFinance = hasRolePermission(currentUser.role, 'finance');
  const canDocs = hasRolePermission(currentUser.role, 'documents_sensitive');

  function handleNavigate(target: NavigationFocusTarget) {
    setActiveSection(target.section);
    setFocusEntityId(target.entityId);
    setFocusAction(target.action);
    setMobileMenuOpen(false);
    setSearchFocused(false);
  }

  // Global search results respecting user RBAC & installation scope
  const searchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    const qDigits = globalQuery.replace(/\D/g, '');
    if (q.length < 2) return [];

    const results: Array<{
      id: string;
      category: string;
      title: string;
      subtitle: string;
      target: NavigationFocusTarget;
    }> = [];

    if (hasRolePermission(currentUser.role, 'children')) {
      for (const c of children) {
        if (c.fullName.toLowerCase().includes(q)) {
          results.push({
            id: `c-${c.id}`,
            category: 'Criança',
            title: c.fullName,
            subtitle: `${schools.find((s) => s.id === c.schoolId)?.name || ''} · ${c.active ? 'Ativa' : 'Inativa'}`,
            target: { section: 'criancas', entityId: c.id },
          });
        }
      }
    }

    if (hasRolePermission(currentUser.role, 'guardians')) {
      for (const g of guardians) {
        const matchText =
          g.fullName.toLowerCase().includes(q) ||
          (canDocs && g.rg.toLowerCase().includes(q)) ||
          (canDocs && qDigits.length >= 3 && normalizeCpf(g.cpf).includes(qDigits)) ||
          (qDigits.length >= 3 &&
            (g.primaryPhone.replace(/\D/g, '').includes(qDigits) ||
              g.whatsapp.replace(/\D/g, '').includes(qDigits)));
        if (matchText) {
          results.push({
            id: `g-${g.id}`,
            category: 'Responsável',
            title: g.fullName,
            subtitle: `${formatPhoneBr(g.whatsapp || g.primaryPhone)}${canDocs ? ` · CPF ${g.cpf}` : ''}`,
            target: { section: 'responsaveis', entityId: g.id },
          });
        }
      }
    }

    if (hasRolePermission(currentUser.role, 'schools')) {
      for (const s of schools) {
        if (s.name.toLowerCase().includes(q)) {
          results.push({
            id: `s-${s.id}`,
            category: 'Escola',
            title: s.name,
            subtitle: s.active ? 'Ativa' : 'Inativa',
            target: { section: 'escolas', entityId: s.id },
          });
        }
      }
    }

    if (hasRolePermission(currentUser.role, 'vehicles')) {
      for (const v of vehicles) {
        if (
          v.name.toLowerCase().includes(q) ||
          v.plate.toLowerCase().includes(q) ||
          v.driverName.toLowerCase().includes(q) ||
          v.helperName.toLowerCase().includes(q)
        ) {
          results.push({
            id: `v-${v.id}`,
            category: 'Veículo / Equipe',
            title: v.name,
            subtitle: `Motorista: ${v.driverName || '—'} · Ajudante: ${v.helperName || '—'}`,
            target: { section: 'veiculos', entityId: v.id },
          });
        }
      }
    }

    if (canFinance) {
      for (const t of tuitions) {
        const child = children.find((c) => c.id === t.childId);
        const refLabel = formatMonthYearLabel(t.referenceMonth, t.referenceYear).toLowerCase();
        if (
          (child?.fullName.toLowerCase().includes(q) ?? false) ||
          refLabel.includes(q) ||
          t.status.includes(q)
        ) {
          results.push({
            id: `t-${t.id}`,
            category: 'Mensalidade',
            title: `${child?.fullName || 'Criança'} (${formatMonthYearLabel(t.referenceMonth, t.referenceYear)})`,
            subtitle: `${formatCurrencyBr(t.amount)} · Situação: ${t.status}`,
            target: { section: 'financeiro', entityId: t.id },
          });
        }
      }
    }

    return results.slice(0, 12);
  }, [globalQuery, children, guardians, schools, vehicles, tuitions, currentUser.role, canDocs, canFinance]);

  // Mobile quick bottom tabs (up to 4 permitted + Menu button)
  const mobileQuickTabs = visibleNav.filter((item) =>
    ['dashboard', 'criancas', canFinance ? 'financeiro' : 'escolas', 'passageiros'].includes(
      item.id
    )
  ).slice(0, 4);

  const cssVars = {
    '--brand-primary': activeTheme.primaryColor,
    '--brand-secondary': activeTheme.secondaryColor,
    '--brand-button': activeTheme.buttonColor,
    '--brand-menu': activeTheme.menuColor,
    '--brand-bg': activeTheme.backgroundColor,
    '--brand-text': activeTheme.textColor,
    '--brand-accent': activeTheme.highlightColor,
  } as React.CSSProperties;

  return (
    <div
      style={{
        ...cssVars,
        backgroundColor: activeTheme.backgroundColor,
        color: activeTheme.textColor,
      }}
      className="min-h-screen flex flex-col lg:flex-row"
    >
      {/* Desktop Sidebar */}
      <aside
        style={{ backgroundColor: activeTheme.menuColor }}
        className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 z-30 no-print"
      >
        <div className="p-5 border-b border-slate-200 flex items-center gap-3">
          <BrandLogo logoFileId={activeTheme.logoFileId} size="md" />
          <div className="min-w-0">
            <div
              className="font-bold text-sm truncate"
              style={{ color: activeTheme.secondaryColor }}
            >
              ELEFANTE ROSA
            </div>
            <div
              className="text-xs font-semibold truncate"
              style={{ color: activeTheme.highlightColor }}
            >
              {settings.installationName}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Menu principal">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate({ section: item.id })}
                style={
                  active
                    ? { backgroundColor: activeTheme.primaryColor, color: '#ffffff' }
                    : undefined
                }
                className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors text-left ${
                  active ? 'shadow-xs' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="text-xs">
            <div className="font-semibold text-slate-900 truncate">{currentUser.name}</div>
            <div className="text-slate-500 truncate">{currentUser.email}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Bar (compact on mobile <= 56px) */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 h-14 lg:h-16 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 lg:hidden min-w-0">
            <BrandLogo logoFileId={activeTheme.logoFileId} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">
                {settings.installationName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">ELEFANTE ROSA</div>
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={globalQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Pesquisa geral: criança, responsável, escola, veículo..."
              aria-label="Pesquisa geral"
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {searchFocused && globalQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-12 bg-white border border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto z-40">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">
                    Nenhum resultado encontrado nesta instalação.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleNavigate(r.target);
                          setGlobalQuery('');
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {r.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{r.subtitle}</div>
                        </div>
                        <span className="text-[11px] font-medium text-rose-600 shrink-0">
                          {r.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              {settings.installationName}
            </span>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 pb-20 lg:pb-8 max-w-7xl w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView workspace={workspace} onNavigate={handleNavigate} />
          )}
          {activeSection === 'criancas' && (
            <ChildrenView
              key={`criancas-${focusEntityId ?? ''}-${focusAction ?? ''}`}
              workspace={workspace}
              onRefresh={onRefresh}
              onNavigate={handleNavigate}
              focusEntityId={focusEntityId}
              initialAction={focusAction}
            />
          )}
          {activeSection === 'responsaveis' && (
            <GuardiansView
              key={`responsaveis-${focusEntityId ?? ''}`}
              workspace={workspace}
              onRefresh={onRefresh}
              onNavigate={handleNavigate}
              focusEntityId={focusEntityId}
            />
          )}
          {activeSection === 'escolas' && (
            <SchoolsView
              workspace={workspace}
              onRefresh={onRefresh}
              onNavigate={handleNavigate}
            />
          )}
          {activeSection === 'veiculos' && (
            <VehiclesView
              workspace={workspace}
              onRefresh={onRefresh}
              onNavigate={handleNavigate}
            />
          )}
          {activeSection === 'passageiros' && (
            <PassengersView
              key={`passageiros-${focusEntityId ?? ''}`}
              workspace={workspace}
              onRefresh={onRefresh}
              focusVehicleId={focusEntityId}
            />
          )}
          {activeSection === 'financeiro' && (
            <FinanceView
              key={`financeiro-${focusEntityId ?? ''}`}
              workspace={workspace}
              onRefresh={onRefresh}
              focusTuitionId={focusEntityId}
            />
          )}
          {activeSection === 'relatorios' && <ReportsView workspace={workspace} />}
          {activeSection === 'usuarios' && (
            <UsersView workspace={workspace} onRefresh={onRefresh} />
          )}
          {activeSection === 'backup' && (
            <BackupView workspace={workspace} onRefresh={onRefresh} />
          )}
          {activeSection === 'configuracoes' && (
            <SettingsView
              workspace={workspace}
              onRefresh={onRefresh}
              onPreviewTheme={setPreviewTheme}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (56px height) */}
      <nav
        aria-label="Navegação rápida móvel"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center no-print"
      >
        {mobileQuickTabs.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate({ section: item.id })}
              style={active ? { color: activeTheme.primaryColor } : undefined}
              className={`h-full flex flex-col items-center justify-center gap-0.5 ${
                active ? 'font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] leading-none truncate max-w-[68px]">
                {item.id === 'dashboard' ? 'Início' : item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu completo"
          className="h-full flex flex-col items-center justify-center gap-0.5 text-slate-600"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] leading-none">Menu</span>
        </button>
      </nav>

      {/* Mobile Full Menu Sheet */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Menu completo"
        >
          <div className="w-full bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">{settings.installationName}</div>
                <div className="text-xs text-slate-500">
                  {currentUser.name} · {currentUser.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate({ section: item.id })}
                    style={
                      active
                        ? { backgroundColor: activeTheme.primaryColor, color: '#ffffff' }
                        : undefined
                    }
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-left ${
                      active ? '' : 'bg-slate-50 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="w-full min-h-[46px] rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

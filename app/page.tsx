'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { InstallationId, PublicUser } from '@/lib/domain/types';
import {
  apiFetch,
  getBoundInstallationId,
  setBoundInstallationId,
} from '@/lib/client/api';
import type { WorkspacePayload } from '@/lib/client/workspace-types';
import { SetupAndAuth } from '@/components/SetupAndAuth';
import { AppShell } from '@/components/AppShell';

export default function HomePage() {
  const [booting, setBooting] = useState(true);
  const [boundInstallationId, setBoundIdState] = useState<InstallationId | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (installationId: InstallationId) => {
    setLoadError(null);
    const data = await apiFetch<WorkspacePayload>('/api/workspace', {
      installationId,
    });
    setWorkspace(data);
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const localBound = getBoundInstallationId();
        if (localBound) {
          setBoundIdState(localBound);
        }

        const sessionRes = await apiFetch<{
          authenticated: boolean;
          installationId?: InstallationId;
          user: PublicUser | null;
        }>('/api/auth/session', {
          installationId: localBound,
        });

        if (!active) return;

        if (sessionRes.authenticated && sessionRes.installationId) {
          setBoundInstallationId(sessionRes.installationId);
          setBoundIdState(sessionRes.installationId);
          await loadWorkspace(sessionRes.installationId);
        }
      } catch (err) {
        if (!active) return;
        // If session belonged to another vehicle or expired, show login/setup cleanly
        setWorkspace(null);
        const msg = err instanceof Error ? err.message : null;
        if (msg && !msg.includes('401')) {
          setLoadError(msg);
        }
      } finally {
        if (active) setBooting(false);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [loadWorkspace]);

  async function handleAuthenticated(installationId: InstallationId, _user: PublicUser) {
    void _user;
    setBoundInstallationId(installationId);
    setBoundIdState(installationId);
    setBooting(true);
    try {
      await loadWorkspace(installationId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setBooting(false);
    }
  }

  async function handleRefresh() {
    if (!boundInstallationId) return;
    await loadWorkspace(boundInstallationId);
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    setWorkspace(null);
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-full border-2 border-rose-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">
            Carregando ELEFANTE ROSA – 3 CARROS ESCOLARES...
          </p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <>
        {loadError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 text-center">
            {loadError}
          </div>
        )}
        <SetupAndAuth
          initialInstallationId={boundInstallationId}
          onAuthenticated={handleAuthenticated}
        />
      </>
    );
  }

  return (
    <AppShell
      workspace={workspace}
      onRefresh={handleRefresh}
      onLogout={handleLogout}
    />
  );
}

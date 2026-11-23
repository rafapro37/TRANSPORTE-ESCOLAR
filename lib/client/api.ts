import type { InstallationId } from '@/lib/domain/types';

const BINDING_STORAGE_KEY = 'er_installation_binding_v1';

export function getBoundInstallationId(): InstallationId | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.localStorage.getItem(BINDING_STORAGE_KEY);
    if (val === 'carro-01' || val === 'carro-02' || val === 'carro-03') {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

export function setBoundInstallationId(id: InstallationId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BINDING_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function clearBoundInstallationId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(BINDING_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit & { installationId?: InstallationId | null } = {}
): Promise<T> {
  const { installationId, headers: customHeaders, ...rest } = options;
  const boundId = installationId ?? getBoundInstallationId();

  const headers = new Headers(customHeaders);
  headers.set('X-Requested-With', 'ElefanteRosaApp');
  if (boundId) {
    headers.set('X-Installation-Id', boundId);
  }
  if (!(rest.body instanceof FormData) && rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && String(data.error)) ||
      `Erro na solicitação (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

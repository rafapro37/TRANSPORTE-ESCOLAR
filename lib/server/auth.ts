import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { InstallationId, PublicUser, StoredUser, UserRole } from '@/lib/domain/types';
import { isValidInstallationId } from '@/lib/domain/installations';

export const SESSION_COOKIE_NAME = 'er_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface GlobalSecretHolder {
  __erSessionSecret?: string;
}

function getSessionSecret(): string {
  const envSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_SESSION_SECRET é obrigatório em produção e deve ser uma chave persistente com pelo menos 16 caracteres.'
    );
  }
  const g = globalThis as unknown as GlobalSecretHolder;
  if (!g.__erSessionSecret) {
    g.__erSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return g.__erSessionSecret;
}

export interface SessionPayload {
  userId: string;
  installationId: InstallationId;
  role: UserRole;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function toPublicUser(user: StoredUser): PublicUser {
  const { passwordHash: _ph, passwordSalt: _ps, ...rest } = user;
  void _ph;
  void _ps;
  return rest;
}

export function signSessionToken(params: {
  userId: string;
  installationId: InstallationId;
  role: UserRole;
  email: string;
  name: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...params,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isValidInstallationId(parsed.installationId)) return null;
    if (!parsed.userId || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractSessionFromRequest(req: NextRequest): {
  session: SessionPayload | null;
  crossInstallationAttempt: boolean;
} {
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const token = bearer || cookieToken;
  const session = verifySessionToken(token);
  if (!session) {
    return { session: null, crossInstallationAttempt: false };
  }

  const requestedInstallation = req.headers.get('x-installation-id');
  if (requestedInstallation && requestedInstallation !== session.installationId) {
    return { session: null, crossInstallationAttempt: true };
  }

  return { session, crossInstallationAttempt: false };
}

export function verifyCsrfProtection(req: NextRequest): boolean {
  const customHeader = req.headers.get('x-requested-with');
  if (customHeader === 'ElefanteRosaApp') {
    return true;
  }
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function isHttpsRequest(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto === 'https') return true;
  return req.nextUrl.protocol === 'https:';
}

export function buildSessionSetCookie(token: string, isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(isHttps: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly'];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

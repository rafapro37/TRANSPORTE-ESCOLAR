import { NextRequest, NextResponse } from 'next/server';
import type { InstallationDatabase, InstallationId, PublicUser, UserRole } from '@/lib/domain/types';
import { hasRolePermission } from '@/lib/domain/installations';
import { extractSessionFromRequest, toPublicUser, verifyCsrfProtection } from './auth';
import { readInstallationDb, withInstallationLock } from './storage';

export interface AuthorizedContext {
  installationId: InstallationId;
  user: PublicUser;
  db: InstallationDatabase;
}

export async function requireAuthorizedContext(
  req: NextRequest,
  requiredArea?: Parameters<typeof hasRolePermission>[1],
  options?: { isMutation?: boolean }
): Promise<{ ok: true; ctx: AuthorizedContext } | { ok: false; response: NextResponse }> {
  const isMutation =
    options?.isMutation ??
    (req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH' ||
      req.method === 'DELETE');

  if (isMutation && !verifyCsrfProtection(req)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Requisição bloqueada pela verificação de origem.' },
        { status: 403 }
      ),
    };
  }

  const { session, crossInstallationAttempt } = extractSessionFromRequest(req);
  if (crossInstallationAttempt) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Acesso negado: esta sessão não tem permissão para acessar dados de outra instalação.',
        },
        { status: 403 }
      ),
    };
  }

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sessão expirada ou não autenticada. Faça login novamente.' },
        { status: 401 }
      ),
    };
  }

  const db = await readInstallationDb(session.installationId);
  const storedUser = db.users.find((u) => u.id === session.userId);
  if (!storedUser || !storedUser.active) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Usuário inativo ou não encontrado nesta instalação.' },
        { status: 401 }
      ),
    };
  }

  if (requiredArea && !hasRolePermission(storedUser.role, requiredArea)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Seu perfil de acesso não possui permissão para esta operação.' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      installationId: session.installationId,
      user: toPublicUser(storedUser),
      db,
    },
  };
}

export async function runAuthorizedMutation<T>(
  req: NextRequest,
  requiredArea: Parameters<typeof hasRolePermission>[1] | undefined,
  mutator: (ctx: {
    installationId: InstallationId;
    user: PublicUser;
    role: UserRole;
    db: InstallationDatabase;
  }) => Promise<{ status?: number; body: T; saveDb?: boolean }>
): Promise<NextResponse> {
  const authResult = await requireAuthorizedContext(req, requiredArea, { isMutation: true });
  if (!authResult.ok) {
    return authResult.response;
  }

  const { installationId, user } = authResult.ctx;

  try {
    return await withInstallationLock(installationId, async () => {
      const freshDb = await readInstallationDb(installationId);
      const freshUser = freshDb.users.find((u) => u.id === user.id);
      if (!freshUser || !freshUser.active) {
        return NextResponse.json({ error: 'Usuário inativo.' }, { status: 401 });
      }
      if (requiredArea && !hasRolePermission(freshUser.role, requiredArea)) {
        return NextResponse.json({ error: 'Permissão insuficiente.' }, { status: 403 });
      }

      const result = await mutator({
        installationId,
        user: toPublicUser(freshUser),
        role: freshUser.role,
        db: freshDb,
      });

      if (result.saveDb !== false) {
        const { writeInstallationDb } = await import('./storage');
        await writeInstallationDb(installationId, freshDb);
      }

      return NextResponse.json(result.body, { status: result.status ?? 200 });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno ao processar operação.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

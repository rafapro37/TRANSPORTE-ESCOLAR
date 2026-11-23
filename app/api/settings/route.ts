import { NextRequest } from 'next/server';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog, deletePrivateFile } from '@/lib/server/storage';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'settings', async ({ installationId, user, db }) => {
    if (body.action === 'remove_logo') {
      if (db.settings.theme.logoFileId) {
        await deletePrivateFile(installationId, db.settings.theme.logoFileId);
      }
      db.settings.theme.logoFileId = null;
      db.settings.theme.logoMimeType = null;
      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'LOGO_REMOVIDA',
        entityType: 'settings',
        entityId: installationId,
        summary: 'Logotipo personalizado removido.',
      });
      return { body: { settings: db.settings } };
    }

    if (typeof body.defaultTuitionAmount === 'number') {
      if (!Number.isFinite(body.defaultTuitionAmount) || body.defaultTuitionAmount <= 0) {
        throw new Error('Valor padrão da mensalidade inválido.');
      }
      db.settings.defaultTuitionAmount = Math.round(body.defaultTuitionAmount * 100) / 100;
    }

    if (typeof body.defaultDueDay === 'number') {
      const day = Math.floor(body.defaultDueDay);
      if (day < 1 || day > 28) {
        throw new Error('Dia de vencimento deve estar entre 1 e 28.');
      }
      db.settings.defaultDueDay = day;
    }

    if (typeof body.autoBackupEnabled === 'boolean') {
      db.settings.autoBackupEnabled = body.autoBackupEnabled;
    }
    if (typeof body.autoBackupIntervalHours === 'number') {
      const h = Math.floor(body.autoBackupIntervalHours);
      if (h < 1 || h > 720) throw new Error('Intervalo de backup inválido.');
      db.settings.autoBackupIntervalHours = h;
    }

    if (body.theme && typeof body.theme === 'object') {
      const t = body.theme as Record<string, unknown>;
      const colorFields = [
        'primaryColor',
        'secondaryColor',
        'buttonColor',
        'menuColor',
        'backgroundColor',
        'textColor',
        'highlightColor',
      ] as const;

      for (const field of colorFields) {
        const val = t[field];
        if (typeof val === 'string') {
          if (!HEX_COLOR_RE.test(val)) {
            throw new Error(`Cor inválida para ${field}. Use formato hexadecimal #RRGGBB.`);
          }
          db.settings.theme[field] = val;
        }
      }
    }

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'CONFIGURACOES_ATUALIZADAS',
      entityType: 'settings',
      entityId: installationId,
      summary: 'Configurações de identidade visual e parâmetros financeiros atualizadas.',
    });

    return { body: { settings: db.settings } };
  });
}

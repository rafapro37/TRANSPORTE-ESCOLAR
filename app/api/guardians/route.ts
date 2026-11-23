import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { formatCpf, isValidCpf, normalizeCpf } from '@/lib/domain/cpf';
import { runAuthorizedMutation } from '@/lib/server/api-guard';
import { appendAuditLog, deletePrivateFile } from '@/lib/server/storage';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'guardians', async ({ user, db }) => {
    const fullName = String(body.fullName ?? '').trim();
    const rawCpf = String(body.cpf ?? '');
    const normalizedCpf = normalizeCpf(rawCpf);
    const primaryPhone = String(body.primaryPhone ?? '').trim();

    if (fullName.length < 3) {
      throw new Error('Informe o nome completo do responsável.');
    }
    if (!isValidCpf(normalizedCpf)) {
      throw new Error('CPF inválido. Verifique os 11 dígitos informados.');
    }
    if (primaryPhone.length < 8) {
      throw new Error('Informe o telefone principal do responsável.');
    }

    const duplicateCpf = db.guardians.some(
      (g) => normalizeCpf(g.cpf) === normalizedCpf
    );
    if (duplicateCpf) {
      throw new Error('Já existe um responsável cadastrado com este CPF nesta instalação.');
    }

    const now = new Date().toISOString();
    const guardian = {
      id: `resp-${crypto.randomBytes(5).toString('hex')}`,
      fullName,
      cpf: formatCpf(normalizedCpf),
      rg: String(body.rg ?? '').trim(),
      birthDate: String(body.birthDate ?? '').trim(),
      primaryPhone,
      whatsapp: String(body.whatsapp ?? primaryPhone).trim(),
      alternativePhone: String(body.alternativePhone ?? '').trim(),
      email: String(body.email ?? '').trim().toLowerCase(),
      cep: String(body.cep ?? '').trim(),
      street: String(body.street ?? '').trim(),
      number: String(body.number ?? '').trim(),
      complement: String(body.complement ?? '').trim(),
      neighborhood: String(body.neighborhood ?? '').trim(),
      city: String(body.city ?? '').trim(),
      state: String(body.state ?? '').trim().toUpperCase().slice(0, 2),
      notes: String(body.notes ?? '').trim(),
      documents: [],
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    db.guardians.push(guardian);

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'RESPONSAVEL_CADASTRADO',
      entityType: 'guardian',
      entityId: guardian.id,
      summary: `Responsável "${guardian.fullName}" cadastrado.`,
    });

    return { status: 201, body: { guardian } };
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAuthorizedMutation(req, 'guardians', async ({ installationId, user, db }) => {
    const guardian = db.guardians.find((g) => g.id === body.id);
    if (!guardian) {
      throw new Error('Responsável não encontrado nesta instalação.');
    }

    if (body.action === 'remove_document') {
      const docId = String(body.documentId ?? '');
      const docItem = guardian.documents.find((d) => d.id === docId);
      if (!docItem) {
        throw new Error('Documento não encontrado.');
      }
      await deletePrivateFile(installationId, docItem.fileId);
      guardian.documents = guardian.documents.filter((d) => d.id !== docId);
      guardian.updatedAt = new Date().toISOString();

      appendAuditLog(db, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'DOCUMENTO_REMOVIDO',
        entityType: 'guardian',
        entityId: guardian.id,
        summary: `Documento (${docItem.category.toUpperCase()}) removido do cadastro de "${guardian.fullName}".`,
      });
      return { body: { guardian } };
    }

    if (typeof body.fullName === 'string') {
      const nextName = body.fullName.trim();
      if (nextName.length < 3) throw new Error('Nome inválido.');
      guardian.fullName = nextName;
    }

    if (typeof body.cpf === 'string') {
      const normalized = normalizeCpf(body.cpf);
      if (!isValidCpf(normalized)) {
        throw new Error('CPF inválido.');
      }
      const duplicate = db.guardians.some(
        (g) => g.id !== guardian.id && normalizeCpf(g.cpf) === normalized
      );
      if (duplicate) {
        throw new Error('Este CPF já pertence a outro responsável.');
      }
      guardian.cpf = formatCpf(normalized);
    }

    if (typeof body.rg === 'string') guardian.rg = body.rg.trim();
    if (typeof body.birthDate === 'string') guardian.birthDate = body.birthDate.trim();
    if (typeof body.primaryPhone === 'string') guardian.primaryPhone = body.primaryPhone.trim();
    if (typeof body.whatsapp === 'string') guardian.whatsapp = body.whatsapp.trim();
    if (typeof body.alternativePhone === 'string')
      guardian.alternativePhone = body.alternativePhone.trim();
    if (typeof body.email === 'string') guardian.email = body.email.trim().toLowerCase();
    if (typeof body.cep === 'string') guardian.cep = body.cep.trim();
    if (typeof body.street === 'string') guardian.street = body.street.trim();
    if (typeof body.number === 'string') guardian.number = body.number.trim();
    if (typeof body.complement === 'string') guardian.complement = body.complement.trim();
    if (typeof body.neighborhood === 'string') guardian.neighborhood = body.neighborhood.trim();
    if (typeof body.city === 'string') guardian.city = body.city.trim();
    if (typeof body.state === 'string')
      guardian.state = body.state.trim().toUpperCase().slice(0, 2);
    if (typeof body.notes === 'string') guardian.notes = body.notes.trim();
    if (typeof body.active === 'boolean') guardian.active = body.active;

    guardian.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'RESPONSAVEL_ATUALIZADO',
      entityType: 'guardian',
      entityId: guardian.id,
      summary: `Cadastro de "${guardian.fullName}" atualizado.`,
    });

    return { body: { guardian } };
  });
}

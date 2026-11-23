import type {
  AppSettings,
  InstallationDatabase,
  InstallationId,
  School,
  ThemeConfig,
  UserRole,
  Vehicle,
} from './types';
import { DEFAULT_DUE_DAY, DEFAULT_TUITION_AMOUNT } from './finance';

export const VALID_INSTALLATIONS: readonly InstallationId[] = [
  'carro-01',
  'carro-02',
  'carro-03',
] as const;

export const INSTALLATION_LABELS: Record<InstallationId, string> = {
  'carro-01': 'Carro 01',
  'carro-02': 'Carro 02',
  'carro-03': 'Carro 03',
};

export const INITIAL_SCHOOL_NAMES: readonly string[] = [
  'E.E. José dos Santos Novaes',
  'Heitor Villa Lobos',
  'Cândido Portinari',
  'Maria Clara Machado',
  'Escola do Futuro do Suburbano',
  'Escola Estadual Padre Romeu Mec.',
] as const;

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#e11d62',
  secondaryColor: '#0f172a',
  buttonColor: '#e11d62',
  menuColor: '#ffffff',
  backgroundColor: '#f8fafc',
  textColor: '#0f172a',
  highlightColor: '#be123c',
  logoFileId: null,
  logoMimeType: null,
};

export function isValidInstallationId(value: string | null | undefined): value is InstallationId {
  return value === 'carro-01' || value === 'carro-02' || value === 'carro-03';
}

export function createInitialSchools(nowIso: string): School[] {
  return INITIAL_SCHOOL_NAMES.map((name, idx) => ({
    id: `escola-${idx + 1}`,
    name,
    address: '',
    phone: '',
    notes: '',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

export function createInitialVehicles(nowIso: string): Vehicle[] {
  const names = ['Carro 01', 'Carro 02', 'Carro 03'];
  return names.map((name, idx) => ({
    id: `veiculo-0${idx + 1}`,
    name,
    plate: '',
    model: '',
    year: '',
    capacity: 15,
    driverName: '',
    driverPhone: '',
    helperName: '',
    helperPhone: '',
    notes: '',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

export function createInitialSettings(installationId: InstallationId): AppSettings {
  return {
    installationId,
    installationName: INSTALLATION_LABELS[installationId],
    defaultTuitionAmount: DEFAULT_TUITION_AMOUNT,
    defaultDueDay: DEFAULT_DUE_DAY,
    autoBackupEnabled: true,
    autoBackupIntervalHours: 24,
    lastAutoBackupAt: null,
    theme: { ...DEFAULT_THEME },
  };
}

export function createInitialDatabase(
  installationId: InstallationId,
  nowIso: string = new Date().toISOString()
): InstallationDatabase {
  return {
    installationId,
    schemaVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    settings: createInitialSettings(installationId),
    users: [],
    schools: createInitialSchools(nowIso),
    guardians: [],
    children: [],
    vehicles: createInitialVehicles(nowIso),
    tuitions: [],
    auditLogs: [],
    backups: [],
  };
}

export function hasRolePermission(
  role: UserRole,
  area:
    | 'dashboard'
    | 'children'
    | 'guardians'
    | 'schools'
    | 'vehicles'
    | 'passengers'
    | 'finance'
    | 'reports_general'
    | 'reports_finance'
    | 'users'
    | 'backup'
    | 'settings'
    | 'documents_sensitive'
): boolean {
  if (role === 'admin') return true;
  if (role === 'financeiro') {
    return (
      area === 'dashboard' ||
      area === 'guardians' ||
      area === 'finance' ||
      area === 'reports_general' ||
      area === 'reports_finance' ||
      area === 'documents_sensitive'
    );
  }
  if (role === 'operacional') {
    return (
      area === 'dashboard' ||
      area === 'children' ||
      area === 'guardians' ||
      area === 'schools' ||
      area === 'vehicles' ||
      area === 'passengers' ||
      area === 'reports_general'
    );
  }
  return false;
}

const SENSITIVE_AUDIT_KEYS = ['cpf', 'rg', 'password', 'senha', 'passwordhash', 'passwordsalt', 'token'];

export function sanitizeAuditSummary(text: string): string {
  // Remove CPF patterns (000.000.000-00 or 11 consecutive digits) and sensitive words
  return text
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF-OCULTO]')
    .replace(/\b\d{11}\b/g, '[DOC-OCULTO]');
}

export function stripSensitiveAuditFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_AUDIT_KEYS.includes(key.toLowerCase())) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function validateBackupCompatibility(params: {
  backupInstallationId: string;
  targetInstallationId: InstallationId;
  allowCrossInstallationOverride: boolean;
  userRole: UserRole;
}): { allowed: boolean; reason?: string } {
  const { backupInstallationId, targetInstallationId, allowCrossInstallationOverride, userRole } = params;
  if (!isValidInstallationId(backupInstallationId)) {
    return { allowed: false, reason: 'Identificador de instalação inválido no arquivo de backup.' };
  }
  if (backupInstallationId === targetInstallationId) {
    return { allowed: true };
  }
  if (!allowCrossInstallationOverride || userRole !== 'admin') {
    return {
      allowed: false,
      reason: `Este backup pertence ao ${INSTALLATION_LABELS[backupInstallationId]} e não pode ser restaurado no ${INSTALLATION_LABELS[targetInstallationId]} sem confirmação administrativa explícita.`,
    };
  }
  return { allowed: true };
}

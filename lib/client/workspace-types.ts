import type {
  AppSettings,
  AuditLogEntry,
  BackupMetadata,
  Child,
  DashboardMetrics,
  Guardian,
  InstallationId,
  PublicUser,
  School,
  TuitionRecord,
  Vehicle,
} from '@/lib/domain/types';

export type NavSectionId =
  | 'dashboard'
  | 'criancas'
  | 'responsaveis'
  | 'escolas'
  | 'veiculos'
  | 'passageiros'
  | 'financeiro'
  | 'relatorios'
  | 'usuarios'
  | 'backup'
  | 'configuracoes';

export interface WorkspacePayload {
  installationId: InstallationId;
  currentUser: PublicUser;
  settings: AppSettings;
  schools: School[];
  vehicles: Vehicle[];
  guardians: Guardian[];
  children: Child[];
  tuitions: TuitionRecord[];
  users: PublicUser[];
  auditLogs: AuditLogEntry[];
  backups: BackupMetadata[];
  dashboard: DashboardMetrics;
}

export interface NavigationFocusTarget {
  section: NavSectionId;
  entityId?: string;
  action?: string;
}

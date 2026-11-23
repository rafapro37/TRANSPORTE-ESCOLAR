export type InstallationId = 'carro-01' | 'carro-02' | 'carro-03';

export type UserRole = 'admin' | 'financeiro' | 'operacional';

export type PeriodoEscolar = 'manha' | 'tarde' | 'integral';

export type PaymentMethod = 'pix' | 'dinheiro' | 'transferencia' | 'cartao' | 'outros';

export type TuitionStatus = 'pago' | 'pendente' | 'parcial' | 'atrasado';

export type DocumentCategory = 'rg' | 'cpf' | 'cnh' | 'residencia' | 'outros';

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  buttonColor: string;
  menuColor: string;
  backgroundColor: string;
  textColor: string;
  highlightColor: string;
  logoFileId: string | null;
  logoMimeType: string | null;
}

export interface AppSettings {
  installationId: InstallationId;
  installationName: string;
  defaultTuitionAmount: number;
  defaultDueDay: number;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastAutoBackupAt: string | null;
  theme: ThemeConfig;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export type PublicUser = Omit<StoredUser, 'passwordHash' | 'passwordSalt'>;

export interface School {
  id: string;
  name: string;
  address: string;
  phone: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianDocument {
  id: string;
  fileId: string;
  category: DocumentCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Guardian {
  id: string;
  fullName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  primaryPhone: string;
  whatsapp: string;
  alternativePhone: string;
  email: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  notes: string;
  documents: GuardianDocument[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChildHistoryEntry {
  id: string;
  timestamp: string;
  actorName: string;
  summary: string;
}

export interface Child {
  id: string;
  fullName: string;
  birthDate: string;
  photoFileId: string | null;
  photoMimeType: string | null;
  schoolId: string;
  grade: string;
  classroom: string;
  period: PeriodoEscolar;
  guardianId: string;
  pickupStreet: string;
  pickupNumber: string;
  pickupNeighborhood: string;
  pickupCity: string;
  vehicleId: string;
  tuitionAmount: number;
  startDate: string;
  active: boolean;
  notes: string;
  history: ChildHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  model: string;
  year: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  helperName: string;
  helperPhone: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  tuitionId: string;
  childId: string;
  guardianId: string;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  notes: string;
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
}

export interface TuitionRecord {
  id: string;
  childId: string;
  guardianId: string;
  referenceYear: number;
  referenceMonth: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: TuitionStatus;
  payments: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}

export interface BackupMetadata {
  id: string;
  installationId: InstallationId;
  installationLabel: string;
  createdAt: string;
  createdBy: string;
  type: 'manual' | 'automatico';
  fileName: string;
  sizeBytes: number;
  sha256: string;
  counts: {
    users: number;
    schools: number;
    guardians: number;
    children: number;
    vehicles: number;
    tuitions: number;
    files: number;
  };
}

export interface InstallationDatabase {
  installationId: InstallationId;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  settings: AppSettings;
  users: StoredUser[];
  schools: School[];
  guardians: Guardian[];
  children: Child[];
  vehicles: Vehicle[];
  tuitions: TuitionRecord[];
  auditLogs: AuditLogEntry[];
  backups: BackupMetadata[];
}

export interface DashboardAlert {
  tuitionId: string;
  childId: string;
  childName: string;
  guardianId: string;
  guardianName: string;
  guardianPhone: string;
  referenceMonth: number;
  referenceYear: number;
  amount: number;
  remainingAmount: number;
  dueDate: string;
  openMonthsCount: number;
  status: TuitionStatus;
}

export interface MonthlyRevenuePoint {
  key: string;
  label: string;
  expected: number;
  received: number;
  open: number;
}

export interface DashboardMetrics {
  totalChildren: number;
  activeChildren: number;
  inactiveChildren: number;
  totalGuardians: number;
  totalSchools: number;
  totalVehicles: number;
  paidTuitionsCount: number;
  pendingTuitionsCount: number;
  overdueTuitionsCount: number;
  expectedAmount: number;
  receivedAmount: number;
  openAmount: number;
  monthlySeries: MonthlyRevenuePoint[];
  alerts: DashboardAlert[];
}

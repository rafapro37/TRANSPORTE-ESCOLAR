import { NextRequest, NextResponse } from 'next/server';
import { computeDashboardMetrics } from '@/lib/domain/finance';
import { hasRolePermission } from '@/lib/domain/installations';
import { requireAuthorizedContext } from '@/lib/server/api-guard';
import { toPublicUser } from '@/lib/server/auth';
import {
  maybeRunAutoBackup,
  withInstallationLock,
  writeInstallationDb,
} from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  const auth = await requireAuthorizedContext(req, 'dashboard', { isMutation: false });
  if (!auth.ok) return auth.response;

  const { installationId, user, db } = auth.ctx;

  // Trigger scheduled auto-backup silently if enabled and due
  await withInstallationLock(installationId, async () => {
    const ran = await maybeRunAutoBackup(installationId, db);
    if (ran) {
      await writeInstallationDb(installationId, db);
    }
  });

  const canFinance = hasRolePermission(user.role, 'finance');
  const canUsers = hasRolePermission(user.role, 'users');
  const canBackup = hasRolePermission(user.role, 'backup');
  const canDocs = hasRolePermission(user.role, 'documents_sensitive');

  const metrics = computeDashboardMetrics(db);

  return NextResponse.json({
    installationId,
    currentUser: user,
    settings: db.settings,
    schools: db.schools,
    vehicles: db.vehicles,
    guardians: db.guardians.map((g) => ({
      ...g,
      documents: canDocs ? g.documents : [],
    })),
    children: db.children,
    tuitions: canFinance ? db.tuitions : [],
    users: canUsers ? db.users.map(toPublicUser) : [],
    auditLogs: canUsers ? db.auditLogs : [],
    backups: canBackup ? db.backups : [],
    dashboard: {
      totalChildren: metrics.totalChildren,
      activeChildren: metrics.activeChildren,
      inactiveChildren: metrics.inactiveChildren,
      totalGuardians: metrics.totalGuardians,
      totalSchools: metrics.totalSchools,
      totalVehicles: metrics.totalVehicles,
      paidTuitionsCount: canFinance ? metrics.paidTuitionsCount : 0,
      pendingTuitionsCount: canFinance ? metrics.pendingTuitionsCount : 0,
      overdueTuitionsCount: canFinance ? metrics.overdueTuitionsCount : 0,
      expectedAmount: canFinance ? metrics.expectedAmount : 0,
      receivedAmount: canFinance ? metrics.receivedAmount : 0,
      openAmount: canFinance ? metrics.openAmount : 0,
      monthlySeries: canFinance ? metrics.monthlySeries : [],
      alerts: canFinance ? metrics.alerts : [],
    },
  });
}

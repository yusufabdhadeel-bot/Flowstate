import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import type { Prisma } from '@prisma/client';

export interface AuditFilterInput {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  ipAddress?: string;
}

export interface DataRetentionPolicy {
  resourceType: string;
  retentionDays: number;
  archiveAfterDays?: number;
  allowManualDeletion: boolean;
  legalHoldEnabled: boolean;
}

export interface CompliancePolicyInput {
  passwordExpiration?: { enabled: boolean; days?: number };
  sessionExpiration?: { enabled: boolean; minutes?: number };
  accountInactivity?: { enabled: boolean; days?: number };
  mfaRequired?: boolean;
  dataExportAllowed?: boolean;
  ipRestrictions?: string[];
}

export async function createAuditLogEntry(organizationId: string, auditData: {
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  actorIp?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  requestId?: string;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId,
      action: auditData.action,
      entityType: auditData.entityType,
      entityId: auditData.entityId,
      actorId: auditData.actorId,
      actorIp: auditData.actorIp,
      userAgent: auditData.userAgent,
      resourceType: auditData.resourceType,
      resourceId: auditData.resourceId,
      details: auditData.details ? JSON.stringify(auditData.details) : null,
      previousValues: auditData.previousValues as Prisma.InputJsonValue,
      newValues: auditData.newValues as Prisma.InputJsonValue,
      requestId: auditData.requestId,
      isImmutable: true,
    },
  });
}

export async function filterAuditLogs(organizationId: string, filter: AuditFilterInput, limit = 100, offset = 0) {
  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    ...(filter.startDate && { createdAt: { gte: filter.startDate } }),
    ...(filter.endDate && { createdAt: { lte: filter.endDate } }),
    ...(filter.userId && { actorId: filter.userId }),
    ...(filter.resourceType && { resourceType: filter.resourceType }),
    ...(filter.resourceId && { resourceId: filter.resourceId }),
    ...(filter.action && { action: filter.action }),
    ...(filter.ipAddress && { actorIp: filter.ipAddress }),
  };

  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return { logs, totalCount, limit, offset };
}

export async function exportAuditLogs(organizationId: string, filter: AuditFilterInput): Promise<Array<Record<string, unknown>>> {
  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    ...(filter.startDate && { createdAt: { gte: filter.startDate } }),
    ...(filter.endDate && { createdAt: { lte: filter.endDate } }),
    ...(filter.userId && { actorId: filter.userId }),
    ...(filter.resourceType && { resourceType: filter.resourceType }),
    ...(filter.resourceId && { resourceId: filter.resourceId }),
    ...(filter.action && { action: filter.action }),
    ...(filter.ipAddress && { actorIp: filter.ipAddress }),
  };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100000,
  });

  return logs.map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    actor: log.actorId,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    details: log.details ? JSON.parse(log.details) : null,
    ipAddress: log.actorIp,
    userAgent: log.userAgent,
  }));
}

export async function setDataRetentionPolicy(organizationId: string, policies: DataRetentionPolicy[]) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const currentPolicies = (organization.compliancePolicies as Record<string, unknown> | null) ?? {};

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      compliancePolicies: {
        ...currentPolicies,
        dataRetentionPolicies: policies,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function enforceDataRetention(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const policies = ((organization.compliancePolicies as Record<string, unknown> | null) ?? {}).dataRetentionPolicies as DataRetentionPolicy[] | undefined;
  if (!policies || policies.length === 0) {
    return { deleted: 0, archived: 0 };
  }

  let deleted = 0;
  let archived = 0;

  for (const policy of policies) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    if (policy.resourceType === 'memo' && policy.allowManualDeletion) {
      const result = await prisma.memo.deleteMany({
        where: {
          organizationId,
          createdAt: { lt: cutoffDate },
        },
      });
      deleted += result.count;
    }

    if (policy.resourceType === 'auditLog') {
      const archiveDate = policy.archiveAfterDays ? new Date(Date.now() - policy.archiveAfterDays * 24 * 60 * 60 * 1000) : cutoffDate;
      const result = await prisma.auditLog.findMany({
        where: {
          organizationId,
          createdAt: { lt: archiveDate },
        },
        take: 1000,
      });
      archived += result.length;
    }
  }

  return { deleted, archived };
}

export async function setCompliancePolicy(organizationId: string, policy: CompliancePolicyInput) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const currentCompliance = (organization.compliancePolicies as Record<string, unknown> | null) ?? {};

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      compliancePolicies: {
        ...currentCompliance,
        ...policy,
      },
    },
  });
}

export async function validateComplianceRequirements(organizationId: string, userId: string): Promise<{ compliant: boolean; violations: string[] }> {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const violations: string[] = [];
  const policies = (organization.compliancePolicies as Record<string, unknown> | null) ?? {};

  if ((policies.mfaRequired as boolean | undefined) && !user.mfaEnabled) {
    violations.push('MFA is required but not enabled');
  }

  if (policies.passwordExpiration && typeof policies.passwordExpiration === 'object') {
    const expPolicy = policies.passwordExpiration as Record<string, unknown>;
    if ((expPolicy.enabled as boolean) && user.passwordChangedAt) {
      const daysSinceChange = Math.floor((Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24));
      const expirationDays = (expPolicy.days as number | undefined) ?? 90;
      if (daysSinceChange > expirationDays) {
        violations.push('Password has expired');
      }
    }
  }

  return { compliant: violations.length === 0, violations };
}

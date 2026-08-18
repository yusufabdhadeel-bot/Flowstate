import { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';

export interface OrganizationSettingsInput {
  settings?: Record<string, unknown>;
  compliancePolicies?: Record<string, unknown>;
  governanceRules?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
}

export async function getOrganizationAdminSnapshot(organizationId: string) {
  const [organization, userCount, activeWorkflowCount, pendingInvitationCount, activeAutomationCount] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.workflow.count({ where: { organizationId, isActive: true } }),
    prisma.invitation.count({ where: { organizationId, status: 'PENDING' } }),
    prisma.automationRule.count({ where: { organizationId, isActive: true } }),
  ]);

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  return {
    organization,
    metrics: {
      activeUsers: userCount,
      pendingInvitations: pendingInvitationCount,
      activeWorkflows: activeWorkflowCount,
      runningAutomations: activeAutomationCount,
      storageUsage: 0,
      apiUsage: 0,
      organizationHealth: 'HEALTHY',
      securityAlerts: 0,
      licenseInfo: 'Enterprise-ready',
    },
  };
}

export async function updateOrganizationEnterpriseSettings(organizationId: string, input: OrganizationSettingsInput) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  const currentSettings = (organization.settings as Record<string, unknown> | null) ?? {};
  const currentCompliance = (organization.compliancePolicies as Record<string, unknown> | null) ?? {};
  const currentGovernance = (organization.governanceRules as Record<string, unknown> | null) ?? {};
  const currentSecurity = (organization.securitySettings as Record<string, unknown> | null) ?? {};

  const nextSettings = { ...currentSettings, ...(input.settings ?? {}) } as Prisma.InputJsonValue;
  const nextCompliance = { ...currentCompliance, ...(input.compliancePolicies ?? {}) } as Prisma.InputJsonValue;
  const nextGovernance = { ...currentGovernance, ...(input.governanceRules ?? {}) } as Prisma.InputJsonValue;
  const nextSecurity = { ...currentSecurity, ...(input.securitySettings ?? {}) } as Prisma.InputJsonValue;

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: nextSettings,
      compliancePolicies: nextCompliance,
      governanceRules: nextGovernance,
      securitySettings: nextSecurity,
    },
  });
}

export async function createDepartment(organizationId: string, input: { name: string; parentId?: string | null; managerId?: string | null; administratorIds?: string[] }) {
  if (!input.name?.trim()) {
    throw new ValidationError('Department name is required');
  }

  if (input.parentId) {
    const parent = await prisma.department.findFirst({ where: { id: input.parentId, organizationId } });
    if (!parent) {
      throw new ValidationError('Parent department not found');
    }
  }

  return prisma.department.create({
    data: {
      organizationId,
      name: input.name.trim(),
      parentId: input.parentId ?? null,
      metadata: {
        managerId: input.managerId ?? null,
        administratorIds: input.administratorIds ?? [],
      },
    },
  });
}

export async function updateDepartment(id: string, organizationId: string, input: { name?: string; parentId?: string | null; managerId?: string | null; administratorIds?: string[]; isActive?: boolean }) {
  const department = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  if (input.parentId && input.parentId === id) {
    throw new ValidationError('Department cannot be its own parent');
  }

  if (input.parentId) {
    const parent = await prisma.department.findFirst({ where: { id: input.parentId, organizationId } });
    if (!parent) {
      throw new ValidationError('Parent department not found');
    }
  }

  const metadata = (department.metadata as Record<string, unknown> | null) ?? {};

  return prisma.department.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      parentId: input.parentId ?? department.parentId,
      isActive: input.isActive ?? department.isActive,
      metadata: {
        ...metadata,
        managerId: input.managerId ?? (metadata.managerId ?? null),
        administratorIds: input.administratorIds ?? ((metadata.administratorIds as string[]) ?? []),
      },
    },
  });
}

export async function archiveDepartment(id: string, organizationId: string) {
  const department = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  return prisma.department.update({ where: { id }, data: { isActive: false } });
}

export async function restoreDepartment(id: string, organizationId: string) {
  const department = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  return prisma.department.update({ where: { id }, data: { isActive: true } });
}

export async function deleteDepartment(id: string, organizationId: string) {
  const department = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!department) {
    throw new NotFoundError('Department not found');
  }

  const childCount = await prisma.department.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new ValidationError('Department cannot be deleted while it has child departments');
  }

  return prisma.department.delete({ where: { id } });
}

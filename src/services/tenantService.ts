import { prisma } from '../prismaClient';

export async function getTenantUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
  });
}

export async function getTenantMemos(organizationId: string) {
  return prisma.memo.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTenantComments(organizationId: string) {
  return prisma.comment.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTenantAuditLogs(organizationId: string) {
  return prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
}

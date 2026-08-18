import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { Prisma } from '@prisma/client';

async function assertReportingAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    throw new ForbiddenError('Only admins or managers can access reporting');
  }
}

export async function createReportTemplate(input: { organizationId: string; name: string; reportType: string; filters?: Record<string, unknown>; chartConfig?: Record<string, unknown>; isDefault?: boolean; }, userId: string) {
  await assertReportingAccess(userId, input.organizationId);
  return prisma.reportTemplate.create({
    data: {
      organizationId: input.organizationId,
      createdBy: userId,
      name: input.name.trim(),
      reportType: input.reportType,
      filters: (input.filters ?? {}) as Prisma.InputJsonValue,
      chartConfig: (input.chartConfig ?? {}) as Prisma.InputJsonValue,
      isDefault: input.isDefault ?? false,
    },
  });
}

export async function listReportTemplates(organizationId: string, userId: string) {
  await assertReportingAccess(userId, organizationId);
  return prisma.reportTemplate.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

export async function generateReport(organizationId: string, userId: string, input: { reportType: string; format: string; filters?: Record<string, unknown> }) {
  await assertReportingAccess(userId, organizationId);
  const execution = await prisma.reportExecution.create({
    data: {
      organizationId,
      createdBy: userId,
      format: input.format as any,
      status: 'QUEUED',
      metadata: (input.filters ?? {}) as Prisma.InputJsonValue,
    },
  });
  return execution;
}

export async function getDashboardSummary(organizationId: string, userId: string) {
  await assertReportingAccess(userId, organizationId);
  const [memoCount, workflowCount, userCount, pendingCount] = await Promise.all([
    prisma.memo.count({ where: { organizationId } }),
    prisma.workflow.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
    prisma.memo.count({ where: { organizationId, status: 'PENDING' } }),
  ]);
  return { memoCount, workflowCount, userCount, pendingCount };
}

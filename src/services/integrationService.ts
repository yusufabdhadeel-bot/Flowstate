import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { Prisma } from '@prisma/client';

async function assertIntegrationAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') throw new ForbiddenError('Only admins or managers can manage integrations');
}

export async function createWebhook(input: { organizationId: string; name: string; url: string; description?: string; secretHash: string; eventTypes?: string[]; isActive?: boolean; }, userId: string) {
  await assertIntegrationAccess(userId, input.organizationId);
  return prisma.webhookEndpoint.create({
    data: {
      organizationId: input.organizationId,
      createdBy: userId,
      name: input.name.trim(),
      url: input.url,
      description: input.description?.trim() || null,
      secretHash: input.secretHash,
      eventTypes: (input.eventTypes ?? []) as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
    },
  });
}

export async function listWebhooks(organizationId: string, userId: string) {
  await assertIntegrationAccess(userId, organizationId);
  return prisma.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

export async function createApiKey(input: { organizationId: string; name: string; prefix: string; keyHash: string; scopes?: string[]; expiresAt?: Date; }, userId: string) {
  await assertIntegrationAccess(userId, input.organizationId);
  return prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      createdBy: userId,
      name: input.name.trim(),
      prefix: input.prefix,
      keyHash: input.keyHash,
      scopes: (input.scopes ?? []) as Prisma.InputJsonValue,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

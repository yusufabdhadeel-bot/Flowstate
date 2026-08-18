import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';

async function assertSearchAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'STAFF') {
    throw new ForbiddenError('Insufficient permissions to search');
  }
}

export async function searchPlatform(organizationId: string, userId: string, query: string, options?: { page?: number; limit?: number }) {
  await assertSearchAccess(userId, organizationId);
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
  const skip = (page - 1) * limit;

  const memos = await prisma.memo.findMany({
    where: { organizationId, OR: [{ title: { contains: query, mode: 'insensitive' } }, { content: { contains: query, mode: 'insensitive' } }] },
    select: { id: true, title: true, status: true, createdAt: true },
    skip,
    take: limit,
  });

  const workflows = await prisma.workflow.findMany({
    where: { organizationId, OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
    select: { id: true, name: true, isActive: true, createdAt: true },
    take: limit,
  });

  await prisma.searchHistory.create({
    data: { organizationId, userId, query },
  });

  return { query, memos, workflows, page, limit };
}

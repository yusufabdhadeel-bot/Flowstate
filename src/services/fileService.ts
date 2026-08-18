import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { Prisma } from '@prisma/client';

async function assertFileAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'STAFF') {
    throw new ForbiddenError('Insufficient permissions to manage files');
  }
}

export async function uploadFile(input: { organizationId: string; uploaderId: string; filename: string; originalFilename: string; mimeType: string; extension: string; fileSize: number; storageProvider?: string; storageKey: string; downloadUrl?: string; checksum?: string; metadata?: Record<string, unknown> }, userId: string) {
  await assertFileAccess(userId, input.organizationId);
  return prisma.fileRecord.create({
    data: {
      organizationId: input.organizationId,
      uploaderId: input.uploaderId,
      filename: input.filename,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      extension: input.extension,
      fileSize: input.fileSize,
      storageProvider: (input.storageProvider as any) ?? 'LOCAL',
      storageKey: input.storageKey,
      downloadUrl: input.downloadUrl ?? null,
      checksum: input.checksum ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listFiles(organizationId: string, userId: string) {
  await assertFileAccess(userId, organizationId);
  return prisma.fileRecord.findMany({ where: { organizationId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
}

export async function getFile(id: string, organizationId: string, userId: string) {
  await assertFileAccess(userId, organizationId);
  const file = await prisma.fileRecord.findFirst({ where: { id, organizationId } });
  if (!file) throw new NotFoundError('File not found');
  return file;
}

export async function softDeleteFile(id: string, organizationId: string, userId: string) {
  await assertFileAccess(userId, organizationId);
  const file = await prisma.fileRecord.findFirst({ where: { id, organizationId } });
  if (!file) throw new NotFoundError('File not found');
  return prisma.fileRecord.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
}

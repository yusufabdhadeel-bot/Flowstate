import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import type { Role } from '@prisma/client';

export interface UpdateMemberInput {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: Role;
  departmentId?: string | null;
  isActive?: boolean;
  isSuspended?: boolean;
}

async function assertAdmin(currentUserId: string, organizationId: string) {
  const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!currentUser) {
    throw new NotFoundError('Current user not found');
  }
  assertSameTenant(currentUser.organizationId, organizationId);
  if (currentUser.role !== 'ADMIN') {
    throw new ForbiddenError('Only organization admins can manage members');
  }
}

async function assertMemberInOrganization(userId: string, organizationId: string) {
  const member = await prisma.user.findUnique({ where: { id: userId } });
  if (!member) {
    throw new NotFoundError('Member not found');
  }
  assertSameTenant(member.organizationId, organizationId);
  return member;
}

export async function listMembers(organizationId: string, currentUserId: string, query?: string) {
  await assertAdmin(currentUserId, organizationId);
  const where = {
    organizationId,
    ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }] } : {}),
  };
  return prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, include: { department: true } });
}

export async function getMemberById(memberId: string, organizationId: string, currentUserId: string) {
  await assertAdmin(currentUserId, organizationId);
  return assertMemberInOrganization(memberId, organizationId);
}

export async function updateMember(memberId: string, organizationId: string, currentUserId: string, input: UpdateMemberInput) {
  await assertAdmin(currentUserId, organizationId);
  const member = await assertMemberInOrganization(memberId, organizationId);

  if (input.role && member.role === 'ADMIN' && input.role !== 'ADMIN' && currentUserId === member.id) {
    throw new ValidationError('Administrators cannot change their own role');
  }

  const data: Record<string, unknown> = {};
  if (typeof input.name === 'string') data.name = input.name.trim();
  if (typeof input.email === 'string') data.email = input.email.trim().toLowerCase();
  if (typeof input.phone === 'string' || input.phone === null) data.phone = input.phone?.trim() || null;
  if (input.role) data.role = input.role;
  if (typeof input.departmentId === 'string' || input.departmentId === null) data.departmentId = input.departmentId;
  if (typeof input.isActive === 'boolean') data.isActive = input.isActive;
  if (typeof input.isSuspended === 'boolean') data.isSuspended = input.isSuspended;

  const updated = await prisma.user.update({ where: { id: memberId }, data });
  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'MEMBER_UPDATED',
      entityType: 'User',
      entityId: updated.id,
      details: `Updated member ${updated.email}`,
    },
  });
  return updated;
}

export async function removeMember(memberId: string, organizationId: string, currentUserId: string) {
  await assertAdmin(currentUserId, organizationId);
  const member = await assertMemberInOrganization(memberId, organizationId);
  if (member.role === 'ADMIN' && currentUserId === member.id) {
    throw new ValidationError('Administrators cannot remove themselves');
  }

  const adminCount = await prisma.user.count({ where: { organizationId, role: 'ADMIN' } });
  if (member.role === 'ADMIN' && adminCount <= 1) {
    throw new ValidationError('Organization must retain at least one administrator');
  }

  await prisma.user.delete({ where: { id: memberId } });
  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'MEMBER_REMOVED',
      entityType: 'User',
      entityId: member.id,
      details: `Removed member ${member.email}`,
    },
  });
}

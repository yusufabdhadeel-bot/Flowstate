import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../utils/password';
import type { Role } from '@prisma/client';

export interface CreateUserInput {
  name: string;
  email: string;
  /** Plaintext password. It is hashed with bcrypt before it reaches the database. */
  password: string;
  role: Role;
  organizationId: string;
  reportsTo?: string | null;
  isActive?: boolean;
}

async function assertUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError(`User with id=${userId} not found`);
  }
  return user;
}

async function assertManagerExists(managerId: string) {
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager) {
    throw new ValidationError('Assigned manager does not exist');
  }
  return manager;
}

async function assertValidManagerAssignment(userId: string, managerId: string) {
  if (userId === managerId) {
    throw new ValidationError('A user cannot report to themselves');
  }

  let currentManagerId: string | null = managerId;
  while (currentManagerId) {
    const currentManager: { id: string; reportsTo: string | null } | null = await prisma.user.findUnique({
      where: { id: currentManagerId },
      select: { id: true, reportsTo: true },
    });

    if (!currentManager) {
      break;
    }

    if (currentManager.reportsTo === userId) {
      throw new ValidationError('Circular hierarchy detected');
    }

    currentManagerId = currentManager.reportsTo;
  }
}

export async function getManager(userId: string, currentUserOrganizationId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { manager: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (currentUserOrganizationId) {
    assertSameTenant(user.organizationId, currentUserOrganizationId);
  }

  return user.manager;
}

export async function getDirectReports(userId: string, currentUserOrganizationId?: string) {
  const user = await assertUserExists(userId);
  if (currentUserOrganizationId) {
    assertSameTenant(user.organizationId, currentUserOrganizationId);
  }
  return prisma.user.findMany({
    where: { reportsTo: userId, organizationId: currentUserOrganizationId },
    orderBy: { name: 'asc' },
  });
}

export async function getUserById(userId: string, currentUserOrganizationId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (currentUserOrganizationId) {
    assertSameTenant(user.organizationId, currentUserOrganizationId);
  }

  return user;
}

export async function getHierarchyChain(userId: string, currentUserOrganizationId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reportsTo: true, organizationId: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (currentUserOrganizationId) {
    assertSameTenant(user.organizationId, currentUserOrganizationId);
  }

  const chain = [] as Array<{ id: string; name: string; email: string; role: Role; reportsTo: string | null }>;
  let currentManagerId = user.reportsTo;

  while (currentManagerId) {
    const manager = await prisma.user.findUnique({
      where: { id: currentManagerId },
      select: { id: true, name: true, email: true, role: true, reportsTo: true },
    });

    if (!manager) {
      break;
    }

    chain.push(manager);
    currentManagerId = manager.reportsTo;
  }

  return chain;
}

export async function assignManager(userId: string, managerId: string, currentUserOrganizationId?: string) {
  const user = await assertUserExists(userId);

  // Guard against a caller in one tenant reassigning the manager of a user in
  // another tenant.
  if (currentUserOrganizationId) {
    assertSameTenant(user.organizationId, currentUserOrganizationId);
  }

  if (userId === managerId) {
    throw new ValidationError('A user cannot report to themselves');
  }

  await assertValidManagerAssignment(userId, managerId);

  const manager = await assertManagerExists(managerId);

  // A manager must belong to the same organization as their report.
  if (currentUserOrganizationId) {
    assertSameTenant(manager.organizationId, currentUserOrganizationId);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { reportsTo: managerId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      reportsTo: true,
      isActive: true,
      updatedAt: true,
    },
  });
}

export async function createUser(input: CreateUserInput) {
  if (!input.organizationId) {
    throw new ValidationError('organizationId is required');
  }

  if (typeof input.password !== 'string' || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!organization) {
    throw new NotFoundError(`Organization with id=${input.organizationId} not found`);
  }

  if (input.reportsTo) {
    await assertManagerExists(input.reportsTo);
  }

  // Hash here rather than at the route layer so that no caller can create a
  // user with a plaintext password.
  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      organizationId: input.organizationId,
      reportsTo: input.reportsTo ?? null,
      isActive: input.isActive ?? true,
    },
    // Never leak the password hash through the API response.
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      departmentId: true,
      reportsTo: true,
      isActive: true,
      isSuspended: true,
      mfaEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

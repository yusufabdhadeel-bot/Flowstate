import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
import type { Role } from '@prisma/client';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
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

export async function getManager(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { manager: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user.manager;
}

export async function getDirectReports(userId: string) {
  await assertUserExists(userId);
  return prisma.user.findMany({
    where: { reportsTo: userId },
    orderBy: { name: 'asc' },
  });
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

export async function getHierarchyChain(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reportsTo: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
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

export async function assignManager(userId: string, managerId: string) {
  const user = await assertUserExists(userId);
  if (userId === managerId) {
    throw new ValidationError('A user cannot report to themselves');
  }

  await assertValidManagerAssignment(userId, managerId);

  return prisma.user.update({
    where: { id: userId },
    data: { reportsTo: managerId },
  });
}

export async function createUser(input: CreateUserInput) {
  if (input.reportsTo) {
    await assertManagerExists(input.reportsTo);
  }

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      reportsTo: input.reportsTo ?? null,
      isActive: input.isActive ?? true,
    },
  });
}

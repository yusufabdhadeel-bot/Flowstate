import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
import type { Role } from '@prisma/client';

export interface CreateOrganizationWithOwnerInput {
  name: string;
  slug: string;
  domain?: string | null;
  logoUrl?: string | null;
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
}

export async function onboardOrganization(input: CreateOrganizationWithOwnerInput) {
  const slug = input.slug.trim().toLowerCase();
  if (!input.name?.trim() || !slug) {
    throw new ValidationError('Organization name and slug are required');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new ValidationError('Organization slug already exists');
    }

    const organization = await tx.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        domain: input.domain?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
        isActive: true,
      },
    });

    const owner = await tx.user.create({
      data: {
        name: input.ownerName.trim(),
        email: input.ownerEmail.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: 'ADMIN' as Role,
        organizationId: organization.id,
        isActive: true,
      },
    });

    await tx.department.create({
      data: {
        organizationId: organization.id,
        name: 'Root Department',
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        action: 'ORGANIZATION_ONBOARDED',
        entityType: 'Organization',
        entityId: organization.id,
        details: `Created organization and owner ${owner.email}`,
      },
    });

    return { organization, owner };
  });
}

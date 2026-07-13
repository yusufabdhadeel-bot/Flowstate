import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  domain?: string | null;
  logoUrl?: string | null;
  isActive?: boolean;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  domain?: string | null;
  logoUrl?: string | null;
  isActive?: boolean;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const slug = input.slug?.trim().toLowerCase();
  if (!input.name?.trim() || !slug) {
    throw new ValidationError('Organization name and slug are required');
  }

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw new ValidationError('Organization slug already exists');
  }

  return prisma.organization.create({
    data: {
      name: input.name.trim(),
      slug,
      domain: input.domain?.trim() || null,
      logoUrl: input.logoUrl?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function getOrganizationById(id: string) {
  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    throw new NotFoundError(`Organization with id=${id} not found`);
  }
  return organization;
}

export async function getOrganizationBySlug(slug: string) {
  const organization = await prisma.organization.findUnique({ where: { slug: slug.toLowerCase() } });
  if (!organization) {
    throw new NotFoundError(`Organization with slug=${slug} not found`);
  }
  return organization;
}

export async function updateOrganization(id: string, input: UpdateOrganizationInput) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError(`Organization with id=${id} not found`);
  }

  const data: Record<string, unknown> = {};
  if (typeof input.name === 'string') {
    data.name = input.name.trim();
  }
  if (typeof input.slug === 'string') {
    const slug = input.slug.trim().toLowerCase();
    const duplicate = await prisma.organization.findUnique({ where: { slug } });
    if (duplicate && duplicate.id !== id) {
      throw new ValidationError('Organization slug already exists');
    }
    data.slug = slug;
  }
  if (typeof input.domain === 'string' || input.domain === null) {
    data.domain = input.domain?.trim() || null;
  }
  if (typeof input.logoUrl === 'string' || input.logoUrl === null) {
    data.logoUrl = input.logoUrl?.trim() || null;
  }
  if (typeof input.isActive === 'boolean') {
    data.isActive = input.isActive;
  }

  return prisma.organization.update({ where: { id }, data });
}

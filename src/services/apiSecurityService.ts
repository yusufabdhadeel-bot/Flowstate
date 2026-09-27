import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';

export interface ApiKeyInput {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
  ipRestrictions?: string[];
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  scopes?: string[];
  expiresAt?: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  ipRestrictions?: string[];
}

export async function createApiKey(organizationId: string, userId: string, input: ApiKeyInput): Promise<{ key: ApiKeyResponse; secret: string }> {
  if (!input.name?.trim()) {
    throw new ValidationError('API key name is required');
  }

  const prefix = generateKeyPrefix();
  const secret = generateSecretKey();
  const secretHash = hashSecret(secret);

  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : undefined;

  const key = await prisma.apiKey.create({
    data: {
      organizationId,
      createdBy: userId,
      name: input.name.trim(),
      prefix,
      keyHash: secretHash,
      scopes: (input.scopes ?? []) as Prisma.InputJsonValue,
      expiresAt,
    },
  });

  return {
    key: {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: (input.scopes ?? []) as string[],
      expiresAt,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt ?? undefined,
      ipRestrictions: input.ipRestrictions,
    },
    secret,
  };
}

export async function validateApiKey(organizationId: string, keyPrefix: string, secret: string, ipAddress?: string): Promise<{ valid: boolean; scopes?: string[] }> {
  const secretHash = hashSecret(secret);

  const key = await prisma.apiKey.findFirst({
    where: {
      organizationId,
      prefix: keyPrefix,
      keyHash: secretHash,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!key) {
    return { valid: false };
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return { valid: true, scopes: (key.scopes as string[]) ?? [] };
}

export async function rotateApiKey(organizationId: string, keyId: string, userId: string): Promise<{ newSecret: string; oldKeyId: string }> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!key) {
    throw new NotFoundError('API key not found');
  }

  const newSecret = generateSecretKey();
  const newSecretHash = hashSecret(newSecret);
  const newPrefix = generateKeyPrefix();

  const newKey = await prisma.apiKey.create({
    data: {
      organizationId,
      createdBy: userId,
      name: `${key.name} (rotated)`,
      prefix: newPrefix,
      keyHash: newSecretHash,
      scopes: (key.scopes ?? []) as Prisma.InputJsonValue,
      expiresAt: key.expiresAt,
    },
  });

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  return { newSecret, oldKeyId: keyId };
}

export async function revokeApiKey(organizationId: string, keyId: string): Promise<boolean> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!key) {
    throw new NotFoundError('API key not found');
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  return true;
}

export async function listApiKeys(organizationId: string): Promise<ApiKeyResponse[]> {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: (key.scopes as string[]) ?? [],
    expiresAt: key.expiresAt ?? undefined,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt ?? undefined,
  }));
}

export async function updateApiKeyScopes(organizationId: string, keyId: string, newScopes: string[]): Promise<ApiKeyResponse> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!key) {
    throw new NotFoundError('API key not found');
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { scopes: newScopes as Prisma.InputJsonValue },
  });

  return {
    id: updated.id,
    name: updated.name,
    prefix: updated.prefix,
    scopes: newScopes,
    expiresAt: updated.expiresAt ?? undefined,
    createdAt: updated.createdAt,
    lastUsedAt: updated.lastUsedAt ?? undefined,
  };
}

export function generateKeyPrefix(): string {
  return `fs_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateSecretKey(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

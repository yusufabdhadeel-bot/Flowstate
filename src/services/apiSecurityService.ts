import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
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

const API_KEY_STORE = new Map<string, { secret: string; createdAt: Date; expiresAt?: Date; scopes: string[] }>();

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

  API_KEY_STORE.set(secretHash, {
    secret,
    createdAt: key.createdAt,
    expiresAt,
    scopes: (input.scopes ?? []) as string[],
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
  const keyData = API_KEY_STORE.get(secretHash);

  if (!keyData) {
    return { valid: false };
  }

  if (keyData.expiresAt && keyData.expiresAt < new Date()) {
    return { valid: false };
  }

  const key = await prisma.apiKey.findFirst({
    where: {
      organizationId,
      prefix: keyPrefix,
      isActive: true,
    },
  });

  if (!key) {
    return { valid: false };
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return { valid: true, scopes: keyData.scopes };
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

  API_KEY_STORE.set(newSecretHash, {
    secret: newSecret,
    createdAt: newKey.createdAt,
    expiresAt: newKey.expiresAt ?? undefined,
    scopes: ((key.scopes as string[]) ?? []) as string[],
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
  return `fs_${Math.random().toString(36).substring(2, 12)}`;
}

export function generateSecretKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hashSecret(secret: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(secret).digest('hex');
}

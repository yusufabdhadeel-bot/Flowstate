import { prisma } from '../prismaClient';
import crypto from 'node:crypto';

export interface SessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  browser?: string | null;
  deviceType?: string | null;
  operatingSystem?: string | null;
  ipAddress?: string | null;
  loginTime: Date;
  lastActivityTime: Date;
  expiresAt: Date;
  isActive: boolean;
  refreshTokenHash?: string | null;
  userAgent?: string | null;
}

export interface SessionCreateInput {
  userId: string;
  organizationId: string;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  deviceType?: string;
  operatingSystem?: string;
  expiresInMinutes?: number;
}

export async function createSession(input: SessionCreateInput): Promise<SessionRecord> {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInMinutes ?? 1440) * 60 * 1000);

  const session: SessionRecord = {
    id: sessionId,
    userId: input.userId,
    organizationId: input.organizationId,
    tokenHash: hashToken(sessionId),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    browser: input.browser,
    deviceType: input.deviceType,
    operatingSystem: input.operatingSystem,
    loginTime: now,
    lastActivityTime: now,
    expiresAt,
    isActive: true,
  };

  return prisma.securitySession.create({ data: session });
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const session = await prisma.securitySession.findUnique({ where: { id: sessionId } });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.securitySession.delete({ where: { id: sessionId } });
    return null;
  }

  return prisma.securitySession.update({
    where: { id: sessionId },
    data: { lastActivityTime: new Date() },
  });
}

export async function revokeSession(sessionId: string, organizationId?: string): Promise<boolean> {
  const result = await prisma.securitySession.updateMany({
    where: { id: sessionId, ...(organizationId ? { organizationId } : {}), isActive: true },
    data: { isActive: false },
  });
  return result.count > 0;
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.securitySession.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
  return result.count;
}

export function getActiveSessions(organizationId: string, userId?: string): Promise<SessionRecord[]> {
  return prisma.securitySession.findMany({
    where: { organizationId, userId, isActive: true, expiresAt: { gt: new Date() } },
    orderBy: { lastActivityTime: 'desc' },
  });
}

export function getSessionsForUser(userId: string): Promise<SessionRecord[]> {
  return prisma.securitySession.findMany({
    where: { userId, isActive: true, expiresAt: { gt: new Date() } },
    orderBy: { lastActivityTime: 'desc' },
  });
}

export async function validateSessionToken(sessionId: string, token: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const tokenHash = hashToken(token);
  return session.tokenHash === tokenHash;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.securitySession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function rotateRefreshToken(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session || !session.isActive) return null;

  const newRefreshToken = crypto.randomUUID();
  await prisma.securitySession.update({
    where: { id: sessionId },
    data: { refreshTokenHash: hashToken(newRefreshToken), lastActivityTime: new Date() },
  });
  return newRefreshToken;
}

function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';
import jwt from 'jsonwebtoken';

export interface SessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  browser?: string;
  deviceType?: string;
  operatingSystem?: string;
  ipAddress?: string;
  loginTime: Date;
  lastActivityTime: Date;
  expiresAt: Date;
  isActive: boolean;
  refreshTokenHash?: string;
  userAgent?: string;
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

const SESSIONS_MAP = new Map<string, SessionRecord>();

export function createSession(input: SessionCreateInput): SessionRecord {
  const sessionId = generateSessionId();
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

  SESSIONS_MAP.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionRecord | null {
  const session = SESSIONS_MAP.get(sessionId);
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    SESSIONS_MAP.delete(sessionId);
    return null;
  }

  session.lastActivityTime = new Date();
  return session;
}

export function revokeSession(sessionId: string): boolean {
  const session = SESSIONS_MAP.get(sessionId);
  if (session) {
    session.isActive = false;
    return true;
  }
  return false;
}

export function revokeAllUserSessions(userId: string): number {
  let count = 0;
  for (const [sessionId, session] of SESSIONS_MAP.entries()) {
    if (session.userId === userId) {
      session.isActive = false;
      count++;
    }
  }
  return count;
}

export function getActiveSessions(organizationId: string, userId?: string): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (const session of SESSIONS_MAP.values()) {
    if (session.organizationId === organizationId && session.isActive && session.expiresAt > new Date()) {
      if (!userId || session.userId === userId) {
        sessions.push(session);
      }
    }
  }
  return sessions;
}

export function getSessionsForUser(userId: string): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (const session of SESSIONS_MAP.values()) {
    if (session.userId === userId && session.isActive && session.expiresAt > new Date()) {
      sessions.push(session);
    }
  }
  return sessions;
}

export function validateSessionToken(sessionId: string, token: string): boolean {
  const session = getSession(sessionId);
  if (!session) return false;

  const tokenHash = hashToken(token);
  return session.tokenHash === tokenHash;
}

export function cleanupExpiredSessions(): number {
  let count = 0;
  for (const [sessionId, session] of SESSIONS_MAP.entries()) {
    if (session.expiresAt < new Date()) {
      SESSIONS_MAP.delete(sessionId);
      count++;
    }
  }
  return count;
}

export function rotateRefreshToken(sessionId: string): string | null {
  const session = getSession(sessionId);
  if (!session || !session.isActive) return null;

  const newRefreshToken = generateSessionId();
  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastActivityTime = new Date();
  return newRefreshToken;
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

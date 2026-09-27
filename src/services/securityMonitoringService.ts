import { prisma } from '../prismaClient';
import type { Prisma, SecurityAlertSeverity } from '@prisma/client';

export interface SecurityEvent {
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  organizationId: string;
  userId?: string;
  ipAddress?: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
}

export interface SecurityAlert {
  id: string;
  organizationId: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  userId?: string;
  ipAddress?: string;
  createdAt: Date;
  resolvedAt?: Date;
  notes?: string;
}

export async function recordSecurityEvent(event: SecurityEvent): Promise<SecurityAlert> {
  const result = await prisma.$transaction(async (tx) => {
    const storedEvent = await tx.securityEvent.create({
      data: {
        organizationId: event.organizationId,
        userId: event.userId,
        eventType: event.eventType,
        severity: event.severity as SecurityAlertSeverity,
        description: event.description,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: event.ipAddress,
        timestamp: event.timestamp,
        resolved: event.resolved,
      },
    });
    const alert = await tx.securityAlert.create({
      data: {
        organizationId: event.organizationId,
        userId: event.userId,
        eventType: event.eventType,
        severity: event.severity as SecurityAlertSeverity,
        message: event.description,
        ipAddress: event.ipAddress,
        createdAt: event.timestamp,
      },
    });
    return { storedEvent, alert };
  });
  return toAlert(result.alert);
}

export async function detectMultipleFailedLogins(organizationId: string, userId: string, ipAddress?: string, threshold = 5, windowMinutes = 15): Promise<boolean> {
  const count = await prisma.securityEvent.count({ where: { organizationId, userId, eventType: 'FAILED_LOGIN', timestamp: { gt: new Date(Date.now() - windowMinutes * 60000) } } });
  if (count < threshold) return false;
  await recordSecurityEvent({ eventType: 'BRUTE_FORCE_ATTEMPT_DETECTED', severity: 'HIGH', organizationId, userId, ipAddress, description: `Multiple failed login attempts detected for user ${userId}`, timestamp: new Date(), resolved: false });
  return true;
}

export async function detectSuspiciousLoginAttempt(organizationId: string, userId: string, ipAddress?: string, previousIps: string[] = []): Promise<boolean> {
  if (!ipAddress) return false;
  const recent = await prisma.securityEvent.findMany({ where: { organizationId, userId, eventType: 'LOGIN_SUCCESS', timestamp: { gt: new Date(Date.now() - 86400000) } }, select: { ipAddress: true } });
  const suspicious = recent.length > 0 && !previousIps.includes(ipAddress) && !recent.some((event) => event.ipAddress === ipAddress);
  if (suspicious) await recordSecurityEvent({ eventType: 'SUSPICIOUS_LOGIN_ATTEMPT', severity: 'MEDIUM', organizationId, userId, ipAddress, description: `Suspicious login from new IP address: ${ipAddress}`, timestamp: new Date(), resolved: false });
  return suspicious;
}

export async function detectImpossibleTravel(organizationId: string, userId: string, newIpLocation?: { lat: number; lon: number }, previousLocation?: { lat: number; lon: number }): Promise<boolean> {
  if (!newIpLocation || !previousLocation) return false;
  const distance = Math.sqrt(Math.pow(newIpLocation.lat - previousLocation.lat, 2) + Math.pow(newIpLocation.lon - previousLocation.lon, 2));
  const last = await prisma.securityEvent.findFirst({ where: { organizationId, userId, eventType: 'LOGIN_SUCCESS' }, orderBy: { timestamp: 'desc' } });
  if (!last) return false;
  const minutes = (Date.now() - last.timestamp.getTime()) / 60000;
  if (distance <= minutes * 0.5) return false;
  await recordSecurityEvent({ eventType: 'IMPOSSIBLE_TRAVEL', severity: 'HIGH', organizationId, userId, description: `Impossible travel detected: ${distance} km in ${minutes} minutes`, timestamp: new Date(), resolved: false });
  return true;
}

export async function detectTokenAbuse(organizationId: string, userId: string, ipAddress?: string): Promise<boolean> {
  const count = await prisma.securityEvent.count({ where: { organizationId, userId, eventType: 'TOKEN_USED', timestamp: { gt: new Date(Date.now() - 60000) } } });
  if (count <= 100) return false;
  await recordSecurityEvent({ eventType: 'TOKEN_ABUSE_DETECTED', severity: 'CRITICAL', organizationId, userId, ipAddress, description: 'Abnormally high token usage detected', timestamp: new Date(), resolved: false });
  return true;
}

export async function detectPermissionEscalation(organizationId: string, userId: string, attemptedAction: string, userRole: string): Promise<boolean> {
  if (['ADMIN', 'SUPERADMIN'].includes(userRole)) return false;
  await recordSecurityEvent({ eventType: 'PERMISSION_ESCALATION_ATTEMPT', severity: 'HIGH', organizationId, userId, description: `User with role ${userRole} attempted privileged action: ${attemptedAction}`, timestamp: new Date(), resolved: false });
  return true;
}

export async function detectCrossTenantAccess(organizationId: string, userId: string, attemptedOrgId: string, ipAddress?: string): Promise<boolean> {
  if (organizationId === attemptedOrgId) return false;
  await recordSecurityEvent({ eventType: 'CROSS_TENANT_ACCESS_ATTEMPT', severity: 'CRITICAL', organizationId, userId, ipAddress, description: `User attempted to access different organization: ${attemptedOrgId}`, timestamp: new Date(), resolved: false });
  return true;
}

export async function getSecurityAlerts(organizationId: string, unresolved = true): Promise<SecurityAlert[]> {
  const alerts = await prisma.securityAlert.findMany({ where: { organizationId, ...(unresolved ? { resolvedAt: null } : {}) }, orderBy: { createdAt: 'desc' } });
  return alerts.map(toAlert);
}

export async function resolveSecurityAlert(alertId: string, organizationId: string, notes?: string): Promise<SecurityAlert | null> {
  const existing = await prisma.securityAlert.findFirst({ where: { id: alertId, organizationId } });
  if (!existing) return null;
  return toAlert(await prisma.securityAlert.update({ where: { id: alertId }, data: { resolvedAt: new Date(), notes } }));
}

export async function getSecurityEventHistory(organizationId: string, limit = 100): Promise<SecurityEvent[]> {
  const events = await prisma.securityEvent.findMany({ where: { organizationId }, orderBy: { timestamp: 'desc' }, take: limit });
  return events.map((event) => ({ eventType: event.eventType, severity: event.severity, organizationId: event.organizationId, userId: event.userId ?? undefined, ipAddress: event.ipAddress ?? undefined, description: event.description, metadata: (event.metadata as Record<string, unknown> | null) ?? undefined, timestamp: event.timestamp, resolved: event.resolved }));
}

function toAlert(alert: { id: string; organizationId: string; eventType: string; severity: SecurityAlertSeverity; message: string; userId: string | null; ipAddress: string | null; createdAt: Date; resolvedAt: Date | null; notes: string | null }): SecurityAlert {
  return { id: alert.id, organizationId: alert.organizationId, eventType: alert.eventType, severity: alert.severity, message: alert.message, userId: alert.userId ?? undefined, ipAddress: alert.ipAddress ?? undefined, createdAt: alert.createdAt, resolvedAt: alert.resolvedAt ?? undefined, notes: alert.notes ?? undefined };
}

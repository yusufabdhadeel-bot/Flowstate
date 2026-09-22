import { NotFoundError, ValidationError } from '../errors';

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

const SECURITY_EVENTS: SecurityEvent[] = [];
const SECURITY_ALERTS: Map<string, SecurityAlert> = new Map();
let ALERT_COUNTER = 0;

export function recordSecurityEvent(event: SecurityEvent) {
  SECURITY_EVENTS.push(event);

  const alert: SecurityAlert = {
    id: `alert-${++ALERT_COUNTER}`,
    organizationId: event.organizationId,
    eventType: event.eventType,
    severity: event.severity,
    message: event.description,
    userId: event.userId,
    ipAddress: event.ipAddress,
    createdAt: event.timestamp,
  };

  SECURITY_ALERTS.set(alert.id, alert);
  return alert;
}

export function detectMultipleFailedLogins(organizationId: string, userId: string, ipAddress?: string, threshold = 5, windowMinutes = 15): boolean {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  const failedAttempts = SECURITY_EVENTS.filter((event) => event.eventType === 'FAILED_LOGIN' && event.userId === userId && event.organizationId === organizationId && event.timestamp.getTime() > now - windowMs).length;

  if (failedAttempts >= threshold) {
    recordSecurityEvent({
      eventType: 'BRUTE_FORCE_ATTEMPT_DETECTED',
      severity: 'HIGH',
      organizationId,
      userId,
      ipAddress,
      description: `Multiple failed login attempts detected for user ${userId}`,
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function detectSuspiciousLoginAttempt(organizationId: string, userId: string, ipAddress?: string, previousIps: string[] = []): boolean {
  if (!ipAddress) return false;

  const recentLogins = SECURITY_EVENTS.filter((event) => event.eventType === 'LOGIN_SUCCESS' && event.userId === userId && event.organizationId === organizationId && event.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000);

  const suspiciousIp = recentLogins.length > 0 && !previousIps.includes(ipAddress) && !recentLogins.some((login) => login.ipAddress === ipAddress);

  if (suspiciousIp) {
    recordSecurityEvent({
      eventType: 'SUSPICIOUS_LOGIN_ATTEMPT',
      severity: 'MEDIUM',
      organizationId,
      userId,
      ipAddress,
      description: `Suspicious login from new IP address: ${ipAddress}`,
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function detectImpossibleTravel(organizationId: string, userId: string, newIpLocation?: { lat: number; lon: number }, previousLocation?: { lat: number; lon: number }): boolean {
  if (!newIpLocation || !previousLocation) return false;

  const distance = Math.sqrt(Math.pow(newIpLocation.lat - previousLocation.lat, 2) + Math.pow(newIpLocation.lon - previousLocation.lon, 2));
  const timeSinceLastLogin = SECURITY_EVENTS
    .filter((event) => event.eventType === 'LOGIN_SUCCESS' && event.userId === userId && event.organizationId === organizationId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 1);

  if (timeSinceLastLogin.length === 0) return false;

  const minutesBetween = (Date.now() - timeSinceLastLogin[0].timestamp.getTime()) / (1000 * 60);
  const maxTravelDistance = minutesBetween * 0.5;

  if (distance > maxTravelDistance) {
    recordSecurityEvent({
      eventType: 'IMPOSSIBLE_TRAVEL',
      severity: 'HIGH',
      organizationId,
      userId,
      description: `Impossible travel detected: ${distance} km in ${minutesBetween} minutes`,
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function detectTokenAbuse(organizationId: string, userId: string, ipAddress?: string): boolean {
  const recentTokenUse = SECURITY_EVENTS.filter((event) => event.eventType === 'TOKEN_USED' && event.userId === userId && event.organizationId === organizationId && event.timestamp.getTime() > Date.now() - 60 * 1000);

  if (recentTokenUse.length > 100) {
    recordSecurityEvent({
      eventType: 'TOKEN_ABUSE_DETECTED',
      severity: 'CRITICAL',
      organizationId,
      userId,
      ipAddress,
      description: 'Abnormally high token usage detected',
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function detectPermissionEscalation(organizationId: string, userId: string, attemptedAction: string, userRole: string): boolean {
  if (!['ADMIN', 'SUPERADMIN'].includes(userRole)) {
    recordSecurityEvent({
      eventType: 'PERMISSION_ESCALATION_ATTEMPT',
      severity: 'HIGH',
      organizationId,
      userId,
      description: `User with role ${userRole} attempted privileged action: ${attemptedAction}`,
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function detectCrossTenantAccess(organizationId: string, userId: string, attemptedOrgId: string, ipAddress?: string): boolean {
  if (organizationId !== attemptedOrgId) {
    recordSecurityEvent({
      eventType: 'CROSS_TENANT_ACCESS_ATTEMPT',
      severity: 'CRITICAL',
      organizationId,
      userId,
      ipAddress,
      description: `User attempted to access different organization: ${attemptedOrgId}`,
      timestamp: new Date(),
      resolved: false,
    });
    return true;
  }

  return false;
}

export function getSecurityAlerts(organizationId: string, unresolved = true): SecurityAlert[] {
  return Array.from(SECURITY_ALERTS.values()).filter(
    (alert) => alert.organizationId === organizationId && (!unresolved || !alert.resolvedAt),
  );
}

export function resolveSecurityAlert(alertId: string, notes?: string): SecurityAlert | null {
  const alert = SECURITY_ALERTS.get(alertId);
  if (!alert) return null;

  alert.resolvedAt = new Date();
  alert.notes = notes;
  return alert;
}

export function getSecurityEventHistory(organizationId: string, limit = 100): SecurityEvent[] {
  return SECURITY_EVENTS
    .filter((event) => event.organizationId === organizationId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

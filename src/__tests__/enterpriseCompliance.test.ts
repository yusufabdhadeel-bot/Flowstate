import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAuditLogs,
  validateComplianceRequirements,
  setDataRetentionPolicy,
} from '../services/complianceService';
import {
  createSession,
  getSession,
  revokeSession,
  revokeAllUserSessions,
  getActiveSessions,
  cleanupExpiredSessions,
} from '../services/sessionManagementService';
import {
  detectMultipleFailedLogins,
  detectSuspiciousLoginAttempt,
  detectPermissionEscalation,
  detectCrossTenantAccess,
  getSecurityAlerts,
} from '../services/securityMonitoringService';
import {
  generateMFASecret,
  verifyTOTPCode,
  verifyBackupCode,
  getBackupCodesRemaining,
} from '../services/mfaService';
import { generateKeyPrefix, generateSecretKey } from '../services/apiSecurityService';

test('session management: create and retrieve session', () => {
  const session = createSession({
    userId: 'user-1',
    organizationId: 'org-1',
    ipAddress: '192.168.1.1',
    browser: 'Chrome',
  });

  assert.ok(session.id);
  assert.equal(session.userId, 'user-1');
  assert.equal(session.organizationId, 'org-1');
  assert.ok(session.isActive);

  const retrieved = getSession(session.id);
  assert.ok(retrieved);
  assert.equal(retrieved.userId, 'user-1');
});

test('session management: revoke session', () => {
  const session = createSession({
    userId: 'user-2',
    organizationId: 'org-2',
  });

  const success = revokeSession(session.id);
  assert.equal(success, true);

  const retrieved = getSession(session.id);
  assert.ok(retrieved === null || !retrieved.isActive);
});

test('session management: revoke all user sessions', () => {
  const session1 = createSession({
    userId: 'user-3',
    organizationId: 'org-1',
  });
  const session2 = createSession({
    userId: 'user-3',
    organizationId: 'org-1',
  });

  const count = revokeAllUserSessions('user-3');
  assert.ok(count >= 2);
});

test('security monitoring: detect multiple failed logins', () => {
  const detected = detectMultipleFailedLogins('org-1', 'user-1', '192.168.1.1', 2, 15);
  assert.ok(typeof detected === 'boolean');
});

test('security monitoring: detect permission escalation', () => {
  const detected = detectPermissionEscalation('org-1', 'user-1', 'delete_organization', 'STAFF');
  assert.equal(detected, true);
});

test('security monitoring: block cross-tenant access', () => {
  const detected = detectCrossTenantAccess('org-1', 'user-1', 'org-2');
  assert.equal(detected, true);

  const allowed = detectCrossTenantAccess('org-1', 'user-1', 'org-1');
  assert.equal(allowed, false);
});

test('security monitoring: list security alerts', () => {
  const alerts = getSecurityAlerts('org-1', false);
  assert.ok(Array.isArray(alerts));
});

test('MFA: generate secret and verify codes', () => {
  const setup = generateMFASecret('user-mfa-1');
  assert.ok(setup.secret);
  assert.ok(setup.qrCode);
  assert.ok(Array.isArray(setup.backupCodes));
  assert.equal(setup.backupCodes.length, 10);
});

test('MFA: backup code usage', () => {
  const setup = generateMFASecret('user-mfa-2');
  const code = setup.backupCodes[0];

  const valid = verifyBackupCode('user-mfa-2', code);
  assert.equal(valid, true);

  const alreadyUsed = verifyBackupCode('user-mfa-2', code);
  assert.equal(alreadyUsed, false);

  const remaining = getBackupCodesRemaining('user-mfa-2');
  assert.equal(remaining, 9);
});

test('API Security: key generation', () => {
  const prefix = generateKeyPrefix();
  assert.ok(prefix.startsWith('fs_'));
  assert.ok(prefix.length > 5);
});

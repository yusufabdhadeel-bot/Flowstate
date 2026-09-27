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
  getSecurityEventHistory,
} from '../services/securityMonitoringService';
import {
  generateMFASecret,
  verifyBackupCode,
  getBackupCodesRemaining,
  verifyTOTPCode,
  disableMFA,
} from '../services/mfaService';
import { generateKeyPrefix, generateSecretKey } from '../services/apiSecurityService';

test('session management: create and retrieve session', async () => {
  const session = await createSession({
    userId: 'user-1',
    organizationId: 'org-1',
    ipAddress: '192.168.1.1',
    browser: 'Chrome',
  });

  assert.ok(session.id);
  assert.equal(session.userId, 'user-1');
  assert.equal(session.organizationId, 'org-1');
  assert.ok(session.isActive);

  const retrieved = await getSession(session.id);
  assert.ok(retrieved);
  assert.equal(retrieved.userId, 'user-1');
});

test('session management: revoke session', async () => {
  const session = await createSession({
    userId: 'user-2',
    organizationId: 'org-2',
  });

  const success = await revokeSession(session.id);
  assert.equal(success, true);

  const retrieved = await getSession(session.id);
  assert.ok(retrieved === null || !retrieved.isActive);
});

test('session management: revoke all user sessions', async () => {
  const session1 = await createSession({
    userId: 'user-3',
    organizationId: 'org-1',
  });
  const session2 = await createSession({
    userId: 'user-3',
    organizationId: 'org-1',
  });

  const count = await revokeAllUserSessions('user-3');
  assert.ok(count >= 2);
});

test('security monitoring: detect multiple failed logins', async () => {
  const detected = await detectMultipleFailedLogins('org-1', 'user-1', '192.168.1.1', 2, 15);
  assert.ok(typeof detected === 'boolean');
});

test('security monitoring: detect permission escalation', async () => {
  const detected = await detectPermissionEscalation('org-1', 'user-1', 'delete_organization', 'STAFF');
  assert.equal(detected, true);
});

test('security monitoring: block cross-tenant access', async () => {
  const detected = await detectCrossTenantAccess('org-1', 'user-1', 'org-2');
  assert.equal(detected, true);

  const allowed = await detectCrossTenantAccess('org-1', 'user-1', 'org-1');
  assert.equal(allowed, false);
});

test('security monitoring: list security alerts', async () => {
  const alerts = await getSecurityAlerts('org-1', false);
  assert.ok(Array.isArray(alerts));
  const events = await getSecurityEventHistory('org-1');
  assert.ok(events.every((event) => event.organizationId === 'org-1'));
});

test('MFA: generate secret and verify codes', async () => {
  const setup = await generateMFASecret('user-mfa-1');
  assert.ok(setup.secret);
  assert.ok(setup.qrCode);
  assert.ok(Array.isArray(setup.backupCodes));
  assert.equal(setup.backupCodes.length, 10);
});

test('MFA: backup code usage', async () => {
  const setup = await generateMFASecret('user-mfa-2');
  const code = setup.backupCodes[0];

  const valid = await verifyBackupCode('user-mfa-2', code);
  assert.equal(valid, true);

  const alreadyUsed = await verifyBackupCode('user-mfa-2', code);
  assert.equal(alreadyUsed, false);

  const remaining = await getBackupCodesRemaining('user-mfa-2');
  assert.equal(remaining, 9);

  assert.equal(await verifyTOTPCode('user-mfa-2', '000000'), false);
  assert.equal(await disableMFA('user-mfa-2'), true);
});

test('API Security: key generation', () => {
  const prefix = generateKeyPrefix();
  assert.ok(prefix.startsWith('fs_'));
  assert.ok(prefix.length > 5);
});

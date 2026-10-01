import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
import { prisma } from '../prismaClient';

// Every ID below is a real UUID because the security tables declare these
// columns as @db.Uuid and the database rejects malformed values. The literals
// are fixed (not random) so the equality assertions remain deterministic.
const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const USER_3 = '33333333-3333-4333-8333-333333333333';
const USER_MFA_1 = '44444444-4444-4444-8444-444444444444';
const USER_MFA_2 = '55555555-5555-4555-8555-555555555555';
const ORG_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ALL_USER_IDS = [USER_1, USER_2, USER_3, USER_MFA_1, USER_MFA_2];
const ALL_ORG_IDS = [ORG_1, ORG_2];

function secret() {
  return crypto.randomBytes(32).toString('hex');
}

// SecuritySession/MfaCredential/SecurityEvent all carry foreign keys to User
// and Organization, so the parent rows must exist before the tests run.
before(async () => {
  await prisma.organization.createMany({
    data: [
      { id: ORG_1, name: 'Org One', slug: 'org-one' },
      { id: ORG_2, name: 'Org Two', slug: 'org-two' },
    ],
  });

  await prisma.user.createMany({
    data: ALL_USER_IDS.map((id, index) => ({
      id,
      name: `Fixture User ${index + 1}`,
      email: `fixture-${index + 1}@example.test`,
      passwordHash: secret(),
      role: 'STAFF' as const,
      organizationId: index < 3 ? ORG_1 : ORG_2,
    })),
  });
});

after(async () => {
  await prisma.securityAlert.deleteMany({ where: { organizationId: { in: ALL_ORG_IDS } } });
  await prisma.securityEvent.deleteMany({ where: { organizationId: { in: ALL_ORG_IDS } } });
  await prisma.securitySession.deleteMany({ where: { userId: { in: ALL_USER_IDS } } });
  await prisma.mfaCredential.deleteMany({ where: { userId: { in: ALL_USER_IDS } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL_USER_IDS } } });
  await prisma.organization.deleteMany({ where: { id: { in: ALL_ORG_IDS } } });
  await prisma.$disconnect();
});

test('session management: create and retrieve session', async () => {
  const session = await createSession({
    userId: USER_1,
    organizationId: ORG_1,
    ipAddress: '192.168.1.1',
    browser: 'Chrome',
  });

  assert.ok(session.id);
  assert.equal(session.userId, USER_1);
  assert.equal(session.organizationId, ORG_1);
  assert.ok(session.isActive);

  const retrieved = await getSession(session.id);
  assert.ok(retrieved);
  assert.equal(retrieved.userId, USER_1);
});

test('session management: revoke session', async () => {
  const session = await createSession({
    userId: USER_2,
    organizationId: ORG_2,
  });

  const success = await revokeSession(session.id);
  assert.equal(success, true);

  const retrieved = await getSession(session.id);
  assert.ok(retrieved === null || !retrieved.isActive);
});

test('session management: revoke all user sessions', async () => {
  const session1 = await createSession({
    userId: USER_3,
    organizationId: ORG_1,
  });
  const session2 = await createSession({
    userId: USER_3,
    organizationId: ORG_1,
  });

  const count = await revokeAllUserSessions(USER_3);
  assert.ok(count >= 2);
});

test('security monitoring: detect multiple failed logins', async () => {
  const detected = await detectMultipleFailedLogins(ORG_1, USER_1, '192.168.1.1', 2, 15);
  assert.ok(typeof detected === 'boolean');
});

test('security monitoring: detect permission escalation', async () => {
  const detected = await detectPermissionEscalation(ORG_1, USER_1, 'delete_organization', 'STAFF');
  assert.equal(detected, true);
});

test('security monitoring: block cross-tenant access', async () => {
  const detected = await detectCrossTenantAccess(ORG_1, USER_1, ORG_2);
  assert.equal(detected, true);

  const allowed = await detectCrossTenantAccess(ORG_1, USER_1, ORG_1);
  assert.equal(allowed, false);
});

test('security monitoring: list security alerts', async () => {
  const alerts = await getSecurityAlerts(ORG_1, false);
  assert.ok(Array.isArray(alerts));
  const events = await getSecurityEventHistory(ORG_1);
  assert.ok(events.every((event) => event.organizationId === ORG_1));
});

test('MFA: generate secret and verify codes', async () => {
  const setup = await generateMFASecret(USER_MFA_1);
  assert.ok(setup.secret);
  assert.ok(setup.qrCode);
  assert.ok(Array.isArray(setup.backupCodes));
  assert.equal(setup.backupCodes.length, 10);
});

test('MFA: backup code usage', async () => {
  const setup = await generateMFASecret(USER_MFA_2);
  const code = setup.backupCodes[0];

  const valid = await verifyBackupCode(USER_MFA_2, code);
  assert.equal(valid, true);

  const alreadyUsed = await verifyBackupCode(USER_MFA_2, code);
  assert.equal(alreadyUsed, false);

  const remaining = await getBackupCodesRemaining(USER_MFA_2);
  assert.equal(remaining, 9);

  assert.equal(await verifyTOTPCode(USER_MFA_2, '000000'), false);
  assert.equal(await disableMFA(USER_MFA_2), true);
});

test('API Security: key generation', () => {
  const prefix = generateKeyPrefix();
  assert.ok(prefix.startsWith('fs_'));
  assert.ok(prefix.length > 5);
});

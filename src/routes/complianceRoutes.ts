import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import {
  filterAuditLogs,
  exportAuditLogs,
  setDataRetentionPolicy,
  setCompliancePolicy,
  validateComplianceRequirements,
} from '../services/complianceService';
import {
  getActiveSessions,
  revokeSession,
  revokeAllUserSessions,
  getSessionsForUser,
  cleanupExpiredSessions,
} from '../services/sessionManagementService';
import {
  getSecurityAlerts,
  resolveSecurityAlert,
  getSecurityEventHistory,
} from '../services/securityMonitoringService';
import {
  generateMFASecret,
  verifyTOTPCode,
  verifyBackupCode,
  getBackupCodesRemaining,
  disableMFA,
  getTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
} from '../services/mfaService';
import {
  createApiKey,
  validateApiKey,
  rotateApiKey,
  revokeApiKey,
  listApiKeys,
  updateApiKeyScopes,
} from '../services/apiSecurityService';

const router = Router();

// COMPLIANCE & GOVERNANCE ENDPOINTS

router.get('/audit-logs', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await filterAuditLogs(
      organizationId,
      {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        userId: req.query.userId as string,
        resourceType: req.query.resourceType as string,
        resourceId: req.query.resourceId as string,
        action: req.query.action as string,
      },
      limit,
      offset,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/audit-logs/export', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const logs = await exportAuditLogs(organizationId, req.body);
    res.json({ logs, count: logs.length });
  } catch (error) {
    next(error);
  }
});

router.put('/compliance/retention-policies', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const result = await setDataRetentionPolicy(organizationId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/compliance/policies', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const result = await setCompliancePolicy(organizationId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/compliance/validate/:userId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const result = await validateComplianceRequirements(organizationId, req.params.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// SESSION MANAGEMENT ENDPOINTS

router.get('/sessions', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const userId = (req.query.userId as string) || undefined;
    const sessions = getActiveSessions(organizationId, userId);
    res.json({ sessions, count: sessions.length });
  } catch (error) {
    next(error);
  }
});

router.post('/sessions/:sessionId/revoke', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const success = revokeSession(req.params.sessionId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/sessions/logout-all', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const count = revokeAllUserSessions(req.params.userId);
    res.json({ loggedOutSessions: count });
  } catch (error) {
    next(error);
  }
});

// SECURITY MONITORING ENDPOINTS

router.get('/security/alerts', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const unresolved = req.query.unresolved !== 'false';
    const alerts = getSecurityAlerts(organizationId, unresolved);
    res.json({ alerts, count: alerts.length });
  } catch (error) {
    next(error);
  }
});

router.post('/security/alerts/:alertId/resolve', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const alert = resolveSecurityAlert(req.params.alertId, req.body.notes);
    if (alert) {
      res.json(alert);
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    next(error);
  }
});

router.get('/security/events', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const events = getSecurityEventHistory(organizationId, limit);
    res.json({ events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// MFA ENDPOINTS

router.post('/mfa/setup', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const setup = generateMFASecret(userId);
    res.json({ secret: setup.secret, qrCode: setup.qrCode, backupCodes: setup.backupCodes });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify-totp', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body;
    const valid = verifyTOTPCode(userId, code);
    res.json({ valid });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify-backup', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body;
    const valid = verifyBackupCode(userId, code);
    res.json({ valid });
  } catch (error) {
    next(error);
  }
});

router.get('/mfa/backup-codes-remaining', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const remaining = getBackupCodesRemaining(userId);
    res.json({ remaining });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/disable', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const success = disableMFA(userId);
    res.json({ success });
  } catch (error) {
    next(error);
  }
});

router.get('/mfa/trusted-devices', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const devices = getTrustedDevices(userId);
    res.json({ devices });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/trusted-devices/:deviceId/revoke', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const success = revokeTrustedDevice(userId, req.params.deviceId);
    res.json({ success });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/trusted-devices/revoke-all', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const count = revokeAllTrustedDevices(userId);
    res.json({ revokedCount: count });
  } catch (error) {
    next(error);
  }
});

// API KEY MANAGEMENT ENDPOINTS

router.post('/api-keys', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const result = await createApiKey(organizationId, userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api-keys', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const keys = await listApiKeys(organizationId);
    res.json({ keys });
  } catch (error) {
    next(error);
  }
});

router.post('/api-keys/:keyId/rotate', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const result = await rotateApiKey(organizationId, req.params.keyId, userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/api-keys/:keyId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    await revokeApiKey(organizationId, req.params.keyId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.put('/api-keys/:keyId/scopes', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const { scopes } = req.body;
    const result = await updateApiKeyScopes(organizationId, req.params.keyId, scopes);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

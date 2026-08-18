import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { createApiKey, createWebhook, listWebhooks } from '../services/integrationService';

const router = Router();

router.post('/webhooks', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const webhook = await createWebhook({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id); res.status(201).json({ webhook }); } catch (error) { next(error); }
});

router.get('/webhooks', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const webhooks = await listWebhooks(req.params.organizationId || req.user!.organizationId!, req.user!.id); res.json({ webhooks }); } catch (error) { next(error); }
});

router.post('/api-keys', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const apiKey = await createApiKey({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id); res.status(201).json({ apiKey }); } catch (error) { next(error); }
});

export default router;
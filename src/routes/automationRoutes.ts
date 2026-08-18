import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { createAutomationRule, executeAutomationRule, listAutomationRules } from '../services/automationService';

const router = Router();

router.post('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const rule = await createAutomationRule({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id);
    res.status(201).json({ rule });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const rules = await listAutomationRules(req.params.organizationId, req.user!.id);
    res.json({ rules });
  } catch (error) { next(error); }
});

router.post('/:id/execute', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const execution = await executeAutomationRule(req.params.id, { organizationId: req.user!.organizationId ?? req.body.organizationId });
    res.status(201).json({ execution });
  } catch (error) { next(error); }
});

export default router;
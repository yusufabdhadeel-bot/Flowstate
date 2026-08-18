import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { searchPlatform } from '../services/searchService';

const router = Router();

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const result = await searchPlatform(req.params.organizationId, req.user!.id, req.query.q as string, { page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20) }); res.json(result); } catch (error) { next(error); }
});

export default router;
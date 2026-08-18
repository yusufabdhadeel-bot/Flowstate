import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { listFiles, softDeleteFile, uploadFile } from '../services/fileService';

const router = Router();

router.post('/upload', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const file = await uploadFile({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id); res.status(201).json({ file }); } catch (error) { next(error); }
});

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const files = await listFiles(req.params.organizationId, req.user!.id); res.json({ files }); } catch (error) { next(error); }
});

router.delete('/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { await softDeleteFile(req.params.id, req.body.organizationId ?? req.user!.organizationId!, req.user!.id); res.status(204).send(); } catch (error) { next(error); }
});

export default router;
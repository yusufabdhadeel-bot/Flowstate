import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { getMemberById, listMembers, removeMember, updateMember } from '../services/teamService';

const router = Router();

router.get('/organizations/:organizationId/members', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const members = await listMembers(req.params.organizationId, req.user!.id, req.query.q as string | undefined);
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

router.get('/organizations/:organizationId/members/:memberId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const member = await getMemberById(req.params.memberId, req.params.organizationId, req.user!.id);
    res.json({ member });
  } catch (error) {
    next(error);
  }
});

router.put('/organizations/:organizationId/members/:memberId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const member = await updateMember(req.params.memberId, req.params.organizationId, req.user!.id, req.body);
    res.json({ member });
  } catch (error) {
    next(error);
  }
});

router.delete('/organizations/:organizationId/members/:memberId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    await removeMember(req.params.memberId, req.params.organizationId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

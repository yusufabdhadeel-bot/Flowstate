import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import {
  acceptInvitation,
  cancelInvitation,
  getInvitationById,
  inviteUser,
  listInvitations,
  resendInvitation,
  validateInvitationToken,
} from '../services/invitationService';

const router = Router();

router.post('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const invitation = await inviteUser({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id);
    res.status(201).json({ invitation });
  } catch (error) {
    next(error);
  }
});

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const invitations = await listInvitations(req.params.organizationId, req.user!.id);
    res.json({ invitations });
  } catch (error) {
    next(error);
  }
});

router.get('/organizations/:organizationId/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const invitation = await getInvitationById(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ invitation });
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:organizationId/:id/resend', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const invitation = await resendInvitation(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ invitation });
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:organizationId/:id/cancel', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const invitation = await cancelInvitation(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ invitation });
  } catch (error) {
    next(error);
  }
});

router.get('/validate/:token', async (req, res, next) => {
  try {
    const invitation = await validateInvitationToken(req.params.token);
    res.json({ invitation });
  } catch (error) {
    next(error);
  }
});

router.post('/accept', async (req, res, next) => {
  try {
    const result = await acceptInvitation(req.body.token, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

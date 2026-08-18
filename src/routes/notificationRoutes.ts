import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { createNotification, listNotifications, markNotificationsRead } from '../services/notificationService';

const router = Router();

router.post('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const notification = await createNotification({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id); res.status(201).json({ notification }); } catch (error) { next(error); }
});

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const notifications = await listNotifications(req.params.organizationId, req.user!.id); res.json({ notifications }); } catch (error) { next(error); }
});

router.post('/read', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const result = await markNotificationsRead(req.body.organizationId ?? req.user!.organizationId!, req.user!.id, req.body.notificationIds); res.json({ result }); } catch (error) { next(error); }
});

export default router;
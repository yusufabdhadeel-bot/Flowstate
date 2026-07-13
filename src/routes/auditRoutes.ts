import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { prisma } from '../prismaClient';
import { assertSameTenant } from '../middleware/tenant';

const router = Router();

router.get('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }
    assertSameTenant(log.organizationId, req.organizationId);
    res.json({ log });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { prisma } from '../prismaClient';
import { assertSameTenant } from '../middleware/tenant';

const router = Router();

router.get('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ comments });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    assertSameTenant(comment.organizationId, req.organizationId);
    res.json({ comment });
  } catch (error) {
    next(error);
  }
});

export default router;

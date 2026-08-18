import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess } from '../middleware/tenant';
import { ForbiddenError } from '../errors';
import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
} from '../services/organizationService';
import { onboardOrganization } from '../services/onboardingService';

const router = Router();

router.post('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create organizations');
    }

    const organization = await createOrganization(req.body);
    res.status(201).json({ organization });
  } catch (error) {
    next(error);
  }
});

router.post('/onboard', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const result = await onboardOrganization(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireTenantAccess, async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id !== req.user?.organizationId) {
      throw new ForbiddenError('Forbidden: organization mismatch');
    }

    const organization = await getOrganizationById(req.params.id);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

router.get('/slug/:slug', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const organization = await getOrganizationBySlug(req.params.slug);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticateToken, requireTenantAccess, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update organizations');
    }
    if (req.params.id !== req.user.organizationId) {
      throw new ForbiddenError('Forbidden: organization mismatch');
    }

    const organization = await updateOrganization(req.params.id, req.body);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

export default router;

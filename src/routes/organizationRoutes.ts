import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { ForbiddenError, ValidationError } from '../errors';
import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
} from '../services/organizationService';

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

router.get('/:id', async (req, res, next) => {
  try {
    const organization = await getOrganizationById(req.params.id);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

router.get('/slug/:slug', async (req, res, next) => {
  try {
    const organization = await getOrganizationBySlug(req.params.slug);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update organizations');
    }

    const organization = await updateOrganization(req.params.id, req.body);
    res.json({ organization });
  } catch (error) {
    next(error);
  }
});

export default router;

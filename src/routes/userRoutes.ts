import { Router } from 'express';
import {
  assignManager,
  createUser,
  getDirectReports,
  getHierarchyChain,
  getManager,
  getUserById,
} from '../services/userService';
import { ValidationError, NotFoundError } from '../errors';

const router = Router();

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await getUserById(userId);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/manager', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const manager = await getManager(userId);
    res.json({ manager });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/direct-reports', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const reports = await getDirectReports(userId);
    res.json({ directReports: reports });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/hierarchy', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const chain = await getHierarchyChain(userId);
    res.json({ hierarchy: chain });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/assign-manager', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { managerId } = req.body;
    if (!managerId) {
      throw new ValidationError('managerId is required');
    }
    const updatedUser = await assignManager(userId, managerId);
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

export default router;

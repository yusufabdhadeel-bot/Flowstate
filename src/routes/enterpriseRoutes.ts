import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import {
  createDepartment,
  updateDepartment,
  archiveDepartment,
  restoreDepartment,
  deleteDepartment,
  getOrganizationAdminSnapshot,
  updateOrganizationEnterpriseSettings,
} from '../services/enterpriseAdminService';

const router = Router();

router.get('/dashboard', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const snapshot = await getOrganizationAdminSnapshot(organizationId);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

router.put('/settings', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const result = await updateOrganizationEnterpriseSettings(organizationId, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/departments', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const department = await createDepartment(organizationId, req.body);
    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
});

router.put('/departments/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const department = await updateDepartment(req.params.id, organizationId, req.body);
    res.json(department);
  } catch (error) {
    next(error);
  }
});

router.post('/departments/:id/archive', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const department = await archiveDepartment(req.params.id, organizationId);
    res.json(department);
  } catch (error) {
    next(error);
  }
});

router.post('/departments/:id/restore', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    const department = await restoreDepartment(req.params.id, organizationId);
    res.json(department);
  } catch (error) {
    next(error);
  }
});

router.delete('/departments/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const organizationId = req.organizationId!;
    await deleteDepartment(req.params.id, organizationId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

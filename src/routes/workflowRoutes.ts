import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import {
  activateWorkflow,
  approveWorkflowStep,
  createWorkflow,
  deactivateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  executeWorkflowForMemo,
  getWorkflow,
  listWorkflows,
  rejectWorkflowStep,
  reorderWorkflowSteps,
  setDefaultWorkflow,
  updateWorkflow,
} from '../services/workflowService';

const router = Router();

router.post('/', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await createWorkflow({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id);
    res.status(201).json({ workflow });
  } catch (error) {
    next(error);
  }
});

router.get('/organizations/:organizationId', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflows = await listWorkflows(req.params.organizationId, req.user!.id);
    res.json({ workflows });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await getWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.put('/organizations/:organizationId/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await updateWorkflow(req.params.id, req.params.organizationId, req.user!.id, req.body);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.delete('/organizations/:organizationId/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    await deleteWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/:id/duplicate', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await duplicateWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.status(201).json({ workflow });
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/:id/activate', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await activateWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/:id/deactivate', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await deactivateWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/:id/default', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await setDefaultWorkflow(req.params.id, req.params.organizationId, req.user!.id);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/:id/reorder', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const workflow = await reorderWorkflowSteps(req.params.id, req.params.organizationId, req.user!.id, req.body.steps);
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.post('/memos/:memoId/execute', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const result = await executeWorkflowForMemo(req.params.memoId, req.user!.id);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.post('/steps/:stepInstanceId/approve', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const result = await approveWorkflowStep(req.params.stepInstanceId, req.user!.id, req.body.comment);
    res.json({ result });
  } catch (error) { next(error); }
});

router.post('/steps/:stepInstanceId/reject', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const result = await rejectWorkflowStep(req.params.stepInstanceId, req.user!.id, req.body.comment);
    res.json({ result });
  } catch (error) { next(error); }
});

export default router;
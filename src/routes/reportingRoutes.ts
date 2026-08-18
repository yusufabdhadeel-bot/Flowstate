import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';
import { createReportTemplate, generateReport, getDashboardSummary, listReportTemplates } from '../services/reportingService';

const router = Router();

router.post('/templates', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const template = await createReportTemplate({ ...req.body, organizationId: req.body.organizationId ?? req.user!.organizationId }, req.user!.id); res.status(201).json({ template }); } catch (error) { next(error); }
});

router.get('/templates', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const templates = await listReportTemplates(req.params.organizationId || req.user!.organizationId!, req.user!.id); res.json({ templates }); } catch (error) { next(error); }
});

router.post('/generate', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const report = await generateReport(req.body.organizationId ?? req.user!.organizationId!, req.user!.id, req.body); res.status(201).json({ report }); } catch (error) { next(error); }
});

router.get('/dashboard', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try { const summary = await getDashboardSummary(req.params.organizationId || req.user!.organizationId!, req.user!.id); res.json({ summary }); } catch (error) { next(error); }
});

export default router;
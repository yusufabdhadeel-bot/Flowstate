import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import memoRoutes from './routes/memoRoutes';
import aiRoutes from './routes/aiRoutes';
import organizationRoutes from './routes/organizationRoutes';
import commentRoutes from './routes/commentRoutes';
import auditRoutes from './routes/auditRoutes';
import invitationRoutes from './routes/invitationRoutes';
import teamRoutes from './routes/teamRoutes';
import workflowRoutes from './routes/workflowRoutes';
import automationRoutes from './routes/automationRoutes';
import reportingRoutes from './routes/reportingRoutes';
import searchRoutes from './routes/searchRoutes';
import fileRoutes from './routes/fileRoutes';
import notificationRoutes from './routes/notificationRoutes';
import integrationRoutes from './routes/integrationRoutes';
import enterpriseRoutes from './routes/enterpriseRoutes';
import complianceRoutes from './routes/complianceRoutes';
import { AppError } from './errors';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/users', userRoutes);
app.use('/memos', memoRoutes);
app.use('/ai', aiRoutes);
app.use('/organizations', organizationRoutes);
app.use('/comments', commentRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/invitations', invitationRoutes);
app.use('/teams', teamRoutes);
app.use('/workflows', workflowRoutes);
app.use('/automations', automationRoutes);
app.use('/reports', reportingRoutes);
app.use('/search', searchRoutes);
app.use('/files', fileRoutes);
app.use('/notifications', notificationRoutes);
app.use('/integrations', integrationRoutes);
app.use('/enterprise', enterpriseRoutes);
app.use('/compliance', complianceRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

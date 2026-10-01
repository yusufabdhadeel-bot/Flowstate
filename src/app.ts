import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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
import authRoutes from './routes/authRoutes';
import { AppError } from './errors';

dotenv.config();

const app = express();

// Behind a reverse proxy/load balancer, req.ip must come from X-Forwarded-For
// for rate limiting to key on the real client address. Trust exactly one hop.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable('x-powered-by');

app.use(helmet());

/**
 * CORS allowlist. Requests with no Origin header (server-to-server, curl,
 * native apps) are allowed; browser requests from unlisted origins are not.
 */
const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsAllowlist.length === 0 || corsAllowlist.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

// Broad backstop for the whole API. /auth/login additionally applies a much
// stricter limiter of its own.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  })
);

app.use(express.json({ limit: '1mb' }));

app.use('/auth', authRoutes);
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

// Lightweight liveness probe for uptime monitors and load balancers.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

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

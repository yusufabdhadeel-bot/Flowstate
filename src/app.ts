import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import memoRoutes from './routes/memoRoutes';
import aiRoutes from './routes/aiRoutes';
import organizationRoutes from './routes/organizationRoutes';
import commentRoutes from './routes/commentRoutes';
import auditRoutes from './routes/auditRoutes';
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

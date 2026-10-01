import app from './app';
import dotenv from 'dotenv';
import { startReminderScheduler } from './cron/reminderCron';
import { validateRuntimeConfig } from './config/env';
import { logger } from './utils/logger';

dotenv.config();
validateRuntimeConfig();

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  logger.info(`Server listening on http://localhost:${port}`);
  startReminderScheduler();
});

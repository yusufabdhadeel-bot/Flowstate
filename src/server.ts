import app from './app';
import dotenv from 'dotenv';
import { startReminderScheduler } from './cron/reminderCron';

dotenv.config();

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  startReminderScheduler();
});

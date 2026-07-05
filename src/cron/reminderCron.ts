import cron from 'node-cron';
import { runPendingMemoReminderJob } from '../services/reminderService';

const CRON_EXPRESSION = process.env.REMINDER_CRON_SCHEDULE ?? '0 0 * * *';
const CRON_TIMEZONE = process.env.CRON_TIMEZONE;

export function startReminderScheduler(): void {
  try {
    const job = cron.schedule(
      CRON_EXPRESSION,
      async () => {
        try {
          await runPendingMemoReminderJob();
        } catch (error) {
          console.error(
            `[CRON] Reminder job failed unexpectedly: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      },
      {
        scheduled: true,
        timezone: CRON_TIMEZONE ?? undefined,
      }
    );

    console.log(`[CRON] Reminder scheduler started with schedule "${CRON_EXPRESSION}"`);
    job.start();
  } catch (error) {
    console.error(
      `[CRON] Failed to initialize reminder scheduler: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

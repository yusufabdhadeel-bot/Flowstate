import { prisma } from '../prismaClient';
import { sendEmail } from './emailService';
import { sendWhatsAppMessage } from './whatsappService';

const ENABLE_REMINDERS = process.env.ENABLE_REMINDERS
  ? process.env.ENABLE_REMINDERS.toLowerCase() === 'true'
  : true;
const REMINDER_HOURS = Math.max(1, Number(process.env.REMINDER_HOURS ?? '24'));
const REMINDER_BATCH_SIZE = Number(process.env.REMINDER_BATCH_SIZE ?? 100);

const reminderScheduleDescription = `every ${REMINDER_HOURS} hour(s)`;

function getReminderMessage(memoTitle: string): string {
  return `You have a pending memo awaiting your action: ${memoTitle}`;
}

function getReminderEmailSubject(): string {
  return 'Pending Memo Reminder';
}

function buildReminderEmailHtml(memoTitle: string): string {
  const message = getReminderMessage(memoTitle);
  return `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>Pending Memo Reminder</h2>
      <p>${escapeHtml(message)}</p>
      <p><strong>Memo:</strong> ${escapeHtml(memoTitle)}</p>
      <p>Thank you,<br/>Flowstate Workflow System</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendPendingMemoReminderEmail(
  approverEmail: string,
  memoTitle: string
): Promise<boolean> {
  const subject = getReminderEmailSubject();
  const html = buildReminderEmailHtml(memoTitle);

  try {
    const sent = await sendEmail(approverEmail, subject, html);
    if (sent) {
      console.log(`[REMINDER] Email reminder queued for ${approverEmail}`);
    } else {
      console.warn(`[REMINDER] Email reminder skipped or failed for ${approverEmail}`);
    }
    return sent;
  } catch (error) {
    console.error(
      `[REMINDER] sendPendingMemoReminderEmail error for ${approverEmail}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

export async function sendPendingMemoReminderWhatsApp(
  approverPhone: string,
  memoTitle: string
): Promise<boolean> {
  if (!approverPhone) {
    console.warn('[REMINDER] WhatsApp reminder skipped: missing approver phone number');
    return false;
  }

  try {
    const message = getReminderMessage(memoTitle);
    const sent = await sendWhatsAppMessage(approverPhone, message);
    if (sent) {
      console.log(`[REMINDER] WhatsApp reminder queued for ${approverPhone}`);
    } else {
      console.warn(`[REMINDER] WhatsApp reminder skipped or failed for ${approverPhone}`);
    }
    return sent;
  } catch (error) {
    console.error(
      `[REMINDER] sendPendingMemoReminderWhatsApp error for ${approverPhone}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

function buildReminderQuery(cutoffDate: Date) {
  return {
    status: 'PENDING' as const,
    currentApproverId: { not: null },
    updatedAt: { lte: cutoffDate },
    OR: [
      { lastReminderSentAt: { equals: null } },
      { lastReminderSentAt: { lte: cutoffDate } },
    ],
  };
}

async function fetchOverdueMemos(cutoffDate: Date) {
  return prisma.memo.findMany({
    where: buildReminderQuery(cutoffDate),
    include: {
      currentApprover: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: REMINDER_BATCH_SIZE,
  });
}

export async function runPendingMemoReminderJob(): Promise<void> {
  if (!ENABLE_REMINDERS) {
    console.log('[REMINDER] Skipping reminder job because ENABLE_REMINDERS is not enabled');
    return;
  }

  const cutoffDate = new Date(Date.now() - REMINDER_HOURS * 60 * 60 * 1000);
  console.log(`[REMINDER] Starting reminder job (${reminderScheduleDescription})`);

  const overdueMemoCount = await prisma.memo.count({ where: buildReminderQuery(cutoffDate) });
  console.log(`[REMINDER] Overdue memos found: ${overdueMemoCount}`);

  let batchNumber = 0;
  let processedCount = 0;

  while (true) {
    const overdueMemos = await fetchOverdueMemos(cutoffDate);
    if (overdueMemos.length === 0) {
      break;
    }

    batchNumber += 1;
    console.log(`[REMINDER] Processing batch ${batchNumber} with ${overdueMemos.length} memos`);

    for (const memo of overdueMemos) {
      try {
        if (!memo.currentApprover) {
          console.warn(`[REMINDER] Skipping memo ${memo.id}: no current approver attached`);
          continue;
        }

        const { email, phone, id, name } = memo.currentApprover;
        const emailSent = email ? await sendPendingMemoReminderEmail(email, memo.title) : false;
        const whatsappSent = phone ? await sendPendingMemoReminderWhatsApp(phone, memo.title) : false;

        if (!emailSent && !whatsappSent) {
          console.warn(
            `[REMINDER] No reminder delivered for memo ${memo.id}: approver ${id} has no valid channel or all channels failed`
          );
          continue;
        }

        const updatedMemo = await prisma.memo.update({
          where: { id: memo.id },
          data: {
            lastReminderSentAt: new Date(),
            reminderCount: { increment: 1 },
          },
          select: {
            reminderCount: true,
          },
        });

        const nextCount = updatedMemo.reminderCount;
        if (nextCount >= 3) {
          console.log(`[REMINDER] Memo eligible for escalation: memoId=${memo.id} reminderCount=${nextCount}`);
        }

        console.log(
          `[REMINDER] Sent reminder for memo ${memo.id} to approver ${name} (${email}) ` +
            `(emailSent=${emailSent} whatsappSent=${whatsappSent})`
        );
      } catch (error) {
        console.error(
          `[REMINDER] Failed to process overdue memo ${memo.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    processedCount += overdueMemos.length;
    if (overdueMemos.length < REMINDER_BATCH_SIZE) {
      break;
    }
  }

  console.log(`[REMINDER] Completed reminder job. Processed ${processedCount} memo(s)`);
}

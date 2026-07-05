CREATE TABLE employee (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    reportsTo INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_employee_reportsTo (reportsTo),
    CONSTRAINT fk_employee_reportsTo
        FOREIGN KEY (reportsTo)
        REFERENCES employee(id)
        ON DELETE SET NULL
);

WITH RECURSIVE org AS (
    SELECT id, name, title, reportsTo, 0 AS level
    FROM employee
    WHERE reportsTo IS NULL
    UNION ALL
    SELECT e.id, e.name, e.title, e.reportsTo, org.level + 1
    FROM employee e
    JOIN org ON e.reportsTo = org.id
)
SELECT * FROM org ORDER BY level, reportsTo, id;

// Runs every 24 hours (configurable via REMINDER_CRON_SCHEDULE)
// Never crashes the app - wrapped in error handling
export function startReminderScheduler(): void

sendPendingMemoReminderEmail(approverEmail, memoTitle): Promise<boolean>
sendPendingMemoReminderWhatsApp(approverPhone, memoTitle): Promise<boolean>
runPendingMemoReminderJob(): Promise<void>  // Main cron handler

model Memo {
  lastReminderSentAt DateTime?  // Prevents duplicate reminders
  reminderCount     Int        @default(0)  // Escalation counter
}

// Query to find pending memos for reminder
// {
//   status: "PENDING",
//   currentApproverId: { not: null },
//   updatedAt: { lte: cutoffDate },  // Older than REMINDER_HOURS
//   OR: [
//     { lastReminderSentAt: { equals: null } },      // Never reminded
//     { lastReminderSentAt: { lte: cutoffDate } }    // Time to remind again
//   ]
// }

[CRON] Reminder scheduler started with schedule "0 0 * * *"
[REMINDER] Starting reminder job (every 24 hour(s))
[REMINDER] Overdue memos found: 5
[REMINDER] Processing batch 1 with 5 memos
[REMINDER] Email reminder queued for john.manager@corp.com
[REMINDER] WhatsApp reminder queued for +14155552671
[REMINDER] Sent reminder for memo 550e8400-e29b-41d4 to approver John (john.manager@corp.com) (emailSent=true whatsappSent=true)
[REMINDER] Memo eligible for escalation: memoId=550e8400-e29b-41d4 reminderCount=3
[REMINDER] Completed reminder job. Processed 5 memo(s)
[REMINDER] Email reminder queued for sarah.director@corp.com
[REMINDER] WhatsApp reminder skipped or failed for +14155552671
[REMINDER] Sent reminder for memo abc12345 to approver Sarah (sarah.director@corp.com) (emailSent=true whatsappSent=false)
[REMINDER] Failed to process overdue memo xyz98765: Connection timeout
[REMINDER] Sent reminder for memo abc12345 to approver John (emailSent=true whatsappSent=true)
[REMINDER] Completed reminder job. Processed 4 memo(s)  # Continues after error
[REMINDER] Skipping reminder job because ENABLE_REMINDERS is not enabled
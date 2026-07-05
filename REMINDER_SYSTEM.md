# Scheduled Reminder & Escalation System

## Overview

The reminder system automatically sends email and WhatsApp notifications to approvers for pending memos older than 24 hours. It runs every 24 hours via node-cron and prevents duplicate reminders using tracking fields.

## Architecture

### Components
- **Cron Job** (`src/cron/reminderCron.ts`): Schedules job execution
- **Reminder Service** (`src/services/reminderService.ts`): Core job logic
- **Email Service** (`src/services/emailService.ts`): Sends email reminders
- **WhatsApp Service** (`src/services/whatsappService.ts`): Sends WhatsApp reminders

### Prisma Schema Fields
```
model Memo {
  lastReminderSentAt DateTime?  // Tracks when last reminder was sent
  reminderCount     Int        @default(0)  // Escalation counter
}
```

## Configuration

Add to `.env`:
```
# Reminder System Configuration
ENABLE_REMINDERS=true              # Enable/disable reminders (default: true)
REMINDER_HOURS=24                  # Threshold in hours (default: 24)
REMINDER_CRON_SCHEDULE=0 0 * * *   # Cron expression (default: daily at midnight)
REMINDER_BATCH_SIZE=100            # Memos per batch (default: 100)
CRON_TIMEZONE=UTC                  # Timezone for cron (optional)

# Email Service
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=noreply@example.com
EMAIL_PASS=your-password
EMAIL_FROM=noreply@example.com

# WhatsApp Service (Twilio)
ENABLE_WHATSAPP_NOTIFICATIONS=true
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=+1234567890
```

## How It Works

### Query Logic
Finds all memos where:
- `status = PENDING`
- `currentApproverId IS NOT NULL`
- `updatedAt` is older than `REMINDER_HOURS`
- **AND** (`lastReminderSentAt IS NULL` OR `lastReminderSentAt` is older than `REMINDER_HOURS`)

### Notification Channels
For each overdue memo:
1. **Email**: Sent if approver has `email` field
2. **WhatsApp**: Sent if approver has `phone` field

### Reminder Message
```
You have a pending memo awaiting your action: [memoTitle]
```

### Escalation Logic
- After sending reminder: increment `reminderCount`
- If `reminderCount >= 3`: log "Memo eligible for escalation"
- Future implementation can trigger reassignment, notification to higher management, etc.

### Duplicate Prevention
- Update `lastReminderSentAt = now` after sending
- Update `reminderCount += 1`
- Next reminder won't send until `REMINDER_HOURS` has passed

## Example Logs

### Successful Run
```
[CRON] Reminder scheduler started with schedule "0 0 * * *"
[REMINDER] Starting reminder job (every 24 hour(s))
[REMINDER] Overdue memos found: 3
[REMINDER] Processing batch 1 with 3 memos
[REMINDER] Email reminder queued for manager@example.com
[REMINDER] WhatsApp reminder queued for +1234567890
[REMINDER] Sent reminder for memo 550e8400-e29b-41d4-a716-446655440000 to approver John (manager@example.com) (emailSent=true whatsappSent=true)
[REMINDER] Memo eligible for escalation: memoId=550e8400-e29b-41d4-a716-446655440000 reminderCount=3
[REMINDER] Completed reminder job. Processed 3 memo(s)
```

### With Disabled Reminders
```
[REMINDER] Skipping reminder job because ENABLE_REMINDERS is not enabled
```

### With Missing Channels
```
[REMINDER] Approver 123abc has no email, skipping email reminder for memo 550e8400-e29b-41d4-a716-446655440000
[REMINDER] WhatsApp reminder queued for +1234567890
```

### Error Handling
```
[REMINDER] Failed to process overdue memo 550e8400-e29b-41d4-a716-446655440000: Connection timeout
[REMINDER] Completed reminder job. Processed 2 memo(s)  # Continues after error
```

## API Functions

### sendPendingMemoReminderEmail(email: string, memoTitle: string): Promise<boolean>
Sends email reminder. Returns `true` if successful.

```typescript
const sent = await sendPendingMemoReminderEmail('manager@example.com', 'Q1 Budget Review');
```

### sendPendingMemoReminderWhatsApp(phone: string, memoTitle: string): Promise<boolean>
Sends WhatsApp reminder. Returns `true` if successful.

```typescript
const sent = await sendPendingMemoReminderWhatsApp('+1234567890', 'Q1 Budget Review');
```

### runPendingMemoReminderJob(): Promise<void>
Main cron job handler. Processes all overdue memos in batches.

```typescript
await runPendingMemoReminderJob();
```

## Testing

### Manual Trigger
```typescript
import { runPendingMemoReminderJob } from './services/reminderService';

// In any route or script:
await runPendingMemoReminderJob();
```

### Disable for Development
```bash
ENABLE_REMINDERS=false npm run dev
```

### Adjust Frequency
```bash
# Send reminders every 2 hours
REMINDER_HOURS=2 npm run dev

# Run every hour
REMINDER_CRON_SCHEDULE="0 * * * *" npm run dev
```

## Performance Notes

- Uses batch processing (default 100 memos per batch)
- Each memo wrapped in `try/catch` to prevent cascade failures
- Efficient Prisma query with indexed columns
- Rate-limited WhatsApp sends (10s per recipient)
- No blocking operations; runs asynchronously

## Future Enhancements

- Send escalation emails to director/HR after 3 reminders
- Auto-reassign memo to next level reviewer
- SMS fallback for WhatsApp failures
- Metrics/analytics on reminder delivery rates
- Customizable reminder templates per organization

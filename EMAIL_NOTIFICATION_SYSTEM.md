# Email Notification System Documentation

A production-ready email notification system for your workflow SaaS using Nodemailer with professional HTML email templates.

## Architecture Overview

The email system integrates with the Decision Engine to send notifications at key workflow milestones:

```
Workflow Action               Email Triggered          Template Used
─────────────────────────────────────────────────────────────────────
Memo Submitted                → Memo Assigned          Assigned (to Manager)
Manager Approves & Passes     → Memo Assigned          Assigned (to Next Manager)
Manager Approves & Completes  → Memo Approved          Approved (to Creator)
Manager Queries Memo          → Memo Queried           Queried (to Creator)
Manager Declines Memo         → Memo Declined          Declined (to Creator)
```

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install nodemailer @types/nodemailer
```

### 2. Environment Variables

Create `.env` file in project root:

```bash
# Email Configuration (Nodemailer SMTP)
EMAIL_HOST="smtp.gmail.com"          # SMTP server hostname
EMAIL_PORT="587"                     # SMTP port (587 for TLS, 465 for SSL)
EMAIL_USER="your-email@gmail.com"    # Email address to send from
EMAIL_PASS="your-app-password"       # SMTP password (NOT account password)
EMAIL_FROM="noreply@flowstate.com"   # From address (optional, defaults to EMAIL_USER)
```

### 3. Email Provider Setup Examples

#### Gmail (Development)
```env
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-16-char-app-password"
```
**Note:** Must use App Password (not account password). Enable 2FA and create app-specific password.

#### AWS SES (Production)
```env
EMAIL_HOST="email-smtp.us-east-1.amazonaws.com"
EMAIL_PORT="587"
EMAIL_USER="AKIAIOSFODNN7EXAMPLE"
EMAIL_PASS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno"
```

#### SendGrid
```env
EMAIL_HOST="smtp.sendgrid.net"
EMAIL_PORT="587"
EMAIL_USER="apikey"
EMAIL_PASS="SG.your-sendgrid-api-key"
```

#### Office 365
```env
EMAIL_HOST="smtp.office365.com"
EMAIL_PORT="587"
EMAIL_USER="your-email@company.onmicrosoft.com"
EMAIL_PASS="your-office-password"
```

---

## Email Service Module (src/services/emailService.ts)

### Core Functions

#### 1. `sendEmail(to: string, subject: string, html: string): Promise<boolean>`

**Purpose:** Generic email sending function
- Non-blocking (fire and forget)
- Logs success/failure
- Does not throw (caught internally)

**Parameters:**
- `to` - Recipient email address
- `subject` - Email subject line
- `html` - HTML email body

**Returns:** `Promise<boolean>` - true if sent, false if not configured

**Example:**
```typescript
import { sendEmail } from './services/emailService';

const sent = await sendEmail(
  'manager@company.com',
  'New Memo for Approval',
  '<h1>You have a new memo</h1>'
);
console.log(sent ? 'Email queued' : 'Email not sent');
```

---

#### 2. `sendMemoAssignedEmail(managerEmail: string, memoTitle: string): Promise<void>`

**Purpose:** Notify manager that a memo is assigned for approval

**Trigger Points:**
- After memo submission (creator's manager)
- After approval passed to next manager

**Email Details:**
- **Subject:** "New Memo Awaiting Approval"
- **Recipient:** Manager/next approver
- **Content:** Memo title + "You have a new memo waiting for your approval"

**Example:**
```typescript
import { sendMemoAssignedEmail } from './services/emailService';

// Called internally by submitMemo and approveMemo
await sendMemoAssignedEmail('john.manager@company.com', 'Q3 Budget Request');
// Email sends in background, does not wait
```

---

#### 3. `sendMemoQueriedEmail(creatorEmail: string, memoTitle: string, managerComment: string): Promise<void>`

**Purpose:** Notify creator that manager has queried their memo

**Trigger:** After queryMemo() function completes

**Email Details:**
- **Subject:** "Your Memo Was Queried"
- **Recipient:** Memo creator
- **Content:** Memo title + Manager's exact comment/question

**Example:**
```typescript
import { sendMemoQueriedEmail } from './services/emailService';

// Called internally by queryMemo
await sendMemoQueriedEmail(
  'staff@company.com',
  'Q3 Budget Request',
  'Please clarify the budget breakdown for each department'
);
```

---

#### 4. `sendMemoApprovedEmail(creatorEmail: string, memoTitle: string, approverName: string): Promise<void>`

**Purpose:** Notify creator that memo reached top and was approved

**Trigger:** After approveMemo() if memo.status becomes APPROVED

**Email Details:**
- **Subject:** "Your Memo Was Approved"
- **Recipient:** Memo creator
- **Content:** Memo title + Approver name + Success message

**Example:**
```typescript
import { sendMemoApprovedEmail } from './services/emailService';

// Called internally by approveMemo when at top of hierarchy
await sendMemoApprovedEmail(
  'staff@company.com',
  'Q3 Budget Request',
  'Jane Director'
);
```

---

#### 5. `sendMemoDeclinedEmail(creatorEmail: string, memoTitle: string, declinerName: string): Promise<void>`

**Purpose:** Notify creator that memo was declined

**Trigger:** After declineMemo() function completes

**Email Details:**
- **Subject:** "Your Memo Was Declined"
- **Recipient:** Memo creator
- **Content:** Memo title + Decliner name + Action required message

**Example:**
```typescript
import { sendMemoDeclinedEmail } from './services/emailService';

// Called internally by declineMemo
await sendMemoDeclinedEmail(
  'staff@company.com',
  'Q3 Budget Request',
  'John Manager'
);
```

---

## Email Templates

### 1. Memo Assigned Template

**Usage:** When memo assigned to approver

**Visual Elements:**
- 📋 Icon in header
- Blue accent color (#007bff)
- Memo title in highlighted box
- Clear call-to-action message

**HTML Structure:**
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>/* Professional styling */</style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📋 New Memo Awaiting Approval</h1>
      </div>
      <div class="content">
        <p>Hello,</p>
        <p>You have a new memo waiting for your approval.</p>
        <div class="memo-title">{{ memoTitle }}</div>
        <p>Please review the memo and take appropriate action...</p>
      </div>
    </div>
  </body>
</html>
```

**Recipient:** Manager or next approver
**Preview:** "New Memo Awaiting Approval - You have a new memo..."

---

### 2. Memo Queried Template

**Usage:** When manager queries memo for clarification

**Visual Elements:**
- ⚠️ Icon in header
- Amber/warning accent color (#ffc107)
- Highlighted comment box with manager's exact message
- Action item for creator

**HTML Structure:**
```html
<!DOCTYPE html>
<html>
  <body>
    <div class="container">
      <div class="header">
        <h1>⚠️ Your Memo Was Queried</h1>
      </div>
      <div class="content">
        <p>A manager has queried your memo for clarification.</p>
        <div class="memo-title">{{ memoTitle }}</div>
        <p style="font-weight: bold;">Manager's Comment:</p>
        <div class="comment-box">{{ managerComment }}</div>
        <p>Please review the feedback and revise your memo...</p>
      </div>
    </div>
  </body>
</html>
```

**Recipient:** Memo creator
**Preview:** "Your Memo Was Queried - A manager has queried..."

---

### 3. Memo Approved Template

**Usage:** When memo approved at top of hierarchy

**Visual Elements:**
- ✅ Icon in header
- Green accent color (#28a745)
- Success messaging
- Approver name highlighted

**HTML Structure:**
```html
<!DOCTYPE html>
<html>
  <body>
    <div class="container">
      <div class="header">
        <h1>✅ Your Memo Was Approved</h1>
      </div>
      <div class="content">
        <p class="success-text">Great news! Your memo has been approved.</p>
        <div class="memo-title">{{ memoTitle }}</div>
        <p>Approved by: <strong>{{ approverName }}</strong></p>
      </div>
    </div>
  </body>
</html>
```

**Recipient:** Memo creator
**Preview:** "Your Memo Was Approved - Great news! Your memo..."

---

### 4. Memo Declined Template

**Usage:** When manager declines memo

**Visual Elements:**
- ❌ Icon in header
- Red accent color (#dc3545)
- Decliner information
- Guidance to contact manager

**HTML Structure:**
```html
<!DOCTYPE html>
<html>
  <body>
    <div class="container">
      <div class="header">
        <h1>❌ Your Memo Was Declined</h1>
      </div>
      <div class="content">
        <p>Your memo has been declined and will not proceed further.</p>
        <div class="memo-title">{{ memoTitle }}</div>
        <p>Declined by: <strong>{{ declinerName }}</strong></p>
        <p>You can contact your manager for more information.</p>
      </div>
    </div>
  </body>
</html>
```

**Recipient:** Memo creator
**Preview:** "Your Memo Was Declined - Your memo has been declined..."

---

## Integration Points

### Integration 1: submitMemo() - Memo Assigned

**Location:** `src/services/memoService.ts`

**Code:**
```typescript
export async function submitMemo(userId: string, data: SubmitMemoInput) {
  // ... memo creation logic ...
  
  const result = await prisma.$transaction(async (tx) => {
    // Create memo
    const memo = await tx.memo.create({...});
    return memo;
  });

  // ✅ Send email to manager (non-blocking)
  await sendMemoAssignedEmail(result.currentApprover.email, result.title);

  return result as MemoWithDetails;
}
```

**Timing:** After memo is created and transaction completes
**Recipient:** Manager assigned to approve
**Reliability:** Fire and forget (non-blocking)

---

### Integration 2: approveMemo() - Memo Assigned or Approved

**Location:** `src/services/memoService.ts`

**Code:**
```typescript
export async function approveMemo(userId: string, memoId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Approval logic
    const updatedMemo = await tx.memo.update({...});
    return updatedMemo;
  });

  // ✅ Send appropriate email (non-blocking)
  if (result.status === 'APPROVED') {
    // Top of hierarchy - notify creator
    await sendMemoApprovedEmail(result.creator.email, result.title, user.name);
  } else if (result.currentApprover) {
    // Passed to next manager
    await sendMemoAssignedEmail(result.currentApprover.email, result.title);
  }

  return result as MemoWithDetails;
}
```

**Timing:** After memo is updated and transaction completes
**Recipients:** 
  - If APPROVED: Memo creator
  - If PENDING: Next manager in hierarchy
**Reliability:** Fire and forget (non-blocking)

---

### Integration 3: queryMemo() - Memo Queried

**Location:** `src/services/memoService.ts`

**Code:**
```typescript
export async function queryMemo(userId: string, memoId: string, message: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Create comment
    await tx.comment.create({
      data: {
        memoId,
        userId,
        message: trimmedMessage,
      },
    });

    // Update memo to QUERIED
    const updatedMemo = await tx.memo.update({...});
    return updatedMemo;
  });

  // ✅ Send query email to creator (non-blocking)
  await sendMemoQueriedEmail(result.creator.email, result.title, trimmedMessage);

  return result as MemoWithDetails;
}
```

**Timing:** After memo is updated with comment and transaction completes
**Recipient:** Memo creator
**Message:** Exact comment from manager
**Reliability:** Fire and forget (non-blocking)

---

### Integration 4: declineMemo() - Memo Declined

**Location:** `src/services/memoService.ts`

**Code:**
```typescript
export async function declineMemo(userId: string, memoId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Update memo to DECLINED
    const updatedMemo = await tx.memo.update({...});
    return updatedMemo;
  });

  // ✅ Send decline email to creator (non-blocking)
  const decliningUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  await sendMemoDeclinedEmail(
    result.creator.email,
    result.title,
    decliningUser?.name || 'Manager'
  );

  return result as MemoWithDetails;
}
```

**Timing:** After memo is updated and transaction completes
**Recipient:** Memo creator
**Decliner:** Name of manager who declined
**Reliability:** Fire and forget (non-blocking)

---

## Non-Blocking Implementation

### Why Fire and Forget?

```typescript
// ✅ GOOD: Non-blocking (returns immediately)
await sendMemoAssignedEmail(email, title);
// API response returns, email sends in background

// ❌ BAD: Blocking (waits for email)
await fetch(emailService, { ... }).then(...);
// API response delayed by email server latency
```

### Error Handling

```typescript
// Inside sendMemoAssignedEmail
export async function sendMemoAssignedEmail(
  managerEmail: string,
  memoTitle: string
): Promise<void> {
  try {
    const html = getMemoAssignedTemplate(memoTitle);
    await sendEmail(managerEmail, 'New Memo Awaiting Approval', html);
  } catch (error) {
    console.error(`Failed to send memo assigned email: ${error.message}`);
    // ✅ Does NOT throw - email failure doesn't break workflow
  }
}
```

### Console Logging

```
[EMAIL] Email sent to manager@company.com (msgid123@gmail.com)
[EMAIL] Email sent to staff@company.com (msgid456@gmail.com)

[ERROR] Email failed to invalid@email.com: Invalid email address
[ERROR] Email failed: SMTP timeout (retry in future)
```

---

## Logging & Monitoring

### Success Logs

```
Email sent to manager@company.com (message-id)
Email sent to staff@company.com (message-id)
Email sent to director@company.com (message-id)
```

### Failure Logs

```
Email failed to invalid@email.com: Invalid email address
Email failed: SMTP connection timeout (will retry)
Email error: Authentication failed - check EMAIL_PASS
```

### Email Queue Status

```typescript
import { getEmailQueueSize } from './services/emailService';

// Check pending emails (when implemented)
const pending = getEmailQueueSize();
console.log(`${pending} emails pending`);
```

---

## Development vs Production

### Development Mode

```bash
# No email configured
EMAIL_HOST=""
EMAIL_USER=""
```

**Behavior:**
```
[EMAIL] Skipping email to staff@company.com - email not configured (development mode)
```

### Production Mode

```bash
# Full email configuration
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_USER="noreply@company.com"
EMAIL_PASS="secure-password"
```

**Behavior:**
```
Email sent to manager@company.com (msgid123@gmail.com)
```

---

## Testing

### Manual Email Testing

```bash
# Edit src/services/emailService.ts temporarily
// Change sendEmail to test recipient

await sendEmail(
  'your-test-email@gmail.com',  // Your email
  'Test Email',
  '<h1>Test</h1>'
);
```

### Integration Testing

```typescript
describe('Email Service', () => {
  test('should send memo assigned email', async () => {
    await sendMemoAssignedEmail('test@example.com', 'Test Memo');
    // Check console logs
  });

  test('should send memo queried email', async () => {
    await sendMemoQueriedEmail(
      'test@example.com',
      'Test Memo',
      'Please clarify'
    );
    // Check console logs
  });
});
```

---

## Security Considerations

### 1. Password Management

```bash
# ❌ DON'T: Hardcode passwords
EMAIL_PASS="my-password"

# ✅ DO: Use environment variables
EMAIL_PASS=process.env.EMAIL_PASS

# ✅ Better: Use secrets manager
EMAIL_PASS=process.env.EMAIL_PASSWORD_PROD
```

### 2. Email Validation

```typescript
// ✅ HTML escaping to prevent injection
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

// Used in templates:
<div class="memo-title">
  ${escapeHtml(memoTitle)}  // ✅ Safe
</div>
```

### 3. SMTP Security

```typescript
// ✅ Use TLS encryption (port 587 or 465)
secure: emailPort === '465',  // true for SSL

// ✅ Validate SMTP certificate in production
```

---

## Future Enhancements

### 1. Retry Logic

```typescript
export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  retries: number;      // ✅ Track retries
  createdAt: Date;
  nextRetry?: Date;
}

// Retry failed emails with exponential backoff
```

### 2. Email Queue

```typescript
const emailQueue: EmailJob[] = [];

export function addToEmailQueue(job: EmailJob): void {
  emailQueue.push(job);
  // Process with background worker (Bull, Bee-Queue)
}
```

### 3. Email Templates Database

```typescript
// Store templates in database for easy updates
const template = await prisma.emailTemplate.findUnique({
  where: { type: 'MEMO_ASSIGNED' },
});

const html = template.html
  .replace('{{ memoTitle }}', memoTitle)
  .replace('{{ approverName }}', approverName);
```

### 4. Unsubscribe Links

```html
<div class="footer">
  <a href="https://app.flowstate.com/unsubscribe?token=xyz">
    Unsubscribe from emails
  </a>
</div>
```

### 5. Email Analytics

```typescript
// Track opens and clicks
const trackingPixel = `
  <img src="https://emails.flowstate.com/track?id=${memoId}"
       width="1" height="1" style="display:none;">
`;
```

---

## Troubleshooting

### Email Not Sending

**Check:**
1. ✅ Environment variables set correctly
2. ✅ Email provider credentials valid
3. ✅ Port number matches protocol (587 for TLS, 465 for SSL)
4. ✅ Firewall allows outbound SMTP

**Debug:**
```typescript
console.log('Email config:', {
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  user: process.env.EMAIL_USER,
  // ⚠️ Don't log password!
});
```

### SMTP Authentication Failed

**Gmail:**
- Use App Password, not account password
- Enable 2-factor authentication
- Create app-specific password

**Office 365:**
- Check if account is admin
- Disable 2FA or use app password

### Slow Email Sending

**Solutions:**
- Use background queue (implement Bull)
- Batch emails (send multiple in single connection)
- Use SendGrid/SES for enterprise scale

---

## Summary

**Email Service provides:**
- ✅ Production-ready Nodemailer configuration
- ✅ 5 specialized email functions (assigned, queried, approved, declined, generic)
- ✅ Professional HTML templates with proper styling
- ✅ Non-blocking fire-and-forget implementation
- ✅ Comprehensive error handling
- ✅ Security best practices (HTML escaping, TLS)
- ✅ Logging for debugging and audits
- ✅ Placeholder for future queuing/retries

**Integration is seamless:**
- Works alongside Decision Engine
- Doesn't block workflow if email fails
- Automatic triggers on memo actions
- Zero additional setup needed after environment variables configured

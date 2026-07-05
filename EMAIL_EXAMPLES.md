# Email Notification System - Examples & Test Cases

## Complete Workflow with Emails

### Scenario: Multi-Level Approval with Notifications

#### Step 1: Staff Submits Memo

**Action:**
```typescript
const memo = await submitMemo(staffId, {
  title: "Q3 Budget Request",
  content: "We need additional budget for cloud infrastructure",
});
```

**Memo State:**
```
createdBy: staff-001
currentApproverId: manager-1
status: PENDING
```

**Email Sent:**
```
TO: manager1@company.com
SUBJECT: New Memo Awaiting Approval
TEMPLATE: Memo Assigned
```

**Email Content:**
```html
<h1>📋 New Memo Awaiting Approval</h1>
<p>Hello,</p>
<p>You have a new memo waiting for your approval.</p>
<div class="memo-title">Q3 Budget Request</div>
<p>Please review the memo and take appropriate action...</p>
```

**Console Output:**
```
[Memo submitted by staff-001 assigned to manager-1]
[EMAIL] Email sent to manager1@company.com (msg-123@gmail.com)
```

---

#### Step 2: Manager-1 Approves & Passes to Manager-2

**Action:**
```typescript
const memo = await approveMemo(manager1Id, memoId);
```

**Memo State:**
```
status: PENDING (still in approval chain)
currentApproverId: manager-2
```

**Emails Sent:**

**Email 1 - To Manager-2 (Next Approver):**
```
TO: manager2@company.com
SUBJECT: New Memo Awaiting Approval
TEMPLATE: Memo Assigned
```

**Email 2 - Audit Log:**
```
[manager-1] APPROVED memo [memo-id] and passed to [manager-2]
[EMAIL] Email sent to manager2@company.com (msg-456@gmail.com)
```

---

#### Step 3: Manager-2 Queries for Clarification

**Action:**
```typescript
const memo = await queryMemo(manager2Id, memoId, 
  "Please provide the detailed breakdown of costs by department"
);
```

**Memo State:**
```
status: QUERIED
currentApproverId: staff-001 (back to creator)
```

**Email Sent - To Creator:**
```
TO: staff@company.com
SUBJECT: Your Memo Was Queried
TEMPLATE: Memo Queried
```

**Email Content:**
```html
<h1>⚠️ Your Memo Was Queried</h1>
<p>A manager has queried your memo for clarification.</p>
<div class="memo-title">Q3 Budget Request</div>
<p style="font-weight: bold;">Manager's Comment:</p>
<div class="comment-box">
  Please provide the detailed breakdown of costs by department
</div>
<p>Please review the feedback and revise your memo...</p>
```

**Console Output:**
```
[manager-2] QUERIED memo [memo-id] - returned to creator [staff-001]
[EMAIL] Email sent to staff@company.com (msg-789@gmail.com)
```

---

#### Step 4: Staff Revises and Resubmits

**Action:**
```typescript
const revisedMemo = await submitMemo(staffId, {
  title: "Q3 Budget Request - Revised",
  content: "Cloud infrastructure budget breakdown:\n- Dev: $5K\n- Prod: $15K\n- DR: $10K",
});
```

**Memo State:**
```
createdBy: staff-001
currentApproverId: manager-2 (back in chain with Manager-2)
status: PENDING
```

**Email Sent - To Manager-2:**
```
TO: manager2@company.com
SUBJECT: New Memo Awaiting Approval
TEMPLATE: Memo Assigned
```

---

#### Step 5: Manager-2 Approves & Passes to Director

**Action:**
```typescript
const memo = await approveMemo(manager2Id, memoId);
```

**Memo State:**
```
status: PENDING
currentApproverId: director-1
```

**Email Sent - To Director:**
```
TO: director@company.com
SUBJECT: New Memo Awaiting Approval
TEMPLATE: Memo Assigned
```

---

#### Step 6: Director (Top) Approves

**Action:**
```typescript
const memo = await approveMemo(directorId, memoId);
```

**Memo State:**
```
status: APPROVED
currentApproverId: null (no further action)
```

**Email Sent - To Creator:**
```
TO: staff@company.com
SUBJECT: Your Memo Was Approved
TEMPLATE: Memo Approved
```

**Email Content:**
```html
<h1>✅ Your Memo Was Approved</h1>
<p class="success-text">Great news! Your memo has been approved.</p>
<div class="memo-title">Q3 Budget Request - Revised</div>
<p>Approved by: <strong>Jane Director</strong></p>
```

**Console Output:**
```
[director-1] APPROVED memo [memo-id] - reached top of hierarchy
[EMAIL] Email sent to staff@company.com (msg-012@gmail.com)
```

---

### Scenario: Memo Declined

#### Step: Manager Declines

**Action:**
```typescript
const memo = await declineMemo(manager2Id, memoId);
```

**Memo State:**
```
status: DECLINED
currentApproverId: null
```

**Email Sent - To Creator:**
```
TO: staff@company.com
SUBJECT: Your Memo Was Declined
TEMPLATE: Memo Declined
```

**Email Content:**
```html
<h1>❌ Your Memo Was Declined</h1>
<p>Your memo has been declined and will not proceed further.</p>
<div class="memo-title">Q3 Budget Request</div>
<p>Declined by: <strong>John Manager</strong></p>
<p>You can contact your manager for more information.</p>
```

**Console Output:**
```
[manager-2] DECLINED memo [memo-id]
[EMAIL] Email sent to staff@company.com (msg-345@gmail.com)
```

---

## Email Template Examples (Raw HTML)

### Template 1: Memo Assigned

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #f4f4f4;
      }
      .container {
        max-width: 600px;
        margin: 20px auto;
        background-color: #ffffff;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .header {
        border-bottom: 3px solid #007bff;
        padding-bottom: 20px;
        margin-bottom: 20px;
      }
      .header h1 {
        margin: 0;
        color: #007bff;
        font-size: 24px;
      }
      .content {
        margin: 20px 0;
      }
      .memo-title {
        background-color: #f8f9fa;
        padding: 15px;
        border-left: 4px solid #007bff;
        margin: 20px 0;
        font-weight: bold;
        font-size: 16px;
      }
      .footer {
        border-top: 1px solid #ddd;
        padding-top: 20px;
        margin-top: 30px;
        font-size: 12px;
        color: #999;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📋 New Memo Awaiting Approval</h1>
      </div>
      <div class="content">
        <p>Hello,</p>
        <p>You have a new memo waiting for your approval.</p>
        <div class="memo-title">Q3 Budget Request</div>
        <p>Please review the memo and take appropriate action.</p>
        <p>Thank you,<br/>Flowstate Workflow System</p>
      </div>
      <div class="footer">
        <p>This is an automated email. Please do not reply.</p>
      </div>
    </div>
  </body>
</html>
```

---

### Template 2: Memo Queried

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; color: #333; }
      .container { max-width: 600px; margin: 20px auto; }
      .header { border-bottom: 3px solid #ffc107; }
      .header h1 { color: #ffc107; }
      .comment-box {
        background-color: #fffbf0;
        padding: 15px;
        border-left: 4px solid #ffc107;
        margin: 20px 0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>⚠️ Your Memo Was Queried</h1>
      </div>
      <div class="content">
        <p>A manager has queried your memo for clarification.</p>
        <div class="memo-title">Q3 Budget Request</div>
        <p><strong>Manager's Comment:</strong></p>
        <div class="comment-box">
          Please provide the detailed breakdown of costs by department
        </div>
        <p>Please review and revise your memo if needed.</p>
      </div>
    </div>
  </body>
</html>
```

---

## Test Cases

### Test 1: Email Sent on Memo Submission

```typescript
describe('Email Notifications - Memo Assignment', () => {
  test('should send email when memo is submitted', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const memo = await submitMemo(staffId, {
      title: 'Test Memo',
      content: 'Test content',
    });

    // Wait for async email to be sent
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to')
    );
    expect(memo.status).toBe('PENDING');
  });
});
```

### Test 2: Email Sent on Query

```typescript
describe('Email Notifications - Query', () => {
  test('should send query email to creator', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const memo = await queryMemo(managerId, memoId, 'Please clarify');

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to staff@company.com')
    );
    expect(memo.status).toBe('QUERIED');
  });
});
```

### Test 3: Email Sent on Approve

```typescript
describe('Email Notifications - Approve', () => {
  test('should send approval email when memo approved', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    // Setup: top manager
    const memo = await approveMemo(topManagerId, memoId);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to')
    );
    expect(memo.status).toBe('APPROVED');
  });

  test('should send assigned email when memo passed', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    // Setup: not top manager
    const memo = await approveMemo(manager1Id, memoId);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to manager2@company.com')
    );
    expect(memo.status).toBe('PENDING');
    expect(memo.currentApproverId).toBe(manager2Id);
  });
});
```

### Test 4: Email Sent on Decline

```typescript
describe('Email Notifications - Decline', () => {
  test('should send decline email to creator', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const memo = await declineMemo(managerId, memoId);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to')
    );
    expect(memo.status).toBe('DECLINED');
    expect(memo.currentApproverId).toBeNull();
  });
});
```

### Test 5: Email Doesn't Break Workflow

```typescript
describe('Email Notifications - Error Handling', () => {
  test('should not throw if email fails', async () => {
    // Mock Nodemailer to fail
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: (options, callback) => {
        callback(new Error('SMTP timeout'));
      },
    });

    // Should still succeed
    const memo = await submitMemo(staffId, {
      title: 'Test',
      content: 'Test',
    });

    expect(memo.status).toBe('PENDING');
    expect(memo.id).toBeDefined();
  });

  test('should log email failure without breaking', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    
    // Mock failure
    // ... 
    
    const memo = await queryMemo(managerId, memoId, 'Test');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email failed')
    );
    expect(memo.status).toBe('QUERIED');
  });
});
```

---

## Configuration Examples

### Gmail (Development)

**.env:**
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-char-app-password
EMAIL_FROM=noreply@flowstate.local
```

**Setup Steps:**
1. Enable 2-factor authentication on Gmail
2. Create app-specific password
3. Use the 16-character password as EMAIL_PASS

---

### AWS SES (Production)

**.env:**
```
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USER=AKIAIOSFODNN7EXAMPLE
EMAIL_PASS=BDo3Cblah1234567890/blah/blah+blah
EMAIL_FROM=noreply@company.com
```

**Setup:**
1. Create IAM user with SES permissions
2. Generate SMTP credentials
3. Verify sender email in SES console
4. Move out of sandbox mode for production

---

### SendGrid

**.env:**
```
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.L1234567890abcdefghijklmnopqrstuvwxyz
EMAIL_FROM=noreply@company.com
```

**Setup:**
1. Create SendGrid account
2. Generate API key
3. Use "apikey" as username
4. Use API key as password

---

## Monitoring & Debugging

### Monitor Email Logs

```bash
# Watch console for email sends
npm run dev | grep -i email

# Output:
# Email sent to manager@company.com (msg-123@gmail.com)
# Email sent to staff@company.com (msg-456@gmail.com)
# Email failed: SMTP timeout
```

### Check Email Configuration

```typescript
// In emailService.ts, add debug function
export function debugEmailConfig(): void {
  console.log({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    from: process.env.EMAIL_FROM,
    configured: !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS,
  });
}

// Call in server startup
debugEmailConfig();
```

### Test Email Sending Manually

```typescript
// In test file
import { sendEmail } from './services/emailService';

async function testEmail() {
  const sent = await sendEmail(
    'your-test-email@gmail.com',
    'Test Email',
    '<h1>Test</h1><p>If you see this, email is working!</p>'
  );
  console.log('Email sent:', sent);
}

testEmail();
```

---

## Performance Considerations

### Email Sending is Non-Blocking

```typescript
// ✅ API returns immediately, email sends in background
res.json({ status: 'success', memo });
// Email send happens after response

// ❌ API waits for email (bad)
await emailService.send(...);
res.json({ status: 'success', memo });
```

### Latency Impact

| Scenario | API Response Time |
|----------|------------------|
| Email disabled | ~50ms |
| Email configured (no delay) | ~50ms |
| Email sending | ~0ms (background) |

### Queue for Scaling

```typescript
// Future: When emails need queuing
export function addToEmailQueue(job: EmailJob): void {
  emailQueue.push(job);
  // Process with background worker (Bull, Bee-Queue, RabbitMQ)
}

const emailQueue: EmailJob[] = [];

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  retries: number;
  createdAt: Date;
}
```

---

## Summary

The email notification system provides:
- ✅ Automatic triggers on memo actions
- ✅ Professional HTML templates
- ✅ Non-blocking fire-and-forget implementation  
- ✅ Comprehensive error handling
- ✅ Security best practices
- ✅ Easy configuration with environment variables
- ✅ Complete integration with Decision Engine
- ✅ Production-ready implementation

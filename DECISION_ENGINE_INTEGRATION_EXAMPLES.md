# Decision Engine - Integration & Usage Guide

## Quick Start Integration

### 1. Basic Route Usage

```typescript
// In your main app.ts or server.ts
import express from 'express';
import memoRoutes from './routes/memoRoutes';

const app = express();

app.use(express.json());
app.use('/memos', memoRoutes);

// Error handling middleware (important!)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message,
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## Using Decision Engine in Services

### Example 1: Automated Approval System

```typescript
// services/autoApprovalService.ts
import { approveMemo } from './memoService';
import { prisma } from '../prismaClient';

export async function autoApproveLowValueMemos(managerId: string) {
  // Get all pending memos for this manager
  const memos = await prisma.memo.findMany({
    where: {
      currentApproverId: managerId,
      status: 'PENDING',
    },
    include: {
      creator: true,
    },
  });

  // Auto-approve memos under certain value threshold
  const results = [];
  for (const memo of memos) {
    try {
      // Check if memo meets auto-approval criteria
      if (shouldAutoApprove(memo)) {
        const approved = await approveMemo(managerId, memo.id);
        results.push({ memoId: memo.id, status: 'approved' });
      }
    } catch (error) {
      results.push({ memoId: memo.id, status: 'error', error: error.message });
    }
  }

  return results;
}

function shouldAutoApprove(memo: any): boolean {
  // Define your auto-approval rules
  // Example: auto-approve if value < $1000
  const value = extractMemoValue(memo.content);
  return value < 1000;
}

function extractMemoValue(content: string): number {
  // Parse memo content to extract value
  // This is application-specific
  return 500; // placeholder
}
```

**Usage:**
```typescript
const results = await autoApproveLowValueMemos('manager-123');
console.log('Auto-approved:', results);
```

---

### Example 2: Escalation System

```typescript
// services/escalationService.ts
import { declineMemo, queryMemo } from './memoService';
import { prisma } from '../prismaClient';

export async function escalateOverdueMemos(daysThreshold: number = 5) {
  // Find memos pending for too long
  const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);
  
  const overdueMemos = await prisma.memo.findMany({
    where: {
      status: 'PENDING',
      createdAt: {
        lt: cutoffDate,
      },
    },
    include: {
      currentApprover: { include: { manager: true } },
      creator: true,
    },
  });

  const escalations = [];
  for (const memo of overdueMemos) {
    try {
      // Query the memo asking for decision
      await queryMemo(
        memo.currentApproverId,
        memo.id,
        `This memo is overdue (${daysThreshold}+ days pending). Please approve, query, or decline.`
      );
      
      // Notify escalation team
      await notifyEscalationTeam(memo);
      
      escalations.push({
        memoId: memo.id,
        daysPending: Math.floor((Date.now() - memo.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      });
    } catch (error) {
      console.error(`Failed to escalate memo ${memo.id}:`, error);
    }
  }

  return escalations;
}

async function notifyEscalationTeam(memo: any) {
  // Send email, webhook, or notification
  console.log(`ESCALATION: Memo ${memo.id} from ${memo.creator.name} overdue`);
}
```

**Usage:**
```typescript
// Run daily via cron job
const escalated = await escalateOverdueMemos(5);
console.log(`Escalated ${escalated.length} memos`);
```

---

### Example 3: Bulk Operations

```typescript
// services/bulkApprovalService.ts
import { approveMemo, declineMemo } from './memoService';

export async function bulkApproveMemos(managerId: string, memoIds: string[]) {
  const results = {
    approved: [],
    failed: [],
  };

  for (const memoId of memoIds) {
    try {
      const memo = await approveMemo(managerId, memoId);
      results.approved.push(memoId);
    } catch (error) {
      results.failed.push({
        memoId,
        error: error.message,
      });
    }
  }

  return results;
}

export async function bulkDeclineMemos(managerId: string, memoIds: string[]) {
  const results = {
    declined: [],
    failed: [],
  };

  for (const memoId of memoIds) {
    try {
      await declineMemo(managerId, memoId);
      results.declined.push(memoId);
    } catch (error) {
      results.failed.push({
        memoId,
        error: error.message,
      });
    }
  }

  return results;
}
```

**Usage:**
```typescript
const memoIds = ['memo-1', 'memo-2', 'memo-3'];
const result = await bulkApproveMemos('manager-123', memoIds);
console.log(`Approved: ${result.approved.length}, Failed: ${result.failed.length}`);
```

---

### Example 4: Workflow Event System

```typescript
// services/workflowEventService.ts
import { approveMemo, queryMemo, declineMemo } from './memoService';
import EventEmitter from 'events';

class WorkflowEventEmitter extends EventEmitter {}

export const workflowEvents = new WorkflowEventEmitter();

// Intercept and log all decisions
workflowEvents.on('memo:approved', (data) => {
  console.log(`WORKFLOW: Memo approved`, data);
  // Send webhook, update analytics, etc.
});

workflowEvents.on('memo:queried', (data) => {
  console.log(`WORKFLOW: Memo queried`, data);
  // Notify user, log for analytics
});

workflowEvents.on('memo:declined', (data) => {
  console.log(`WORKFLOW: Memo declined`, data);
  // Archive memo, notify team
});

// Wrapper functions that emit events
export async function approveWithEvent(userId: string, memoId: string) {
  const memo = await approveMemo(userId, memoId);
  workflowEvents.emit('memo:approved', { userId, memoId, memo });
  return memo;
}

export async function queryWithEvent(userId: string, memoId: string, message: string) {
  const memo = await queryMemo(userId, memoId, message);
  workflowEvents.emit('memo:queried', { userId, memoId, message, memo });
  return memo;
}

export async function declineWithEvent(userId: string, memoId: string) {
  const memo = await declineMemo(userId, memoId);
  workflowEvents.emit('memo:declined', { userId, memoId, memo });
  return memo;
}
```

**Usage:**
```typescript
import { approveWithEvent } from './services/workflowEventService';

// Event handlers
workflowEvents.on('memo:approved', async (data) => {
  // Send Slack notification
  // Update dashboard
  // Archive memo
});

// Use in routes
const memo = await approveWithEvent(userId, memoId);
```

---

### Example 5: Caching Layer

```typescript
// services/memoCache.ts
import { approveMemo } from './memoService';
import { Redis } from 'ioredis';

const redis = new Redis();

export async function getCachedApprovalChain(memoId: string): Promise<string[]> {
  const cached = await redis.get(`approval_chain:${memoId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Build approval chain (cache misses)
  const chain = await buildApprovalChain(memoId);
  await redis.setex(`approval_chain:${memoId}`, 3600, JSON.stringify(chain));
  return chain;
}

export async function approveWithCache(userId: string, memoId: string) {
  // Approve memo
  const memo = await approveMemo(userId, memoId);

  // Invalidate cache
  await redis.del(`approval_chain:${memoId}`);
  await redis.del(`memo_details:${memoId}`);

  return memo;
}

async function buildApprovalChain(memoId: string): Promise<string[]> {
  // Recursive function to build hierarchy chain
  // This shows who would approve next
  return [];
}
```

---

### Example 6: Advanced Authorization

```typescript
// middleware/decisionAuthMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors';
import { prisma } from '../prismaClient';
import { AuthRequest } from './auth';

export const checkMemoOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const memoId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenError('User not authenticated');
    }

    // Check if memo is assigned to this user
    const memo = await prisma.memo.findUnique({
      where: { id: memoId },
      select: { currentApproverId: true },
    });

    if (!memo || memo.currentApproverId !== userId) {
      throw new ForbiddenError('This memo is not assigned to you');
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const checkManagerRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Manager role required' });
  }
  next();
};

// Usage in routes
router.post(
  '/:id/approve',
  authenticateToken,
  checkManagerRole,
  checkMemoOwnership,
  async (req: AuthRequest, res, next) => {
    // Handler
  }
);
```

---

### Example 7: Logging & Audit Trail

```typescript
// services/auditService.ts
import { prisma } from '../prismaClient';

export interface AuditEntry {
  userId: string;
  action: 'APPROVE' | 'QUERY' | 'DECLINE';
  memoId: string;
  timestamp: Date;
  details: Record<string, any>;
}

// Create audit log table
export async function logDecision(entry: AuditEntry) {
  // Option 1: Save to database
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      memoId: entry.memoId,
      timestamp: entry.timestamp,
      details: JSON.stringify(entry.details),
    },
  });

  // Option 2: Send to external service
  await logToExternalService(entry);

  // Option 3: Store in time-series DB
  await logToInfluxDB(entry);
}

async function logToExternalService(entry: AuditEntry) {
  // Send to ELK, Splunk, DataDog, etc.
  const response = await fetch('https://logs.example.com/api/logs', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

async function logToInfluxDB(entry: AuditEntry) {
  // Store metrics for analytics
  // Query approval time trends, bottlenecks, etc.
}

// Integration with decision functions
export async function auditedApproveMemo(userId: string, memoId: string) {
  const startTime = Date.now();
  
  try {
    const memo = await approveMemo(userId, memoId);
    
    await logDecision({
      userId,
      action: 'APPROVE',
      memoId,
      timestamp: new Date(),
      details: {
        status: memo.status,
        nextApproverId: memo.currentApproverId,
        duration: Date.now() - startTime,
      },
    });
    
    return memo;
  } catch (error) {
    await logDecision({
      userId,
      action: 'APPROVE',
      memoId,
      timestamp: new Date(),
      details: {
        error: error.message,
        duration: Date.now() - startTime,
      },
    });
    throw error;
  }
}
```

---

### Example 8: Notifications

```typescript
// services/notificationService.ts
import { queryMemo, approveMemo, declineMemo } from './memoService';
import { prisma } from '../prismaClient';

export async function approveAndNotify(userId: string, memoId: string) {
  const memo = await approveMemo(userId, memoId);

  // Notify next approver
  if (memo.currentApproverId) {
    await sendNotification(memo.currentApproverId, {
      type: 'MEMO_ASSIGNED',
      memoId,
      title: memo.title,
      assignedBy: userId,
    });
  }

  // Notify creator
  await sendNotification(memo.createdBy, {
    type: 'MEMO_APPROVED_STEP',
    memoId,
    approver: userId,
  });

  return memo;
}

export async function queryAndNotify(userId: string, memoId: string, message: string) {
  const memo = await queryMemo(userId, memoId, message);

  // Notify creator
  await sendNotification(memo.createdBy, {
    type: 'MEMO_QUERIED',
    memoId,
    queriedBy: userId,
    message,
  });

  return memo;
}

export async function declineAndNotify(userId: string, memoId: string) {
  const memo = await declineMemo(userId, memoId);

  // Notify creator
  await sendNotification(memo.createdBy, {
    type: 'MEMO_DECLINED',
    memoId,
    declinedBy: userId,
  });

  return memo;
}

async function sendNotification(userId: string, data: any) {
  // Get user preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, preferences: true },
  });

  if (!user) return;

  // Send email
  await sendEmail(user.email, {
    subject: getNotificationSubject(data.type),
    body: getNotificationBody(data),
  });

  // Send in-app notification
  // Send SMS if critical
  // Post to Slack
}

function getNotificationSubject(type: string): string {
  const subjects: Record<string, string> = {
    'MEMO_ASSIGNED': 'New memo requires your approval',
    'MEMO_QUERIED': 'Your memo has been queried',
    'MEMO_DECLINED': 'Your memo has been declined',
    'MEMO_APPROVED_STEP': 'Your memo was approved (moving forward)',
  };
  return subjects[type] || 'Memo Update';
}

function getNotificationBody(data: any): string {
  // Build personalized notification message
  return `Memo: ${data.memoId}`;
}

async function sendEmail(to: string, options: any) {
  // Use nodemailer, SendGrid, etc.
  console.log(`[EMAIL] To: ${to}, Subject: ${options.subject}`);
}
```

---

### Example 9: Dashboard Queries

```typescript
// services/dashboardService.ts
import { prisma } from '../prismaClient';

export async function getApprovalMetrics(managerId: string) {
  const [pending, approved, queried, declined] = await Promise.all([
    prisma.memo.count({
      where: { currentApproverId: managerId, status: 'PENDING' },
    }),
    prisma.memo.count({
      where: { currentApproverId: managerId, status: 'APPROVED' },
    }),
    prisma.memo.count({
      where: { currentApproverId: managerId, status: 'QUERIED' },
    }),
    prisma.memo.count({
      where: { currentApproverId: managerId, status: 'DECLINED' },
    }),
  ]);

  return { pending, approved, queried, declined };
}

export async function getApprovalTimeTrend() {
  // Average time in each status
  const result = await prisma.$queryRaw`
    SELECT 
      status,
      AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 3600 as avg_hours,
      COUNT(*) as total
    FROM "Memo"
    GROUP BY status
  `;
  return result;
}

export async function getManagerWorkload() {
  // How many memos each manager has pending
  const result = await prisma.$queryRaw`
    SELECT 
      u.id,
      u.name,
      COUNT(m.id) as pending_count
    FROM "User" u
    LEFT JOIN "Memo" m ON u.id = m."currentApproverId" AND m.status = 'PENDING'
    WHERE u.role = 'MANAGER'
    GROUP BY u.id, u.name
    ORDER BY pending_count DESC
  `;
  return result;
}
```

---

## Best Practices

### ✅ Do's

```typescript
// DO: Use try-catch and proper error handling
try {
  const memo = await approveMemo(userId, memoId);
} catch (error) {
  if (error instanceof ForbiddenError) {
    // Handle authorization failure
  }
}

// DO: Log important actions
console.log(`[${userId}] APPROVED memo [${memoId}]`);

// DO: Validate input before calling service
if (!message || !message.trim()) {
  throw new ValidationError('Message required');
}

// DO: Use transactions for related operations
await prisma.$transaction(async (tx) => {
  // Multiple related operations
});

// DO: Check permissions early
if (user.role !== 'MANAGER') {
  throw new ForbiddenError('Only managers');
}
```

### ❌ Don'ts

```typescript
// DON'T: Assume service calls always succeed
const memo = await approveMemo(userId, memoId); // No error handling

// DON'T: Log sensitive information
console.log(`User password: ${password}`);

// DON'T: Skip validation
await queryMemo(userId, memoId, message); // No check for empty message

// DON'T: Make multiple independent DB calls
await prisma.memo.update(...);
await prisma.comment.create(...); // Not in transaction!

// DON'T: Trust client input
const userId = req.body.userId; // Use authenticated user instead
```

---

## Summary

The Decision Engine is designed to be:
- ✅ **Simple** - Easy to use and integrate
- ✅ **Reliable** - Transactions ensure consistency
- ✅ **Secure** - JWT + role-based authorization
- ✅ **Auditable** - Console logging and event system
- ✅ **Extensible** - Can wrap with notifications, caching, etc.

Use the examples above to:
1. Build automated approval systems
2. Add escalations and deadlines
3. Integrate with notification systems
4. Create dashboards and analytics
5. Implement audit trails
6. Add caching and performance optimization

# Decision Engine Implementation

A comprehensive workflow SaaS decision engine for handling memo approvals, queries, and declines with proper authorization, validation, and audit logging.

## Architecture Overview

The Decision Engine is built with:
- **Node.js/TypeScript** - Type-safe backend
- **Express** - HTTP API with routes
- **Prisma** - Database ORM with transactions
- **PostgreSQL** - Persistent data storage
- **JWT** - Authentication

## Service Functions

### 1. `approveMemo(userId: string, memoId: string): Promise<MemoWithDetails>`

Approves a memo and advances it in the approval hierarchy.

**Logic:**
- Validates shared authorization rules (memo exists, PENDING, assigned to user, user is MANAGER)
- Fetches current user's manager (reportsTo)
- **If next manager exists:** Sets `currentApproverId` to next manager, status remains `PENDING`
- **If top of hierarchy:** Sets status to `APPROVED`, `currentApproverId` to `null`

**Audit Log:**
```
[userId] APPROVED memo [memoId] and passed to [nextManagerId]
[userId] APPROVED memo [memoId] - reached top of hierarchy
```

**Usage:**
```typescript
const approvedMemo = await approveMemo('manager-123', 'memo-456');
```

### 2. `queryMemo(userId: string, memoId: string, message: string): Promise<MemoWithDetails>`

Sends a memo back to the creator with a query message for clarification.

**Logic:**
- Validates shared authorization rules
- Requires non-empty message (trimmed)
- Creates a `Comment` record with message, memoId, userId
- Sets memo status to `QUERIED`
- Sets `currentApproverId` back to memo creator (`createdBy`)

**Audit Log:**
```
[userId] QUERIED memo [memoId] - returned to creator [creatorId]
```

**Usage:**
```typescript
const queriedMemo = await queryMemo('manager-123', 'memo-456', 'Please clarify the budget allocation');
```

### 3. `declineMemo(userId: string, memoId: string): Promise<MemoWithDetails>`

Rejects a memo completely.

**Logic:**
- Validates shared authorization rules
- Sets memo status to `DECLINED`
- Sets `currentApproverId` to `null` (no further action needed)

**Audit Log:**
```
[userId] DECLINED memo [memoId]
```

**Usage:**
```typescript
const declinedMemo = await declineMemo('manager-123', 'memo-456');
```

## Shared Validation Logic

All three service functions use `validateDecisionAction()` internally:

```typescript
async function validateDecisionAction(
  tx: any,
  userId: string,
  memoId: string
): Promise<{ memo: any; user: any }>
```

**Validation Steps:**
1. ✅ Fetch memo by `memoId`
2. ✅ Throw error if memo does not exist (404)
3. ✅ Ensure `memo.status === "PENDING"` (400 if not)
4. ✅ Ensure `memo.currentApproverId === userId` (403 if not)
5. ✅ Fetch user and ensure `user.role === "MANAGER"` (403 if not)

**Error Responses:**
- `404 NotFoundError` - Memo not found
- `400 ValidationError` - Memo not in PENDING status
- `403 ForbiddenError` - Not assigned to user OR not a manager

## Express Routes

### POST `/memos/:id/approve`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response (Success - 200):**
```json
{
  "message": "Memo approved successfully",
  "memo": {
    "id": "memo-456",
    "status": "PENDING",
    "currentApproverId": "next-manager-789",
    "updatedAt": "2026-05-15T10:30:00Z"
  }
}
```

**Response (Top of Hierarchy):**
```json
{
  "message": "Memo approved successfully",
  "memo": {
    "id": "memo-456",
    "status": "APPROVED",
    "currentApproverId": null,
    "updatedAt": "2026-05-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `404` - Memo not found
- `400` - Memo not PENDING
- `403` - User not authorized
- `401` - Missing/invalid JWT

---

### POST `/memos/:id/query`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "message": "Please clarify the budget breakdown for Q3"
}
```

**Response (Success - 200):**
```json
{
  "message": "Memo queried successfully",
  "memo": {
    "id": "memo-456",
    "status": "QUERIED",
    "currentApproverId": "staff-user-123",
    "updatedAt": "2026-05-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `400` - Message is empty or missing
- `404` - Memo not found
- `400` - Memo not PENDING
- `403` - User not authorized
- `401` - Missing/invalid JWT

---

### POST `/memos/:id/decline`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response (Success - 200):**
```json
{
  "message": "Memo declined successfully",
  "memo": {
    "id": "memo-456",
    "status": "DECLINED",
    "currentApproverId": null,
    "updatedAt": "2026-05-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `404` - Memo not found
- `400` - Memo not PENDING
- `403` - User not authorized
- `401` - Missing/invalid JWT

## Prisma Transaction Usage

All three operations wrap database changes in a **Prisma transaction** for atomicity:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // All database operations use tx instead of prisma
  const { memo, user } = await validateDecisionAction(tx, userId, memoId);
  
  // Create comment (if query action)
  await tx.comment.create({ ... });
  
  // Update memo
  const updatedMemo = await tx.memo.update({ ... });
  
  return updatedMemo;
});
```

**Benefits:**
- ✅ **Atomicity**: All operations succeed or none do
- ✅ **Consistency**: Database never in intermediate state
- ✅ **Error Handling**: Transaction rollback on error
- ✅ **Audit Trail**: Prevents orphaned comments if memo update fails

## Authorization & Security

### Requirements:
1. ✅ **JWT Authentication** - All routes require valid Bearer token
2. ✅ **MANAGER Role** - Only managers can approve, query, or decline
3. ✅ **Ownership Check** - Memo must be assigned to requesting user
4. ✅ **Status Validation** - Can only act on PENDING memos

### Example JWT Payload:
```json
{
  "id": "manager-123",
  "email": "manager@company.com",
  "role": "MANAGER"
}
```

## Audit Logging

Each action logs to console with timestamp information:

```
[manager-123] APPROVED memo [memo-456] and passed to [manager-789]
[manager-456] QUERIED memo [memo-789] - returned to creator [staff-001]
[manager-123] DECLINED memo [memo-456]
```

**Log Format:** `[userId] ACTION memo [memoId] [additional context]`

**Use Cases:**
- Compliance & audit trails
- Debugging workflow issues
- Performance monitoring
- User accountability

## Data Model

### Memo Status Flow

```
           Submitted
               ↓
           PENDING ← ─ ─ ─ ─ ┐
           /   |   \          |
      Approve  |   Decline  QUERIED
         ↓     ↓      ↓        |
    PENDING or  DECLINED   (resubmit)
    APPROVED               |
                      Returns to
                      PENDING
```

### Key Fields:
- `status` - Current state (PENDING, APPROVED, QUERIED, DECLINED)
- `currentApproverId` - Current user who must act (null if APPROVED/DECLINED)
- `createdBy` - Original memo creator
- `comments` - Query messages and discussions

## Complete Workflow Example

### Scenario: Multi-level Approval

**Step 1: Staff submits memo**
```
Memo created by: staff-001
currentApproverId: manager-1 (staff's manager)
status: PENDING
```

**Step 2: Manager-1 approves → passes to Manager-2**
```
POST /memos/memo-456/approve
Authorization: Bearer <manager-1-token>

Response:
status: PENDING
currentApproverId: manager-2
```

**Step 3: Manager-2 queries for clarification**
```
POST /memos/memo-456/query
Authorization: Bearer <manager-2-token>
Body: { "message": "Need budget details" }

Response:
status: QUERIED
currentApproverId: staff-001
Comment created with query message
```

**Step 4: Staff revises and resubmits**
```
POST /memos/memo-456/approve
Authorization: Bearer <staff-001-token>
(resubmission moves to PENDING with same approver)
```

**Step 5: Manager-2 approves → passes to Manager-3**
```
POST /memos/memo-456/approve
Authorization: Bearer <manager-2-token>

Response:
status: PENDING
currentApproverId: manager-3
```

**Step 6: Manager-3 is at top of hierarchy → approves completely**
```
POST /memos/memo-456/approve
Authorization: Bearer <manager-3-token>

Response:
status: APPROVED
currentApproverId: null
```

## Error Handling

### Common Error Scenarios

#### 1. Memo Not Found
```json
{
  "error": "Memo with id=invalid-id not found"
}
// Status: 404
```

#### 2. Not Authorized - Not a Manager
```json
{
  "error": "Only managers can approve, query, or decline memos"
}
// Status: 403
```

#### 3. Not Authorized - Not Assigned
```json
{
  "error": "This memo is not assigned to you for approval"
}
// Status: 403
```

#### 4. Invalid Memo Status
```json
{
  "error": "Cannot perform action on memo with status APPROVED. Memo must be PENDING"
}
// Status: 400
```

#### 5. Empty Query Message
```json
{
  "error": "Query message cannot be empty"
}
// Status: 400
```

#### 6. Missing JWT Token
```json
{
  "error": "Access token required"
}
// Status: 401
```

#### 7. Invalid JWT Token
```json
{
  "error": "Invalid or expired token"
}
// Status: 403
```

## Future Enhancements

### 1. Idempotency Keys
Prevent duplicate submissions by tracking request IDs:
```typescript
const idempotencyKey = req.headers['idempotency-key'];
// Check if already processed
```

### 2. Async Notifications
Send emails/webhooks on memo status changes:
```typescript
await notifyUser(approver, 'New memo requires approval');
```

### 3. Delegation
Allow managers to delegate approval to peers:
```typescript
delegateApproval(memoId, currentManagerId, delegateManagerId)
```

### 4. SLA Tracking
Monitor approval time and escalate overdue memos:
```typescript
const daysPending = (now - memo.createdAt) / (1000 * 60 * 60 * 24);
```

### 5. Batch Operations
Approve multiple memos at once:
```typescript
approveMemos(userId, memoIds: string[])
```

## Testing

### Example Test Cases

```typescript
describe('Decision Engine', () => {
  describe('approveMemo', () => {
    test('should approve and pass to next manager', async () => {
      const memo = await approveMemo(manager1Id, memoId);
      expect(memo.status).toBe('PENDING');
      expect(memo.currentApproverId).toBe(manager2Id);
    });

    test('should approve and mark complete at top of hierarchy', async () => {
      const memo = await approveMemo(topManagerId, memoId);
      expect(memo.status).toBe('APPROVED');
      expect(memo.currentApproverId).toBe(null);
    });

    test('should throw 403 if not manager', async () => {
      await expect(approveMemo(staffId, memoId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('queryMemo', () => {
    test('should query and return to creator', async () => {
      const memo = await queryMemo(managerId, memoId, 'Please clarify');
      expect(memo.status).toBe('QUERIED');
      expect(memo.currentApproverId).toBe(memoCreatorId);
    });

    test('should create comment with query message', async () => {
      await queryMemo(managerId, memoId, 'Need details');
      const comments = await prisma.comment.findMany({ where: { memoId } });
      expect(comments.length).toBeGreaterThan(0);
    });
  });

  describe('declineMemo', () => {
    test('should decline and clear approver', async () => {
      const memo = await declineMemo(managerId, memoId);
      expect(memo.status).toBe('DECLINED');
      expect(memo.currentApproverId).toBe(null);
    });
  });
});
```

## Deployment Checklist

- ✅ JWT_SECRET environment variable configured
- ✅ DATABASE_URL points to PostgreSQL
- ✅ Prisma migrations applied: `prisma migrate deploy`
- ✅ Error handling middleware configured
- ✅ CORS settings configured for frontend
- ✅ Rate limiting enabled for routes
- ✅ Logging aggregation (e.g., ELK stack)
- ✅ Database backups enabled
- ✅ Monitoring/alerting configured

## Summary

The Decision Engine provides a robust, production-ready workflow system with:
- ✅ Type-safe service functions
- ✅ Shared validation logic
- ✅ Prisma transaction atomicity
- ✅ JWT authentication & authorization
- ✅ Comprehensive error handling
- ✅ Audit logging for compliance
- ✅ Clear API documentation
- ✅ Extensible architecture

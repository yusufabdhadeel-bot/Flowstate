# Decision Engine - API Examples & Testing Guide

## Setup & Prerequisites

### 1. Environment Variables
```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/flowstate
JWT_SECRET=your-secret-key-here-min-32-chars
NODE_ENV=development
```

### 2. Start the Server
```bash
npm install
npx prisma migrate deploy
npm run dev
```

### 3. Get JWT Token
```bash
# Login endpoint (assuming exists)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@company.com",
    "password": "password123"
  }'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
# }
```

---

## Complete Workflow Examples

### Scenario 1: Simple Approval Chain (2 Managers)

#### Organization Structure:
```
Staff (staff-001)
  ↓ reports to
Manager-1 (manager-1)
  ↓ reports to
Director (director-1) [TOP]
```

#### Step 1: Staff submits memo
```bash
curl -X POST http://localhost:3000/memos/submit \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q3 Budget Request",
    "content": "We need additional budget for cloud infrastructure",
    "attachmentUrl": "https://example.com/budget.pdf"
  }'

# Response:
# {
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "title": "Q3 Budget Request",
#     "status": "PENDING",
#     "currentApproverId": "manager-1",
#     "createdBy": "staff-001",
#     "comments": []
#   }
# }
```

**Captured:**
- `MEMO_ID = 550e8400-e29b-41d4-a716-446655440000`
- `MANAGER_1_TOKEN = <token for manager-1>`

---

#### Step 2: Manager-1 approves → passes to Director
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer <MANAGER_1_TOKEN>" \
  -H "Content-Type: application/json"

# Response:
# {
#   "message": "Memo approved successfully",
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "status": "PENDING",
#     "currentApproverId": "director-1",
#     "updatedAt": "2026-05-15T10:30:00Z"
#   }
# }
```

**Console Output:**
```
[manager-1] APPROVED memo [550e8400-e29b-41d4-a716-446655440000] and passed to [director-1]
```

**State After Step 2:**
```
status: PENDING
currentApproverId: director-1
```

---

#### Step 3: Director approves → reaches top of hierarchy
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer <DIRECTOR_TOKEN>" \
  -H "Content-Type: application/json"

# Response:
# {
#   "message": "Memo approved successfully",
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "status": "APPROVED",
#     "currentApproverId": null,
#     "updatedAt": "2026-05-15T10:35:00Z"
#   }
# }
```

**Console Output:**
```
[director-1] APPROVED memo [550e8400-e29b-41d4-a716-446655440000] - reached top of hierarchy
```

**Final State:**
```
status: APPROVED
currentApproverId: null
→ No further action needed
```

---

### Scenario 2: Query for Clarification

#### Step 1: Manager receives memo for approval
```
Memo ID: 550e8400-e29b-41d4-a716-446655440001
Status: PENDING
currentApproverId: manager-2
Creator: staff-002
```

#### Step 2: Manager queries the memo
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440001/query \
  -H "Authorization: Bearer <MANAGER_2_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "The budget breakdown needs more detail. Please provide line-item costs for each department."
  }'

# Response:
# {
#   "message": "Memo queried successfully",
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440001",
#     "status": "QUERIED",
#     "currentApproverId": "staff-002",
#     "updatedAt": "2026-05-15T10:40:00Z"
#   }
# }
```

**Console Output:**
```
[manager-2] QUERIED memo [550e8400-e29b-41d4-a716-446655440001] - returned to creator [staff-002]
```

**State After Query:**
```
status: QUERIED
currentApproverId: staff-002 (creator)
→ Staff can now resubmit/update
```

---

#### Step 3: Get full memo with comments
```bash
curl -X GET http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440001 \
  -H "Content-Type: application/json"

# Response:
# {
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440001",
#     "title": "Q3 Budget Request",
#     "content": "We need additional budget for cloud infrastructure",
#     "status": "QUERIED",
#     "currentApproverId": "staff-002",
#     "createdBy": "staff-002",
#     "comments": [
#       {
#         "id": "comment-001",
#         "message": "The budget breakdown needs more detail. Please provide line-item costs for each department.",
#         "userId": "manager-2",
#         "user": {
#           "id": "manager-2",
#           "name": "John Manager"
#         },
#         "createdAt": "2026-05-15T10:40:00Z"
#       }
#     ]
#   }
# }
```

---

#### Step 4: Staff resubmits (creates new memo or updates existing)
```bash
# For QUERIED memos, staff would typically create a new version
curl -X POST http://localhost:3000/memos/submit \
  -H "Authorization: Bearer <STAFF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q3 Budget Request - Revised",
    "content": "Updated budget with detailed breakdown...",
    "attachmentUrl": "https://example.com/budget-revised.pdf"
  }'

# This creates a NEW memo starting fresh approval chain
```

---

### Scenario 3: Declining a Memo

#### Step 1: Manager receives memo
```
Memo ID: 550e8400-e29b-41d4-a716-446655440002
Status: PENDING
currentApproverId: manager-3
```

#### Step 2: Manager decides to decline
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440002/decline \
  -H "Authorization: Bearer <MANAGER_3_TOKEN>" \
  -H "Content-Type: application/json"

# Response:
# {
#   "message": "Memo declined successfully",
#   "memo": {
#     "id": "550e8400-e29b-41d4-a716-446655440002",
#     "status": "DECLINED",
#     "currentApproverId": null,
#     "updatedAt": "2026-05-15T10:45:00Z"
#   }
# }
```

**Console Output:**
```
[manager-3] DECLINED memo [550e8400-e29b-41d4-a716-446655440002]
```

**Final State:**
```
status: DECLINED
currentApproverId: null
→ Memo is rejected, no further action
```

---

## Error Scenarios & Responses

### Error 1: Memo Not Found
```bash
curl -X POST http://localhost:3000/memos/invalid-id-12345/approve \
  -H "Authorization: Bearer <TOKEN>"

# Response: 404
# {
#   "error": "Memo with id=invalid-id-12345 not found"
# }
```

---

### Error 2: Missing Authentication Token
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve

# Response: 401
# {
#   "error": "Access token required"
# }
```

---

### Error 3: Invalid/Expired Token
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer invalid.token.here"

# Response: 403
# {
#   "error": "Invalid or expired token"
# }
```

---

### Error 4: Not a Manager
```bash
# User has role STAFF, trying to approve
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer <STAFF_TOKEN>"

# Response: 403
# {
#   "error": "Only managers can approve, query, or decline memos"
# }
```

---

### Error 5: Memo Not Assigned to User
```bash
# Manager-1 token but memo assigned to Manager-2
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer <MANAGER_1_TOKEN>"

# Response: 403
# {
#   "error": "This memo is not assigned to you for approval"
# }
```

---

### Error 6: Memo Not in PENDING Status
```bash
# Memo is already APPROVED or DECLINED
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer <TOKEN>"

# Response: 400
# {
#   "error": "Cannot perform action on memo with status APPROVED. Memo must be PENDING"
# }
```

---

### Error 7: Empty Query Message
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/query \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": ""
  }'

# Response: 400
# {
#   "error": "Query message cannot be empty"
# }
```

---

### Error 8: Query Message Missing Entirely
```bash
curl -X POST http://localhost:3000/memos/550e8400-e29b-41d4-a716-446655440000/query \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Response: 400
# {
#   "error": "Query message is required"
# }
```

---

## Integration Test Suite

### Using Jest & Supertest

```typescript
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/prismaClient';

describe('Decision Engine - Integration Tests', () => {
  let managerId: string;
  let staffId: string;
  let memoId: string;
  let managerToken: string;

  beforeAll(async () => {
    // Setup: Create test users
    const manager = await prisma.user.create({
      data: {
        id: 'test-manager-1',
        name: 'Test Manager',
        email: 'manager@test.com',
        passwordHash: 'hashed',
        role: 'MANAGER',
        isActive: true,
      },
    });

    const staff = await prisma.user.create({
      data: {
        id: 'test-staff-1',
        name: 'Test Staff',
        email: 'staff@test.com',
        passwordHash: 'hashed',
        role: 'STAFF',
        reportsTo: manager.id,
        isActive: true,
      },
    });

    managerId = manager.id;
    staffId = staff.id;
    managerToken = generateToken(manager);

    // Create a memo
    const memo = await prisma.memo.create({
      data: {
        title: 'Test Memo',
        content: 'Test content',
        createdBy: staffId,
        currentApproverId: managerId,
        status: 'PENDING',
      },
    });

    memoId = memo.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /memos/:id/approve', () => {
    test('should approve and pass to next manager', async () => {
      const response = await request(app)
        .post(`/memos/${memoId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.memo.status).toBe('APPROVED');
      expect(response.body.memo.currentApproverId).toBeNull();
    });

    test('should return 403 if not manager', async () => {
      const staffToken = generateToken({ id: staffId, role: 'STAFF' });
      
      const response = await request(app)
        .post(`/memos/${memoId}/approve`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('managers');
    });

    test('should return 404 if memo not found', async () => {
      const response = await request(app)
        .post('/memos/nonexistent/approve')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /memos/:id/query', () => {
    test('should query and return to creator', async () => {
      const response = await request(app)
        .post(`/memos/${memoId}/query`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ message: 'Please clarify the budget' });

      expect(response.status).toBe(200);
      expect(response.body.memo.status).toBe('QUERIED');
      expect(response.body.memo.currentApproverId).toBe(staffId);
    });

    test('should create comment with query message', async () => {
      await request(app)
        .post(`/memos/${memoId}/query`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ message: 'Need more details' });

      const memo = await prisma.memo.findUnique({
        where: { id: memoId },
        include: { comments: true },
      });

      expect(memo?.comments.length).toBeGreaterThan(0);
      expect(memo?.comments[0].message).toBe('Need more details');
    });

    test('should return 400 if message is empty', async () => {
      const response = await request(app)
        .post(`/memos/${memoId}/query`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ message: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('empty');
    });
  });

  describe('POST /memos/:id/decline', () => {
    test('should decline memo', async () => {
      const response = await request(app)
        .post(`/memos/${memoId}/decline`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.memo.status).toBe('DECLINED');
      expect(response.body.memo.currentApproverId).toBeNull();
    });

    test('should return 400 if memo already declined', async () => {
      // First decline
      await request(app)
        .post(`/memos/${memoId}/decline`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Try to decline again
      const response = await request(app)
        .post(`/memos/${memoId}/decline`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PENDING');
    });
  });
});
```

---

## Performance Testing with Apache Bench

### Test 1: Concurrent Approvals
```bash
# Create 100 concurrent approval requests
ab -n 100 -c 10 \
  -H "Authorization: Bearer <TOKEN>" \
  -X POST \
  http://localhost:3000/memos/memo-id/approve
```

### Test 2: Load Testing Query Endpoints
```bash
# Use k6 for more sophisticated load testing
cat > loadtest.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
};

export default function () {
  const payload = JSON.stringify({
    message: 'Please clarify the budget allocation',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGc...',
    },
  };

  const res = http.post(
    'http://localhost:3000/memos/memo-id/query',
    payload,
    params
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'query succeeded': (r) => JSON.parse(r.body).message === 'Memo queried successfully',
  });
}
EOF

k6 run loadtest.js
```

---

## Debugging & Monitoring

### Enable Debug Logging
```typescript
// In environment
DEBUG=flowstate:* npm run dev
```

### Monitor Database Transactions
```sql
-- PostgreSQL: Monitor active transactions
SELECT pid, usename, application_name, state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start DESC;
```

### Logs to Look For
```
[manager-id] APPROVED memo [memo-id] and passed to [next-manager-id]
[manager-id] QUERIED memo [memo-id] - returned to creator [creator-id]
[manager-id] DECLINED memo [memo-id]
```

---

## Summary

This guide covers:
- ✅ Complete workflow examples (2-3 manager chains)
- ✅ Query workflow with comments
- ✅ Decline workflow
- ✅ All 8 error scenarios
- ✅ Integration test examples
- ✅ Performance testing approach
- ✅ Debugging techniques

**Key Endpoints:**
```
POST   /memos/:id/approve    - Approve and advance
POST   /memos/:id/query      - Query with message
POST   /memos/:id/decline    - Decline completely
GET    /memos/:id            - Get full memo details
GET    /memos/pending        - List pending memos
```

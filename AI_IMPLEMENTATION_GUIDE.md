# AI Classification System - Implementation Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install @google/generative-ai
# or
yarn add @google/generative-ai
```

### 2. Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key
4. Add to `.env`:
   ```bash
   GEMINI_API_KEY=your-key-here
   ```

### 3. Update Database Schema

Run Prisma migration:

```bash
npm run prisma:migrate
```

This adds AI fields to the Memo model:
- `aiClassification` (String)
- `aiSummary` (Text)
- `aiConfidence` (Float)
- `aiProcessedAt` (DateTime)
- `aiTokenCount` (Int)
- `aiProcessingTime` (Int)

### 4. Start Server

```bash
npm run dev
```

AI processing will automatically start for new memos.

## Features Implemented

### ✅ Automatic Processing

When a memo is created via `POST /memos/submit`:
1. Memo saved to database
2. User gets immediate response
3. AI analysis queued asynchronously
4. Background process analyzes content
5. Results stored in database

### ✅ Admin Endpoints

All require `ADMIN` role:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ai/status` | GET | Check AI service status |
| `/ai/usage-stats` | GET | View usage metrics |
| `/ai/analyze/:memoId` | POST | Manual analysis trigger |
| `/ai/reprocess/:memoId` | POST | Clear and re-analyze |
| `/ai/pending` | GET | List unprocessed memos |
| `/ai/batch-reprocess` | POST | Bulk reprocessing |
| `/ai/classification/:type` | GET | Filter by classification |
| `/ai/dashboard` | GET | Analytics dashboard |

### ✅ Document Classifications

```
MEMO         - Internal announcements, communications
INVOICE      - Bills, expense reports, payment requests
REQUEST      - Approvals, resource requests, time off
PROCUREMENT  - Purchase orders, vendor selection
REPORT       - Analysis, performance metrics
OTHER        - Doesn't fit above categories
```

### ✅ Confidence Scoring

AI returns 0.0-1.0 confidence for each classification:
- 0.9+ = High confidence
- 0.7-0.9 = Medium confidence
- <0.7 = Low confidence

### ✅ Usage Tracking

Tracks:
- Total API requests
- Successful/failed analyses
- Token usage (billing metric)
- Average processing time

### ✅ Error Handling

- AI failures don't break memo creation
- All failures logged
- Failed memos can be reprocessed
- Service degrades gracefully if API unavailable

## Code Examples

### Get Memo with AI Data

```typescript
// Memo now includes AI fields
const memo = await getMemoById(memoId);

console.log(memo.aiClassification);  // "MEMO"
console.log(memo.aiSummary);         // "Staff update regarding..."
console.log(memo.aiConfidence);      // 0.95
console.log(memo.aiProcessedAt);     // 2026-05-29T10:35:00Z
```

### Query Memos by Classification

```bash
# Get all INVOICEs
curl http://localhost:4000/ai/classification/INVOICE \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# Response includes all invoice-classified memos with summaries
```

### Dashboard Data

```typescript
const response = await fetch('/ai/dashboard', {
  headers: {
    'Authorization': `Bearer ${adminToken}`,
  },
});

const dashboard = await response.json();

// Access data
console.log(dashboard.overview.processingRate);           // "96.67%"
console.log(dashboard.classifications);                  // Classification counts
console.log(dashboard.analysisQuality.averageConfidence); // 0.924
console.log(dashboard.usage.totalTokensUsed);           // 327450
```

### Batch Reprocessing

```typescript
// Reprocess multiple memos
const response = await fetch('/ai/batch-reprocess', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    memoIds: [
      '550e8400-e29b-41d4',
      '660f8410-f39c-42e5',
      '770g8520-g40d-53f6',
    ],
  }),
});

const result = await response.json();
console.log(`Processed: ${result.results.processed}`);    // 3
console.log(`Successful: ${result.results.successful}`);  // 3
console.log(`Failed: ${result.results.failed}`);          // 0
```

## Prisma Schema Reference

```prisma
model Memo {
  id                String     @id @default(uuid()) @db.Uuid
  title             String
  content           String     @db.Text
  attachmentUrl     String?    @db.Text
  status            MemoStatus @default(PENDING)
  createdBy         String     @db.Uuid
  currentApproverId String?    @db.Uuid
  lastReminderSentAt DateTime?
  reminderCount     Int        @default(0)
  
  // AI Classification Fields (NEW)
  aiClassification  String?
  aiSummary         String?    @db.Text
  aiConfidence      Float?
  aiProcessedAt     DateTime?
  aiTokenCount      Int        @default(0)
  aiProcessingTime  Int        @default(0)
  
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  creator         User      @relation("MemoCreator", fields: [createdBy], references: [id])
  currentApprover User?     @relation("MemoApprover", fields: [currentApproverId], references: [id])
  comments        Comment[] @relation("MemoComments")

  @@index([currentApproverId], name: "idx_memo_currentApprover")
  @@index([currentApproverId, status], name: "idx_memo_currentApprover_status")
  @@index([createdBy], name: "idx_memo_createdBy")
  @@index([aiClassification], name: "idx_memo_aiClassification")
  @@index([aiProcessedAt], name: "idx_memo_aiProcessedAt")
}
```

## Service Functions

### geminiService.ts

```typescript
// Analyze a single document
const result = await analyzeDocument(content);
// Returns: DocumentClassificationResult | DocumentAnalysisError

// Check service availability
const available = isAIServiceAvailable();

// Get service status
const status = getAIServiceStatus();
// { enabled: true, configured: true, model: "gemini-1.5-flash" }

// Batch analysis
const results = await analyzeDocumentBatch([
  { id: '123', content: 'Memo content...' },
  { id: '456', content: 'Invoice content...' },
]);
// Returns: Map<id, result>
```

### aiAnalysisService.ts

```typescript
// Process single memo with AI
const result = await processMemoWithAI(memoId);
// { success: true, message: "...", analysis: {...} }

// Queue memo asynchronously (non-blocking)
queueMemoForAIProcessing(memoId);

// Get memos needing processing
const pending = await getMemosNeedingAIProcessing(50);

// Get memos by classification
const invoices = await getMemosByClassification('INVOICE', 100);

// Get usage stats
const stats = getAIUsageStats();

// Batch reprocessing
const results = await reprocessMemosWithAI([memoId1, memoId2]);
// { processed: 2, successful: 2, failed: 0 }

// Clear AI data (for fresh analysis)
await clearAIDataForMemo(memoId);
```

## Configuration Options

### Environment Variables

```bash
# Core
GEMINI_API_KEY=your-key              # Required for AI
ENABLE_AI_PROCESSING=true             # Enable/disable feature

# Optional Model Override
AI_MODEL=gemini-1.5-flash            # Default model
# Alternatives:
# AI_MODEL=gemini-1.5-pro              # More capable, slower
# AI_MODEL=gemini-1.0-pro              # Legacy, cheaper
```

## Performance Tuning

### For Cost Optimization

```bash
# Use flash model (cheaper, faster)
AI_MODEL=gemini-1.5-flash

# Disable AI in development
ENABLE_AI_PROCESSING=false
```

### For Accuracy

```bash
# Use pro model for critical docs
AI_MODEL=gemini-1.5-pro

# Reprocess batches with stricter filtering
# Get only high-value memos for re-analysis
```

## Monitoring & Debugging

### Check AI Status

```bash
curl http://localhost:4000/ai/status
```

Response shows:
- Service availability
- API configuration status
- Current usage statistics
- Average processing times

### View Usage Metrics

```bash
curl http://localhost:4000/ai/usage-stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

Shows:
- Total requests
- Success rate
- Token usage (for billing)
- Performance metrics

### Monitor Logs

```bash
# Watch for AI processing logs
tail -f logs/app.log | grep "\[AI\]"

# Look for classification logs
tail -f logs/app.log | grep "\[AI_ANALYSIS\]"
```

## Troubleshooting

### AI Processing Not Starting

**Check 1: API Key**
```bash
grep GEMINI_API_KEY .env
# Should output: GEMINI_API_KEY=ak-xxx...
```

**Check 2: Service Status**
```bash
curl http://localhost:4000/ai/status
# "available" should be true
```

**Check 3: Enable Flag**
```bash
grep ENABLE_AI_PROCESSING .env
# Should be: ENABLE_AI_PROCESSING=true
```

**Check 4: Server Logs**
```bash
npm run dev 2>&1 | grep -i "ai"
# Should show: "[AI] Gemini client initialized"
```

### Slow Processing

**Cause 1: Large Documents**
- Documents over 50KB take longer
- Solution: Summarize before submission

**Cause 2: Rate Limiting**
- Batch reprocessing may hit API limits
- Solution: Add delays between requests

**Cause 3: Network**
- Check internet connectivity
- Try again after a few seconds

### Low Confidence Scores

Typical causes:
- Document doesn't fit standard categories
- Mixed-content documents
- Very short or ambiguous text

**Solution:**
- Review 'OTHER' classification
- Reprocess with clearer content
- Consider custom categories

## Testing

### Unit Test Example

```typescript
import { analyzeDocument } from '../services/geminiService';

describe('Document Analysis', () => {
  it('should classify a memo', async () => {
    const result = await analyzeDocument(
      'Title: Q1 Budget\n\nContent: We are reviewing Q1 spending...'
    );

    expect(result).toHaveProperty('classification');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('confidence');
    expect(result.classification).toBe('MEMO');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should handle errors gracefully', async () => {
    const result = await analyzeDocument('');
    expect(result).toHaveProperty('error', true);
  });
});
```

### Integration Test Example

```typescript
describe('AI Processing Flow', () => {
  it('should process memo after creation', async () => {
    // Create memo
    const memo = await submitMemo(userId, {
      title: 'Test Memo',
      content: 'This is a test memo for classification',
    });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 5000));

    // Verify AI fields populated
    const updated = await getMemoById(memo.id);
    expect(updated.aiClassification).toBe('MEMO');
    expect(updated.aiSummary).toBeTruthy();
    expect(updated.aiConfidence).toBeGreaterThan(0);
  });
});
```

## Cost Estimation

### Pricing

Google Gemini API pricing (subject to change):
- Input: ~$0.075 per 1M tokens
- Output: ~$0.3 per 1M tokens

### Example Costs

```
Average memo: ~2,000 tokens
Processing: ~$0.00015 per memo

1,000 memos/month: ~$0.15
10,000 memos/month: ~$1.50
100,000 memos/month: ~$15
```

### Optimize Costs

1. Use `gemini-1.5-flash` (cheaper)
2. Limit document size
3. Batch process during off-hours
4. Cache results (don't reprocess unnecessarily)

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure GEMINI_API_KEY
3. ✅ Run migration
4. ✅ Test with sample memo
5. ⏭️ Build dashboard UI
6. ⏭️ Set up monitoring
7. ⏭️ Configure alerts
8. ⏭️ Plan cost management

## Support

- Check [AI_CLASSIFICATION_SYSTEM.md](./AI_CLASSIFICATION_SYSTEM.md) for full API reference
- Review logs for error details
- Test endpoints with Postman/curl
- Monitor `/ai/status` endpoint

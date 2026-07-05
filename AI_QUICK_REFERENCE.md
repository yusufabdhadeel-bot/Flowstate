# AI Classification System - Quick Reference

## 5-Minute Setup

### 1. Install Package
```bash
npm install @google/generative-ai
```

### 2. Get API Key
- Go to https://aistudio.google.com/app/apikey
- Click "Create API Key"
- Copy it

### 3. Configure
```bash
# In .env file:
GEMINI_API_KEY=your-api-key
ENABLE_AI_PROCESSING=true
```

### 4. Migrate Database
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Build & Start
```bash
npm run build
npm run dev
```

Done! ✅

## Classification Types

| Type | Use Case | Example |
|------|----------|---------|
| **MEMO** | Internal communication, announcements | Team meeting notes, policy updates |
| **INVOICE** | Bills, payment requests, receipts | Vendor invoices, expense reports |
| **REQUEST** | Action requests, approvals needed | Budget requests, leave applications |
| **PROCUREMENT** | Purchase orders, vendor quotes | Equipment orders, contract bids |
| **REPORT** | Reports, analysis documents | Performance reviews, data analysis |
| **OTHER** | Doesn't fit above categories | Miscellaneous documents |

## Quick API Reference

### Create Memo (Auto AI)
```bash
curl -X POST http://localhost:4000/memos/submit \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Quarterly Review",
    "content": "We reviewed Q1 performance metrics..."
  }'
```

Wait 3-5 seconds → AI classification automatic

### Get Memo with AI Results
```bash
curl http://localhost:4000/memos/memo-id
```

Response includes:
- `aiClassification` - MEMO|INVOICE|REQUEST|PROCUREMENT|REPORT|OTHER
- `aiSummary` - 20-30 word summary
- `aiConfidence` - 0-1 confidence score
- `aiProcessedAt` - Completion timestamp

### Check AI Status
```bash
curl http://localhost:4000/ai/status
```

### Get Dashboard
```bash
curl http://localhost:4000/ai/dashboard \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Reprocess Memo
```bash
curl -X POST http://localhost:4000/ai/reprocess/memo-id \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Batch Reprocess
```bash
curl -X POST http://localhost:4000/ai/batch-reprocess \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "memoIds": ["id1", "id2", "id3"]
  }'
```

### Get All Invoices
```bash
curl http://localhost:4000/ai/classification/INVOICE \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Get Usage Stats
```bash
curl http://localhost:4000/ai/usage-stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

## Classification Types

```
MEMO         → Internal communications
INVOICE      → Bills, expenses
REQUEST      → Approvals, time off
PROCUREMENT  → Purchase orders
REPORT       → Analysis, metrics
OTHER        → Miscellaneous
```

## Files Overview

```
src/services/
├── geminiService.ts        ← Gemini API client
└── aiAnalysisService.ts    ← Analysis logic

src/routes/
└── aiRoutes.ts             ← Admin endpoints

prisma/
└── schema.prisma           ← Database (AI fields added)
```

## Key Functions

### From memoService.ts
```typescript
// Automatically called when memo created
queueMemoForAIProcessing(memoId)
```

### From aiAnalysisService.ts
```typescript
// Manually process memo
await processMemoWithAI(memoId)

// Get usage stats
getAIUsageStats()

// Batch reprocess
await reprocessMemosWithAI([id1, id2, id3])

// Get unprocessed memos
await getMemosNeedingAIProcessing(50)

// Filter by classification
await getMemosByClassification('INVOICE')
```

### From geminiService.ts
```typescript
// Direct Gemini call
const result = await analyzeDocument(content)

// Check service
isAIServiceAvailable()
```

## Configuration Options

```bash
# Required
GEMINI_API_KEY=your-key

# Optional
ENABLE_AI_PROCESSING=true              # Default: true
# AI_MODEL=gemini-1.5-pro              # Override model
```

## Common Tasks

### Task: View memos by type
```bash
curl "http://localhost:4000/ai/classification/MEMO?limit=50" \
  -H "Authorization: Bearer TOKEN"
```

### Task: Reprocess memos with low confidence
```typescript
// Get all memos
const all = await prisma.memo.findMany({
  where: { aiConfidence: { lt: 0.7 } }
})

// Reprocess them
await reprocessMemosWithAI(all.map(m => m.id))
```

### Task: Monitor processing
```bash
# Watch logs
npm run dev 2>&1 | grep "\[AI"
```

### Task: Disable AI (development)
```bash
ENABLE_AI_PROCESSING=false npm run dev
```

## Debugging

### AI not working?
1. Check status: `curl http://localhost:4000/ai/status`
2. Verify key: `grep GEMINI_API_KEY .env`
3. Check logs: `npm run dev 2>&1 | grep AI`

### Slow processing?
- Large documents take longer
- Cloud latency affects speed
- Typical: 3-5 seconds per memo

### Low confidence?
- Document may not fit categories
- Try reprocessing clearer content
- Check 'OTHER' classification

## Performance Tips

1. **Cost Optimization**
   - Use gemini-1.5-flash (faster, cheaper)
   - Disable in development

2. **Speed Optimization**
   - Shorter documents (under 10KB)
   - Batch process off-hours

3. **Reliability**
   - Check `/ai/status` before processing
   - Implement retry logic
   - Monitor error logs

## Example Response

```json
{
  "id": "550e8400-e29b-41d4",
  "title": "Q1 Budget Review",
  "content": "...",
  "aiClassification": "MEMO",
  "aiSummary": "Comprehensive Q1 budget review with spending analysis and recommendations for Q2 planning and cost optimization",
  "aiConfidence": 0.95,
  "aiProcessedAt": "2026-05-29T10:35:22.000Z",
  "aiTokenCount": 2150,
  "aiProcessingTime": 3250
}
```

## Admin Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/ai/status` | Service health |
| GET | `/ai/usage-stats` | Metrics |
| POST | `/ai/analyze/:id` | Manual trigger |
| POST | `/ai/reprocess/:id` | Re-analyze |
| GET | `/ai/pending` | Unprocessed list |
| POST | `/ai/batch-reprocess` | Bulk process |
| GET | `/ai/classification/:type` | Filter by type |
| GET | `/ai/dashboard` | Analytics |

## Troubleshooting Table

| Problem | Check | Fix |
|---------|-------|-----|
| Service unavailable | `/ai/status` → `available: false` | Set GEMINI_API_KEY |
| No AI fields | Check `aiProcessedAt` | Wait 5 seconds |
| Slow processing | Check logs | Normal: 3-5 sec |
| Low confidence | Check classification | May need reprocessing |
| API errors | Server logs | Check network |

## Cost Calculator

```
Typical memo: ~2,000 tokens

1,000 memos    = ~$0.15
10,000 memos   = ~$1.50
100,000 memos  = ~$15.00
```

## Migration Commands

```bash
# Create migration
npm run prisma:migrate

# Deploy to prod
npm run prisma:migrate:prod

# Reset (dev only)
npx prisma migrate reset
```

## Environment Variables Checklist

```bash
✓ GEMINI_API_KEY          # Required
✓ ENABLE_AI_PROCESSING    # Optional (default: true)
✓ NODE_ENV               # Set to 'production'
✓ DATABASE_URL           # Existing
✓ JWT_SECRET             # Existing
```

## Example Dashboard Query

```typescript
const response = await fetch('/ai/dashboard', {
  headers: {
    'Authorization': `Bearer ${adminToken}`,
  },
});

const data = await response.json();

// Use data
const processingRate = data.overview.processingRate;      // "96.67%"
const avgConfidence = data.analysisQuality.averageConfidence; // 0.92
const classifications = data.classifications;             // Array
const tokenUsed = data.usage.totalTokensUsed;            // 327450
```

## Related Documentation

- **Full Guide:** [AI_CLASSIFICATION_SYSTEM.md](./AI_CLASSIFICATION_SYSTEM.md)
- **Setup Steps:** [AI_IMPLEMENTATION_GUIDE.md](./AI_IMPLEMENTATION_GUIDE.md)
- **Checklist:** [AI_IMPLEMENTATION_CHECKLIST.md](./AI_IMPLEMENTATION_CHECKLIST.md)
- **Complete Info:** [AI_COMPLETE_IMPLEMENTATION.md](./AI_COMPLETE_IMPLEMENTATION.md)

---

**Ready to Use!** ✨

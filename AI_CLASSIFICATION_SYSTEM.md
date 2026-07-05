# AI-Powered Document Classification & Summarization System

## Overview

The AI system automatically classifies and summarizes memos using Google Gemini API. It runs asynchronously after memo creation and provides intelligent document categorization with confidence scores.

## Architecture

### Components

- **Gemini Service** (`src/services/geminiService.ts`): Google Gemini API integration
- **AI Analysis Service** (`src/services/aiAnalysisService.ts`): Core analysis logic, usage tracking
- **AI Routes** (`src/routes/aiRoutes.ts`): Admin endpoints for management & dashboard
- **Memo Service** (`src/services/memoService.ts`): Integration with memo creation flow

### Prisma Schema Fields

```prisma
model Memo {
  // AI Classification Fields
  aiClassification  String?    // MEMO, INVOICE, REQUEST, PROCUREMENT, REPORT, OTHER
  aiSummary         String?    // 20-30 word summary
  aiConfidence      Float?     // 0.0 to 1.0 confidence score
  aiProcessedAt     DateTime?  // When analysis completed
  aiTokenCount      Int        // Tokens used for this analysis
  aiProcessingTime  Int        // Processing time in milliseconds
}
```

## Configuration

Add to `.env`:

```bash
# Gemini API Configuration
GEMINI_API_KEY=your-google-ai-api-key          # Required for AI processing
ENABLE_AI_PROCESSING=true                      # Enable/disable AI (default: true)

# Optional: Override default model
# AI_MODEL=gemini-1.5-pro  # Default: gemini-1.5-flash (cheaper)
```

## How It Works

### Automatic Processing

1. **Memo Created** → User submits memo via `/memos/submit`
2. **Non-blocking Queue** → AI analysis queued asynchronously
3. **User Sees** → Response immediately (doesn't wait for AI)
4. **Background Processing** → Gemini analyzes content
5. **Results Stored** → Classification, summary, confidence saved to database

### Document Analysis

**Input:** Memo title + content combined

**Output:**
```json
{
  "classification": "MEMO|INVOICE|REQUEST|PROCUREMENT|REPORT|OTHER",
  "summary": "Concise 20-30 word summary",
  "confidence": 0.92
}
```

### Valid Classifications

| Type | Description | Example |
|------|-------------|---------|
| MEMO | Internal communication/announcement | Staff updates, policy changes |
| INVOICE | Bill or payment request | Expense reports, vendor bills |
| REQUEST | Request for action/approval | Time off, resource requests |
| PROCUREMENT | Purchase-related document | Equipment orders, vendor selection |
| REPORT | Analysis/reporting document | Performance reports, analytics |
| OTHER | Doesn't fit above categories | Miscellaneous documents |

## API Endpoints

### Public Endpoints

#### GET `/ai/status`
Get AI service availability and model information.

**Response:**
```json
{
  "available": true,
  "status": {
    "enabled": true,
    "configured": true,
    "model": "gemini-1.5-flash"
  },
  "stats": {
    "totalRequests": 42,
    "successfulAnalyses": 40,
    "failedAnalyses": 2,
    "totalTokensUsed": 89450,
    "totalProcessingTime": 125000,
    "averageProcessingTime": 3125
  }
}
```

### Admin Endpoints (ADMIN role required)

#### GET `/ai/usage-stats`
Get detailed AI usage statistics.

**Response:**
```json
{
  "totalRequests": 42,
  "successfulAnalyses": 40,
  "failedAnalyses": 2,
  "totalTokensUsed": 89450,
  "totalProcessingTime": 125000,
  "averageProcessingTime": 3125
}
```

#### POST `/ai/analyze/:memoId`
Manually trigger AI analysis for a specific memo.

**Response:**
```json
{
  "success": true,
  "message": "AI analysis completed successfully",
  "analysis": {
    "classification": "MEMO",
    "summary": "Announcement regarding new company policy on remote work arrangements...",
    "confidence": 0.95,
    "tokenCount": 2150,
    "processingTime": 3250
  }
}
```

#### POST `/ai/reprocess/:memoId`
Reprocess memo (clear existing data and re-analyze).

**Response:**
```json
{
  "success": true,
  "message": "AI analysis completed successfully",
  "analysis": {
    "classification": "MEMO",
    "summary": "Updated summary after reprocessing...",
    "confidence": 0.93,
    "tokenCount": 2150,
    "processingTime": 2900
  }
}
```

#### GET `/ai/pending`
Get list of memos not yet processed by AI.

**Query Parameters:**
- `limit` (default: 50, max: 1000)

**Response:**
```json
{
  "count": 15,
  "memos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Q1 Budget Review",
      "createdAt": "2026-05-29T10:30:00Z",
      "status": "PENDING"
    }
  ]
}
```

#### POST `/ai/batch-reprocess`
Reprocess multiple memos at once.

**Request:**
```json
{
  "memoIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660f8410-f39c-42e5-b727-557766551111"
  ]
}
```

**Response:**
```json
{
  "message": "Batch reprocessing completed",
  "results": {
    "processed": 2,
    "successful": 2,
    "failed": 0
  }
}
```

#### GET `/ai/classification/:classification`
Get memos with a specific classification.

**Parameters:**
- `:classification` - One of: MEMO, INVOICE, REQUEST, PROCUREMENT, REPORT, OTHER
- `limit` (query, default: 50, max: 1000)

**Response:**
```json
{
  "classification": "MEMO",
  "count": 8,
  "memos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Q1 Budget Review",
      "aiSummary": "Announcement regarding new company policy on remote work...",
      "aiConfidence": 0.95,
      "aiProcessedAt": "2026-05-29T10:35:00Z"
    }
  ]
}
```

#### GET `/ai/dashboard`
Get comprehensive dashboard data with classification overview and analytics.

**Response:**
```json
{
  "overview": {
    "totalMemos": 150,
    "processedMemos": 145,
    "unprocessedMemos": 5,
    "processingRate": "96.67%"
  },
  "classifications": [
    { "classification": "MEMO", "count": 58 },
    { "classification": "INVOICE", "count": 22 },
    { "classification": "REQUEST", "count": 35 },
    { "classification": "PROCUREMENT", "count": 18 },
    { "classification": "REPORT", "count": 10 },
    { "classification": "OTHER", "count": 2 }
  ],
  "analysisQuality": {
    "averageConfidence": 0.924,
    "maxProcessingTime": 5234
  },
  "usage": {
    "totalRequests": 145,
    "successfulAnalyses": 143,
    "failedAnalyses": 2,
    "totalTokensUsed": 327450,
    "totalProcessingTime": 467500,
    "averageProcessingTime": 3268
  }
}
```

## Example Logs

### Successful Memo Creation with AI Processing

```
[REMINDER] Email reminder queued for manager@example.com
[AI_ANALYSIS] Starting AI processing for memo 550e8400-e29b-41d4
[AI] Starting document analysis for content of 1250 characters
[AI] Received response from Gemini
[AI] Analysis completed: classification=MEMO, confidence=0.95, time=2850ms
[AI_ANALYSIS] Successfully analyzed memo 550e8400-e29b-41d4: classification=MEMO, confidence=0.95, time=2850ms
```

### AI Service Status

```
[AI] Gemini client initialized
[AI] AI service available
[AI] Using model: gemini-1.5-flash
```

### Batch Reprocessing

```
[AI_ANALYSIS] Starting batch reprocessing for 3 memos
[AI_ANALYSIS] Starting AI processing for memo 550e8400-e29b-41d4
[AI] Starting document analysis for content of 1250 characters
[AI_ANALYSIS] Successfully analyzed memo 550e8400-e29b-41d4: classification=MEMO, confidence=0.95
[AI_ANALYSIS] Starting AI processing for memo 660f8410-f39c-42e5
[AI] Starting document analysis for content of 890 characters
[AI_ANALYSIS] Successfully analyzed memo 660f8410-f39c-42e5: classification=INVOICE, confidence=0.87
[AI_ANALYSIS] Batch reprocessing completed: processed=2, successful=2, failed=0
```

### Error Handling

```
[AI_ANALYSIS] Failed to analyze memo 550e8400-e29b-41d4: Connection timeout
[AI_ANALYSIS] Processing error: Failed to parse AI response
[AI] Gemini API not configured. AI processing will be disabled.
```

## Dashboard Integration Examples

### React/TypeScript Dashboard Component

```typescript
import { useState, useEffect } from 'react';

interface DashboardData {
  overview: {
    totalMemos: number;
    processedMemos: number;
    unprocessedMemos: number;
    processingRate: string;
  };
  classifications: Array<{
    classification: string;
    count: number;
  }>;
  analysisQuality: {
    averageConfidence: number;
    maxProcessingTime: number;
  };
  usage: {
    totalRequests: number;
    successfulAnalyses: number;
    averageProcessingTime: number;
  };
}

export function AIDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchDashboard() {
    try {
      const response = await fetch('/ai/dashboard', {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      setData(data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Failed to load dashboard</div>;

  return (
    <div className="ai-dashboard">
      <h1>AI Classification Dashboard</h1>

      {/* Overview Cards */}
      <div className="overview-cards">
        <Card
          title="Processing Rate"
          value={data.overview.processingRate}
          subtext={`${data.overview.processedMemos}/${data.overview.totalMemos} memos`}
        />
        <Card
          title="Avg Confidence"
          value={`${(data.analysisQuality.averageConfidence * 100).toFixed(1)}%`}
          color="green"
        />
        <Card
          title="Avg Processing Time"
          value={`${data.usage.averageProcessingTime.toFixed(0)}ms`}
          color="blue"
        />
      </div>

      {/* Classification Distribution */}
      <div className="classification-chart">
        <h2>Classification Distribution</h2>
        <BarChart
          data={data.classifications}
          xKey="classification"
          yKey="count"
        />
      </div>

      {/* Classification Table */}
      <table className="classification-table">
        <thead>
          <tr>
            <th>Classification</th>
            <th>Count</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          {data.classifications.map((item) => (
            <tr key={item.classification}>
              <td>{item.classification}</td>
              <td>{item.count}</td>
              <td>
                {(
                  (item.count / data.overview.processedMemos) * 100
                ).toFixed(1)}
                %
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Usage Stats */}
      <div className="usage-stats">
        <h2>Usage Statistics</h2>
        <p>Total Requests: {data.usage.totalRequests}</p>
        <p>Successful: {data.usage.successfulAnalyses}</p>
        <p>Success Rate: {((data.usage.successfulAnalyses / data.usage.totalRequests) * 100).toFixed(1)}%</p>
      </div>

      {/* Unprocessed Memos Alert */}
      {data.overview.unprocessedMemos > 0 && (
        <div className="alert-info">
          {data.overview.unprocessedMemos} memos pending AI processing.
          <button onClick={triggerBatchProcessing}>Process Now</button>
        </div>
      )}
    </div>
  );
}

// Placeholder components
function Card({ title, value, subtext, color = 'gray' }) {
  return (
    <div className={`card card-${color}`}>
      <h3>{title}</h3>
      <p className="value">{value}</p>
      {subtext && <p className="subtext">{subtext}</p>}
    </div>
  );
}

function BarChart({ data, xKey, yKey }) {
  // Implementation omitted - use any charting library (recharts, Chart.js, etc.)
  return <div>Chart</div>;
}
```

### HTML Dashboard Example

```html
<div class="ai-dashboard">
  <h1>AI Classification Dashboard</h1>

  <div class="dashboard-grid">
    <!-- Processing Rate Card -->
    <div class="card">
      <h3>Processing Rate</h3>
      <div class="metric">145 / 150</div>
      <div class="percentage">96.67%</div>
    </div>

    <!-- Average Confidence Card -->
    <div class="card highlight">
      <h3>Avg Confidence Score</h3>
      <div class="metric">0.924</div>
      <div class="percentage">92.4%</div>
    </div>

    <!-- Processing Time Card -->
    <div class="card">
      <h3>Avg Processing Time</h3>
      <div class="metric">3,268ms</div>
      <div class="subtext">Per memo</div>
    </div>
  </div>

  <!-- Classification Breakdown -->
  <section class="classifications">
    <h2>Classification Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Classification</th>
          <th>Count</th>
          <th>Percentage</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>MEMO</td>
          <td>58</td>
          <td>40.0%</td>
          <td><a href="/ai/classification/MEMO">View</a></td>
        </tr>
        <tr>
          <td>INVOICE</td>
          <td>22</td>
          <td>15.2%</td>
          <td><a href="/ai/classification/INVOICE">View</a></td>
        </tr>
        <tr>
          <td>REQUEST</td>
          <td>35</td>
          <td>24.1%</td>
          <td><a href="/ai/classification/REQUEST">View</a></td>
        </tr>
        <tr>
          <td>PROCUREMENT</td>
          <td>18</td>
          <td>12.4%</td>
          <td><a href="/ai/classification/PROCUREMENT">View</a></td>
        </tr>
        <tr>
          <td>REPORT</td>
          <td>10</td>
          <td>6.9%</td>
          <td><a href="/ai/classification/REPORT">View</a></td>
        </tr>
        <tr>
          <td>OTHER</td>
          <td>2</td>
          <td>1.4%</td>
          <td><a href="/ai/classification/OTHER">View</a></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- Pending Processing Alert -->
  <section class="pending-memos">
    <h2>Pending AI Processing</h2>
    <div class="alert alert-info">
      <strong>5 memos</strong> awaiting AI classification.
      <button class="btn btn-primary" onclick="triggerBatchProcessing()">
        Process Now
      </button>
    </div>
  </section>
</div>
```

## Testing & Usage

### Manual Trigger

```bash
# Trigger analysis for specific memo
curl -X POST http://localhost:4000/ai/analyze/550e8400-e29b-41d4 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get Pending Memos

```bash
curl http://localhost:4000/ai/pending?limit=50 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Reprocess Multiple Memos

```bash
curl -X POST http://localhost:4000/ai/batch-reprocess \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "memoIds": [
      "550e8400-e29b-41d4",
      "660f8410-f39c-42e5"
    ]
  }'
```

### Disable AI for Development

```bash
ENABLE_AI_PROCESSING=false npm run dev
```

## Error Handling Strategy

✅ **AI failures don't break memo creation**
- Memo saved successfully regardless of AI processing
- Failed analyses logged, user notified via dashboard
- Retries possible via reprocess endpoints

✅ **Graceful degradation**
- If API not configured → AI disabled, memos processed normally
- If request fails → Error logged, memo continues
- If parsing fails → Defaults to 'OTHER' classification

✅ **Rate limiting**
- Batch processing includes delays between requests
- Prevents hitting Gemini API rate limits

## Performance Notes

- **Non-blocking:** User gets response before AI completes
- **Async Processing:** Runs in background after memo creation
- **Batch Support:** Process up to 100 memos at once
- **Token Tracking:** Monitor API usage and costs
- **Processing Time:** Average 3-4 seconds per memo

## Future Enhancements

- Custom classification categories per organization
- Fine-tuned model training on organization documents
- Integration with document workflow automation
- Export analysis results to external systems
- Advanced filtering by confidence thresholds
- Scheduled batch processing jobs
- AI-powered routing based on classification

## Troubleshooting

### AI Processing Not Happening
1. Check `ENABLE_AI_PROCESSING` is `true`
2. Verify `GEMINI_API_KEY` is set
3. Check server logs for API errors
4. Visit `/ai/status` to verify service

### High Processing Times
1. Large documents (>50KB) take longer
2. API rate limiting may cause delays
3. Check network connectivity
4. Consider using `-flash` model for speed

### Low Confidence Scores
1. Document may not fit standard categories
2. Ambiguous or mixed-content documents
3. Consider reprocessing with clearer content
4. Review 'OTHER' classification for edge cases

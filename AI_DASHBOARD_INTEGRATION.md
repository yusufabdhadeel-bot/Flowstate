# AI-Powered Document Classification & Summarization - Dashboard Integration Guide

## Overview

The system automatically classifies and summarizes all memos using Google Gemini API. This guide shows how to integrate the AI classification results into your dashboard.

## System Architecture

### Components
- **Gemini Service** (`src/services/geminiService.ts`): Calls Google Gemini API
- **AI Analysis Service** (`src/services/aiAnalysisService.ts`): Processes memos, tracks usage
- **AI Routes** (`src/routes/aiRoutes.ts`): Admin endpoints for queries & management
- **Memo Service** (`src/services/memoService.ts`): Queues AI analysis after creation

### Data Flow
```
User Creates Memo
    ↓
Memo Saved to DB
    ↓
queueMemoForAIProcessing() called (async)
    ↓
Gemini API analyzes content
    ↓
Results stored in DB (aiClassification, aiSummary, aiConfidence, aiProcessedAt)
    ↓
Dashboard displays AI insights
```

## Environment Configuration

Add to `.env`:
```bash
# Gemini API Configuration
GEMINI_API_KEY=your-api-key-here
ENABLE_AI_PROCESSING=true

# Optional: Adjust model if needed (default: gemini-1.5-flash)
AI_MODEL=gemini-1.5-flash
```

## Database Schema

AI fields added to Memo model:
```prisma
model Memo {
  // ... existing fields ...
  
  aiClassification  String?    // MEMO, INVOICE, REQUEST, PROCUREMENT, REPORT, OTHER
  aiSummary         String?    @db.Text  // 20-30 word summary
  aiConfidence      Float?     // 0.0 to 1.0
  aiProcessedAt     DateTime?  // When AI analysis was completed
  aiTokenCount      Int        @default(0)  // Tokens used
  aiProcessingTime  Int        @default(0)  // Milliseconds
}
```

## API Endpoints

### 1. Get AI Service Status
**GET** `/ai/status`

```bash
curl http://localhost:4000/ai/status
```

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
    "totalTokensUsed": 8500,
    "totalProcessingTime": 12000,
    "averageProcessingTime": 300
  }
}
```

### 2. Get Dashboard Overview (Admin)
**GET** `/ai/dashboard`

Requires: `Authorization: Bearer <token>` with Admin role

```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/ai/dashboard
```

**Response:**
```json
{
  "overview": {
    "totalMemos": 150,
    "processedMemos": 148,
    "unprocessedMemos": 2,
    "processingRate": "98.67%"
  },
  "classifications": [
    { "classification": "MEMO", "count": 62 },
    { "classification": "REQUEST", "count": 45 },
    { "classification": "REPORT", "count": 28 },
    { "classification": "INVOICE", "count": 10 },
    { "classification": "PROCUREMENT", "count": 2 },
    { "classification": "OTHER", "count": 1 }
  ],
  "analysisQuality": {
    "averageConfidence": 0.87,
    "maxProcessingTime": 2500
  },
  "usage": {
    "totalRequests": 148,
    "successfulAnalyses": 148,
    "failedAnalyses": 0,
    "totalTokensUsed": 45000,
    "totalProcessingTime": 42000,
    "averageProcessingTime": 284
  }
}
```

### 3. Get Memos by Classification (Admin)
**GET** `/ai/classification/:classification?limit=50`

Supported classifications: `MEMO`, `INVOICE`, `REQUEST`, `PROCUREMENT`, `REPORT`, `OTHER`

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:4000/ai/classification/INVOICE?limit=20"
```

**Response:**
```json
{
  "classification": "INVOICE",
  "count": 10,
  "memos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Q3 Software License Invoice",
      "aiSummary": "Billing for annual software licenses totaling $5,000 due September 30.",
      "aiConfidence": 0.94,
      "aiProcessedAt": "2026-06-05T10:30:00Z"
    }
  ]
}
```

### 4. Get Pending Analysis (Admin)
**GET** `/ai/pending?limit=50`

```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/ai/pending
```

**Response:**
```json
{
  "count": 2,
  "memos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "New Client Onboarding Request",
      "createdAt": "2026-06-05T14:22:00Z",
      "status": "PENDING"
    }
  ]
}
```

### 5. Manually Reprocess Memo (Admin)
**POST** `/ai/reprocess/:memoId`

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:4000/ai/reprocess/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "success": true,
  "message": "AI analysis completed successfully",
  "analysis": {
    "classification": "MEMO",
    "summary": "Team meeting notes discussing Q3 goals and project timeline.",
    "confidence": 0.89,
    "tokenCount": 1200,
    "processingTime": 450
  }
}
```

### 6. Batch Reprocess (Admin)
**POST** `/ai/batch-reprocess`

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"memoIds": ["id1", "id2", "id3"]}' \
  http://localhost:4000/ai/batch-reprocess
```

**Response:**
```json
{
  "message": "Batch reprocessing completed",
  "results": {
    "processed": 3,
    "successful": 3,
    "failed": 0
  }
}
```

### 7. Get AI Usage Stats (Admin)
**GET** `/ai/usage-stats`

```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/ai/usage-stats
```

## Frontend Integration Examples

### React Component: Classification Badge

```typescript
interface MemoClassification {
  classification: string;
  confidence: number;
}

export const ClassificationBadge: React.FC<MemoClassification> = ({
  classification,
  confidence,
}) => {
  const getColor = (classification: string) => {
    const colors: Record<string, string> = {
      MEMO: 'bg-blue-100 text-blue-800',
      INVOICE: 'bg-red-100 text-red-800',
      REQUEST: 'bg-yellow-100 text-yellow-800',
      PROCUREMENT: 'bg-purple-100 text-purple-800',
      REPORT: 'bg-green-100 text-green-800',
      OTHER: 'bg-gray-100 text-gray-800',
    };
    return colors[classification] || colors.OTHER;
  };

  const confidencePercent = Math.round(confidence * 100);

  return (
    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getColor(classification)}`}>
      {classification}
      <span className="ml-2 text-xs opacity-75">
        {confidencePercent}% confident
      </span>
    </div>
  );
};
```

### React Component: Dashboard Overview

```typescript
import { useEffect, useState } from 'react';

interface DashboardData {
  overview: {
    totalMemos: number;
    processedMemos: number;
    unprocessedMemos: number;
    processingRate: string;
  };
  classifications: Array<{ classification: string; count: number }>;
  analysisQuality: {
    averageConfidence: number;
    maxProcessingTime: number;
  };
  usage: {
    totalRequests: number;
    totalTokensUsed: number;
    averageProcessingTime: number;
  };
}

export const AIDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await fetch('/ai/dashboard', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Failed to load AI dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Failed to load dashboard</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-gray-600 text-sm">Total Memos</p>
          <p className="text-2xl font-bold">{data.overview.totalMemos}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-gray-600 text-sm">Processed</p>
          <p className="text-2xl font-bold">{data.overview.processedMemos}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-gray-600 text-sm">Avg Confidence</p>
          <p className="text-2xl font-bold">
            {Math.round(data.analysisQuality.averageConfidence * 100)}%
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-gray-600 text-sm">Processing Rate</p>
          <p className="text-2xl font-bold">{data.overview.processingRate}</p>
        </div>
      </div>

      {/* Classification Pie Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Memo Classifications</h3>
        <div className="space-y-2">
          {data.classifications.map((item) => (
            <div key={item.classification} className="flex items-center">
              <span className="w-32">{item.classification}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-6">
                <div
                  className="bg-blue-500 h-6 rounded-full flex items-center justify-center text-white text-sm"
                  style={{
                    width: `${(item.count / data.overview.totalMemos) * 100}%`,
                  }}
                >
                  {item.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">API Usage</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-gray-600 text-sm">Total Requests</p>
            <p className="text-xl font-bold">{data.usage.totalRequests}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Tokens Used</p>
            <p className="text-xl font-bold">{data.usage.totalTokensUsed}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Avg Time</p>
            <p className="text-xl font-bold">{data.usage.averageProcessingTime}ms</p>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### React Component: Memo Card with AI Classification

```typescript
interface MemoCardProps {
  id: string;
  title: string;
  content: string;
  creator: { name: string };
  aiClassification?: string;
  aiSummary?: string;
  aiConfidence?: number;
  aiProcessedAt?: Date;
}

export const MemoCard: React.FC<MemoCardProps> = ({
  title,
  creator,
  aiClassification,
  aiSummary,
  aiConfidence,
  aiProcessedAt,
}) => {
  const isProcessing = !aiProcessedAt;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {isProcessing ? (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
            🔄 Processing...
          </span>
        ) : (
          aiClassification && (
            <ClassificationBadge
              classification={aiClassification}
              confidence={aiConfidence || 0}
            />
          )
        )}
      </div>

      <p className="text-gray-600 text-sm mb-2">From: {creator.name}</p>

      {aiSummary && (
        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
          <p className="text-sm text-gray-700">
            <strong>AI Summary:</strong> {aiSummary}
          </p>
        </div>
      )}

      {!isProcessing && aiProcessedAt && (
        <p className="text-xs text-gray-400 mt-4">
          Analyzed {new Date(aiProcessedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};
```

### Vue Component: Classification Display

```vue
<template>
  <div class="memo-card">
    <div class="header">
      <h3>{{ memo.title }}</h3>
      <div v-if="memo.aiProcessedAt" class="classification">
        <span :class="classificationClass">
          {{ memo.aiClassification }}
        </span>
        <span class="confidence">
          {{ Math.round(memo.aiConfidence * 100) }}%
        </span>
      </div>
      <div v-else class="loading">
        🔄 AI is analyzing...
      </div>
    </div>
    
    <div v-if="memo.aiSummary" class="ai-summary">
      <strong>Summary:</strong> {{ memo.aiSummary }}
    </div>
  </div>
</template>

<script>
export default {
  props: {
    memo: Object,
  },
  computed: {
    classificationClass() {
      return `badge badge-${this.memo.aiClassification?.toLowerCase()}`;
    },
  },
};
</script>

<style scoped>
.memo-card { background: white; padding: 1rem; border-radius: 8px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.classification { display: flex; gap: 0.5rem; align-items: center; }
.badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.875rem; }
.badge-memo { background: #dbeafe; color: #1e40af; }
.badge-invoice { background: #fee2e2; color: #991b1b; }
.badge-request { background: #fef3c7; color: #92400e; }
</style>
```

## Logging Examples

When system processes a memo:
```
[CRON] Reminder scheduler started with schedule "0 0 * * *"
[REMINDER] Starting reminder job (every 24 hour(s))
[AI] Starting document analysis for content of 512 characters
[AI] Received response from Gemini
[AI] Analysis completed: classification=MEMO, confidence=0.89, time=450ms
[AI_ANALYSIS] Successfully analyzed memo 550e8400-e29b-41d4-a716-446655440000
```

## Performance & Cost Considerations

- **Average processing time**: 200-500ms per memo
- **Token usage**: ~1 token per 4 characters
- **Cost**: Gemini Flash is very cost-effective (~$0.075 per million input tokens)
- **Batch operations**: 500ms delay between requests to avoid rate limiting
- **Caching**: Results cached in database; no re-analysis on read

## Troubleshooting

### AI Processing Disabled
```bash
# Check if enabled
curl http://localhost:4000/ai/status

# Enable in .env
ENABLE_AI_PROCESSING=true
```

### API Key Invalid
```bash
# Verify key in logs
tail -f logs.txt | grep GEMINI

# Update .env with valid key
GEMINI_API_KEY=your-valid-key
```

### Stuck Processing
```bash
# Reprocess specific memo
curl -X POST http://localhost:4000/ai/reprocess/memo-id \
  -H "Authorization: Bearer token"

# Batch reprocess all pending
curl -X POST http://localhost:4000/ai/batch-reprocess \
  -H "Authorization: Bearer token" \
  -d '{"memoIds": ["id1", "id2"]}'
```

## Optional Enhancements

1. **Email Digests**: Send classification summaries to admins daily
2. **Auto-Routing**: Route invoices to finance, requests to approvers based on classification
3. **Full-Text Search**: Index summaries for better search
4. **ML Training**: Use high-confidence classifications to train custom model
5. **Alerts**: Alert when high-value invoices detected

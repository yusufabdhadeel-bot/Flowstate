import { prisma } from '../prismaClient';
import { analyzeDocument, type DocumentClassificationResult, type DocumentAnalysisError } from './geminiService';
import type { Memo } from '@prisma/client';

// ============================================================
// AI Usage Tracking
// ============================================================

export interface AIUsageStats {
  totalRequests: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  totalTokensUsed: number;
  totalProcessingTime: number; // milliseconds
  averageProcessingTime: number; // milliseconds
}

const aiUsageStats: AIUsageStats = {
  totalRequests: 0,
  successfulAnalyses: 0,
  failedAnalyses: 0,
  totalTokensUsed: 0,
  totalProcessingTime: 0,
  averageProcessingTime: 0,
};

export function getAIUsageStats(): AIUsageStats {
  return {
    ...aiUsageStats,
    averageProcessingTime:
      aiUsageStats.successfulAnalyses > 0
        ? aiUsageStats.totalProcessingTime / aiUsageStats.successfulAnalyses
        : 0,
  };
}

// ============================================================
// Process Memo with AI Analysis
// ============================================================

export async function processMemoWithAI(memoId: string): Promise<{
  success: boolean;
  message: string;
  analysis?: DocumentClassificationResult & { processingTime: number };
}> {
  try {
    console.log(`[AI_ANALYSIS] Starting AI processing for memo ${memoId}`);

    // Fetch the memo
    const memo = await prisma.memo.findUnique({
      where: { id: memoId },
      select: {
        id: true,
        title: true,
        content: true,
        aiProcessedAt: true,
      },
    });

    if (!memo) {
      console.error(`[AI_ANALYSIS] Memo ${memoId} not found`);
      return {
        success: false,
        message: 'Memo not found',
      };
    }

    // Skip if already processed (for normal flow, not re-processing)
    if (memo.aiProcessedAt && !memo.aiProcessedAt) {
      console.log(`[AI_ANALYSIS] Memo ${memoId} already processed, skipping`);
      return {
        success: false,
        message: 'Memo already processed',
      };
    }

    // Combine title and content for analysis
    const documentContent = `Title: ${memo.title}\n\nContent: ${memo.content}`;

    // Call Gemini API
    aiUsageStats.totalRequests++;
    const result = await analyzeDocument(documentContent);

    // Handle API error
    if ('error' in result && result.error) {
      aiUsageStats.failedAnalyses++;
      console.error(`[AI_ANALYSIS] Failed to analyze memo ${memoId}: ${result.message}`);
      return {
        success: false,
        message: result.message,
      };
    }

    // Type guard to access DocumentClassificationResult fields
    const analysisResult = result as DocumentClassificationResult;

    // Update memo with AI results
    const updatedMemo = await prisma.memo.update({
      where: { id: memoId },
      data: {
        aiClassification: analysisResult.classification,
        aiSummary: analysisResult.summary,
        aiConfidence: analysisResult.confidence,
        aiProcessedAt: new Date(),
        aiTokenCount: analysisResult.tokenCount,
        aiProcessingTime: analysisResult.processingTime,
      },
      select: {
        id: true,
        title: true,
        aiClassification: true,
        aiSummary: true,
        aiConfidence: true,
        aiProcessingTime: true,
      },
    });

    // Update usage stats
    aiUsageStats.successfulAnalyses++;
    aiUsageStats.totalTokensUsed += analysisResult.tokenCount;
    aiUsageStats.totalProcessingTime += analysisResult.processingTime;

    console.log(
      `[AI_ANALYSIS] Successfully analyzed memo ${memoId}: ` +
      `classification=${updatedMemo.aiClassification}, ` +
      `confidence=${updatedMemo.aiConfidence}, ` +
      `time=${updatedMemo.aiProcessingTime}ms`
    );

    return {
      success: true,
      message: 'AI analysis completed successfully',
      analysis: {
        classification: updatedMemo.aiClassification || 'OTHER',
        summary: updatedMemo.aiSummary || '',
        confidence: updatedMemo.aiConfidence || 0,
        tokenCount: analysisResult.tokenCount,
        processingTime: updatedMemo.aiProcessingTime,
      },
    };
  } catch (error) {
    aiUsageStats.failedAnalyses++;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(
      `[AI_ANALYSIS] Error processing memo ${memoId}: ${errorMessage}`
    );

    return {
      success: false,
      message: `Processing error: ${errorMessage}`,
    };
  }
}

// ============================================================
// Queue AI Processing (Async, Non-blocking)
// ============================================================

/**
 * Queue memo for AI processing without blocking the response
 * Used after memo creation to enable async analysis
 */
export function queueMemoForAIProcessing(memoId: string): void {
  // Fire and forget - don't await
  void (async () => {
    try {
      // Small delay to ensure memo is fully committed
      await new Promise((resolve) => setTimeout(resolve, 100));
      await processMemoWithAI(memoId);
    } catch (error) {
      console.error(
        `[AI_ANALYSIS] Failed to process queued memo ${memoId}: ` +
        (error instanceof Error ? error.message : String(error))
      );
    }
  })();
}

// ============================================================
// Batch Reprocessing
// ============================================================

export async function reprocessMemosWithAI(memoIds: string[]): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  console.log(`[AI_ANALYSIS] Starting batch reprocessing for ${memoIds.length} memos`);

  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
  };

  for (const memoId of memoIds) {
    results.processed++;

    try {
      const result = await processMemoWithAI(memoId);
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      console.error(`[AI_ANALYSIS] Error reprocessing memo ${memoId}`);
    }

    // Delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(
    `[AI_ANALYSIS] Batch reprocessing completed: ` +
    `processed=${results.processed}, successful=${results.successful}, failed=${results.failed}`
  );

  return results;
}

// ============================================================
// Get Memos Needing AI Processing
// ============================================================

export async function getMemosNeedingAIProcessing(limit: number = 50): Promise<Memo[]> {
  return prisma.memo.findMany({
    where: {
      aiProcessedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ============================================================
// Get Memos by Classification
// ============================================================

export async function getMemosByClassification(classification: string, limit: number = 50): Promise<Memo[]> {
  return prisma.memo.findMany({
    where: {
      aiClassification: classification,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ============================================================
// Clear AI Data (for reprocessing)
// ============================================================

export async function clearAIDataForMemo(memoId: string): Promise<void> {
  await prisma.memo.update({
    where: { id: memoId },
    data: {
      aiClassification: null,
      aiSummary: null,
      aiConfidence: null,
      aiProcessedAt: null,
      aiTokenCount: 0,
      aiProcessingTime: 0,
    },
  });

  console.log(`[AI_ANALYSIS] Cleared AI data for memo ${memoId}`);
}

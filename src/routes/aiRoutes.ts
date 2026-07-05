import { Router } from 'express';
import { ValidationError, ForbiddenError, NotFoundError } from '../errors';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import {
  processMemoWithAI,
  queueMemoForAIProcessing,
  reprocessMemosWithAI,
  getMemosNeedingAIProcessing,
  getMemosByClassification,
  getAIUsageStats,
  clearAIDataForMemo,
} from '../services/aiAnalysisService';
import { isAIServiceAvailable, getAIServiceStatus } from '../services/geminiService';
import { prisma } from '../prismaClient';

const router = Router();

// ============================================================
// AI Service Status Endpoints
// ============================================================

/**
 * GET /ai/status
 * Get AI service availability and configuration status
 * Public endpoint
 */
router.get('/status', (req, res) => {
  const available = isAIServiceAvailable();
  const status = getAIServiceStatus();
  const stats = getAIUsageStats();

  res.json({
    available,
    status,
    stats,
  });
});

/**
 * GET /ai/usage-stats
 * Get AI usage statistics
 * Admin only
 */
router.get('/usage-stats', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access AI usage statistics');
    }

    const stats = getAIUsageStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Memo Analysis Endpoints
// ============================================================

/**
 * POST /ai/analyze/:memoId
 * Manually trigger AI analysis for a specific memo
 * Admin only
 */
router.post('/analyze/:memoId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can trigger manual AI analysis');
    }

    const memoId = req.params.memoId;

    if (!memoId) {
      throw new ValidationError('Memo ID is required');
    }

    // Verify memo exists
    const memo = await prisma.memo.findUnique({
      where: { id: memoId },
      select: { id: true, title: true, aiClassification: true, aiSummary: true },
    });

    if (!memo) {
      throw new NotFoundError(`Memo with id=${memoId} not found`);
    }

    console.log(`[AI_ROUTES] Manual analysis triggered for memo ${memoId}`);

    const result = await processMemoWithAI(memoId);

    res.json({
      success: result.success,
      message: result.message,
      analysis: result.analysis || null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ai/reprocess/:memoId
 * Reprocess memo with AI (clear existing data and re-analyze)
 * Admin only
 */
router.post('/reprocess/:memoId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can reprocess memos');
    }

    const memoId = req.params.memoId;

    if (!memoId) {
      throw new ValidationError('Memo ID is required');
    }

    // Verify memo exists
    const memo = await prisma.memo.findUnique({
      where: { id: memoId },
      select: { id: true, title: true },
    });

    if (!memo) {
      throw new NotFoundError(`Memo with id=${memoId} not found`);
    }

    console.log(`[AI_ROUTES] Reprocessing memo ${memoId}`);

    // Clear existing AI data
    await clearAIDataForMemo(memoId);

    // Re-analyze
    const result = await processMemoWithAI(memoId);

    res.json({
      success: result.success,
      message: result.message,
      analysis: result.analysis || null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ai/pending
 * Get memos that haven't been processed by AI yet
 * Admin only
 */
router.get('/pending', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access pending AI processing list');
    }

    const limit = Math.min(Number(req.query.limit ?? 50), 1000);
    const memos = await getMemosNeedingAIProcessing(limit);

    res.json({
      count: memos.length,
      memos: memos.map((memo) => ({
        id: memo.id,
        title: memo.title,
        createdAt: memo.createdAt,
        status: memo.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ai/batch-reprocess
 * Reprocess multiple memos with AI
 * Admin only
 * Body: { memoIds: string[] }
 */
router.post('/batch-reprocess', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can batch reprocess memos');
    }

    const { memoIds } = req.body;

    if (!Array.isArray(memoIds) || memoIds.length === 0) {
      throw new ValidationError('memoIds must be a non-empty array');
    }

    if (memoIds.length > 100) {
      throw new ValidationError('Cannot reprocess more than 100 memos at once');
    }

    console.log(`[AI_ROUTES] Batch reprocessing ${memoIds.length} memos`);

    const results = await reprocessMemosWithAI(memoIds);

    res.json({
      message: 'Batch reprocessing completed',
      results,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Classification Query Endpoints
// ============================================================

/**
 * GET /ai/classification/:classification
 * Get memos with a specific AI classification
 * Admin only
 * Supported: MEMO, INVOICE, REQUEST, PROCUREMENT, REPORT, OTHER
 */
router.get('/classification/:classification', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can query AI classifications');
    }

    const classification = req.params.classification?.toUpperCase();
    const validClassifications = ['MEMO', 'INVOICE', 'REQUEST', 'PROCUREMENT', 'REPORT', 'OTHER'];

    if (!validClassifications.includes(classification)) {
      throw new ValidationError(
        `Invalid classification. Must be one of: ${validClassifications.join(', ')}`
      );
    }

    const limit = Math.min(Number(req.query.limit ?? 50), 1000);
    const memos = await getMemosByClassification(classification, limit);

    res.json({
      classification,
      count: memos.length,
      memos: memos.map((memo) => ({
        id: memo.id,
        title: memo.title,
        aiSummary: memo.aiSummary,
        aiConfidence: memo.aiConfidence,
        aiProcessedAt: memo.aiProcessedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ai/dashboard
 * Get dashboard data showing AI classification overview
 * Admin only
 */
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can access AI dashboard');
    }

    // Get count of memos by classification
    const classifications = ['MEMO', 'INVOICE', 'REQUEST', 'PROCUREMENT', 'REPORT', 'OTHER'];
    const classificationCounts = await Promise.all(
      classifications.map(async (classification) => {
        const count = await prisma.memo.count({
          where: { aiClassification: classification },
        });
        return { classification, count };
      })
    );

    // Get overall stats
    const totalMemos = await prisma.memo.count();
    const processedMemos = await prisma.memo.count({
      where: { aiProcessedAt: { not: null } },
    });
    const unprocessedMemos = totalMemos - processedMemos;

    // Get average confidence
    const stats = await prisma.memo.aggregate({
      where: { aiProcessedAt: { not: null } },
      _avg: { aiConfidence: true },
      _max: { aiProcessingTime: true },
    });

    const usageStats = getAIUsageStats();

    res.json({
      overview: {
        totalMemos,
        processedMemos,
        unprocessedMemos,
        processingRate: totalMemos > 0 ? (processedMemos / totalMemos * 100).toFixed(2) + '%' : '0%',
      },
      classifications: classificationCounts,
      analysisQuality: {
        averageConfidence: stats._avg.aiConfidence || 0,
        maxProcessingTime: stats._max.aiProcessingTime || 0,
      },
      usage: usageStats,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

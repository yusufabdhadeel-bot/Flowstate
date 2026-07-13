import { Router } from 'express';
import {
  createMemo,
  getMemoById,
  getPendingMemosForUser,
  addComment,
  updateMemoStatus,
  submitMemo,
  approveMemo,
  queryMemo,
  declineMemo,
  type CreateMemoInput,
  type SubmitMemoInput,
} from '../services/memoService';import { sendWhatsAppMessage } from '../services/whatsappService';import { ValidationError, ForbiddenError, NotFoundError } from '../errors';
import { authenticateToken, type AuthRequest } from '../middleware/auth';
import { requireTenantAccess, type TenantRequest } from '../middleware/tenant';

const router = Router();

// POST /memos - Create a new memo
router.post('/', async (req, res, next) => {
  try {
    const { title, content, attachmentUrl, createdBy, organizationId }: CreateMemoInput = req.body;

    if (!title || !content || !createdBy || !organizationId) {
      throw new ValidationError('Missing required fields: title, content, createdBy, organizationId');
    }

    const memo = await createMemo({ title, content, attachmentUrl, createdBy, organizationId });
    res.status(201).json({ memo });
  } catch (error) {
    next(error);
  }
});

// POST /memos/submit - Submit a new memo (authenticated)
router.post('/submit', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { title, content, attachmentUrl }: SubmitMemoInput = req.body;

    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    const memo = await submitMemo(req.user.id, { title, content, attachmentUrl });
    res.status(201).json({ memo });
  } catch (error) {
    next(error);
  }
});

// GET /memos/pending - Get pending memos for approver
router.get('/pending', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    if (req.user.role !== 'MANAGER') {
      throw new ForbiddenError('Only managers can access pending memos');
    }

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const days = req.query.days ? Number(req.query.days) : undefined;

    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    const normalizedDays = days && Number.isInteger(days) && days > 0 ? days : undefined;

    const { memos, totalCount } = await getPendingMemosForUser(req.user.id, {
      page: normalizedPage,
      limit: normalizedLimit,
      days: normalizedDays,
    });

    res.json({
      memos,
      count: totalCount,
      page: normalizedPage,
      limit: normalizedLimit,
    });
  } catch (error) {
    next(error);
  }
});

// GET /memos/:id - Get memo by ID
router.get('/:id', authenticateToken, requireTenantAccess, async (req: TenantRequest, res, next) => {
  try {
    const memoId = req.params.id;
    const memo = await getMemoById(memoId, req.organizationId);
    res.json({ memo });
  } catch (error) {
    next(error);
  }
});

// POST /memos/:id/comments - Add comment to memo
router.post('/:id/comments', async (req, res, next) => {
  try {
    const memoId = req.params.id;
    const { userId, message } = req.body;

    if (!userId || !message) {
      throw new ValidationError('Missing required fields: userId, message');
    }

    await addComment(memoId, userId, message);
    res.status(201).json({ message: 'Comment added successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /memos/:id/status - Update memo status (optional helper)
router.put('/:id/status', async (req, res, next) => {
  try {
    const memoId = req.params.id;
    const { status } = req.body;

    if (!status) {
      throw new ValidationError('Missing required field: status');
    }

    const memo = await updateMemoStatus(memoId, status);
    res.json({ memo });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Decision Engine Routes: Approve, Query, Decline
// ============================================================

/**
 * POST /memos/:id/approve
 * Approve a memo and pass to next manager or mark as approved
 * Requires: JWT authentication, MANAGER role
 * Response: Updated memo with new status and currentApproverId
 */
router.post('/:id/approve', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    const memoId = req.params.id;

    // Call service function
    const memo = await approveMemo(req.user.id, memoId);

    res.json({
      message: 'Memo approved successfully',
      memo: {
        id: memo.id,
        status: memo.status,
        currentApproverId: memo.currentApproverId,
        updatedAt: memo.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /memos/:id/query
 * Query a memo: send back to creator with a message
 * Requires: JWT authentication, MANAGER role, non-empty message
 * Response: Updated memo with status QUERIED and currentApproverId = createdBy
 */
router.post('/:id/query', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    const memoId = req.params.id;
    const { message } = req.body;

    if (!message) {
      throw new ValidationError('Query message is required');
    }

    // Call service function
    const memo = await queryMemo(req.user.id, memoId, message);

    res.json({
      message: 'Memo queried successfully',
      memo: {
        id: memo.id,
        status: memo.status,
        currentApproverId: memo.currentApproverId,
        updatedAt: memo.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /memos/:id/decline
 * Decline a memo: reject it completely
 * Requires: JWT authentication, MANAGER role
 * Response: Updated memo with status DECLINED and currentApproverId = null
 */
router.post('/:id/decline', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    const memoId = req.params.id;

    // Call service function
    const memo = await declineMemo(req.user.id, memoId);

    res.json({
      message: 'Memo declined successfully',
      memo: {
        id: memo.id,
        status: memo.status,
        currentApproverId: memo.currentApproverId,
        updatedAt: memo.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /memos/test-whatsapp - Send a test WhatsApp message
router.post('/test-whatsapp', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('User not authenticated');
    }

    const { to, message } = req.body;
    if (!to || !message) {
      throw new ValidationError('Missing required fields: to, message');
    }

    const didSend = await sendWhatsAppMessage(to, message);
    res.json({ success: didSend, to, message });
  } catch (error) {
    next(error);
  }
});

export default router;
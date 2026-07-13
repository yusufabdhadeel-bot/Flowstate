import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { sendMemoAssignedEmail, sendMemoQueriedEmail, sendMemoApprovedEmail, sendMemoDeclinedEmail } from './emailService';
import { sendMemoAssignedWhatsApp, sendMemoQueriedWhatsApp } from './whatsappService';
import { queueMemoForAIProcessing } from './aiAnalysisService';
import type { MemoStatus, Prisma } from '@prisma/client';

export interface CreateMemoInput {
  title: string;
  content: string;
  attachmentUrl?: string;
  createdBy: string;
  organizationId: string;
}

export interface MemoWithDetails {
  id: string;
  title: string;
  content: string;
  attachmentUrl: string | null;
  status: MemoStatus;
  createdBy: string;
  currentApproverId: string | null;
  aiClassification: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiProcessedAt: Date | null;
  aiTokenCount: number;
  aiProcessingTime: number;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  currentApprover: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  comments: {
    id: string;
    message: string;
    createdAt: Date;
    user: {
      id: string;
      name: string;
    };
  }[];
}

export interface PendingMemoCreator {
  id: string;
  name: string;
  email: string;
}

export interface PendingMemoItem {
  id: string;
  title: string;
  status: MemoStatus;
  createdAt: Date;
  creator: PendingMemoCreator;
}

export interface PendingMemoList {
  memos: PendingMemoItem[];
  totalCount: number;
}

export async function getPendingMemosForUser(
  userId: string,
  options?: { page?: number; limit?: number; days?: number }
): Promise<PendingMemoList> {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(Math.max(1, options?.limit ?? 10), 100);
  const skip = (page - 1) * limit;

  const where: Prisma.MemoWhereInput = {
    currentApproverId: userId,
    status: 'PENDING',
  };

  if (typeof options?.days === 'number' && options.days > 0) {
    where.createdAt = {
      gte: new Date(Date.now() - options.days * 24 * 60 * 60 * 1000),
    };
  }

  const [totalCount, memos] = await prisma.$transaction([
    prisma.memo.count({ where }),
    prisma.memo.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { totalCount, memos };
}

export async function createMemo(data: CreateMemoInput): Promise<MemoWithDetails> {
  const { title, content, attachmentUrl, createdBy, organizationId } = data;

  // Validate creator exists
  const creator = await prisma.user.findUnique({
    where: { id: createdBy },
    select: { id: true, organizationId: true, reportsTo: true, name: true, email: true, phone: true },
  });

  if (!creator) {
    throw new NotFoundError(`User with id=${createdBy} not found`);
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError(`Organization with id=${organizationId} not found`);
  }

  if (creator.organizationId !== organizationId) {
    throw new ValidationError('Creator must belong to the provided organization');
  }

  // Check if creator has a manager
  if (!creator.reportsTo) {
    throw new ValidationError('Cannot create memo: user has no assigned manager');
  }

  // Validate manager exists
  const manager = await prisma.user.findUnique({
    where: { id: creator.reportsTo },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!manager) {
    throw new ValidationError('Cannot create memo: assigned manager does not exist');
  }

  // Create the memo
  const memo = await prisma.memo.create({
    data: {
      title,
      content,
      attachmentUrl,
      status: 'PENDING',
      createdBy,
      organizationId,
      currentApproverId: creator.reportsTo,
    },
    include: {
      creator: {
        select: { id: true, name: true, email: true, phone: true },
      },
      currentApprover: {
        select: { id: true, name: true, email: true, phone: true },
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return memo as MemoWithDetails;
}

export interface SubmitMemoInput {
  title: string;
  content: string;
  attachmentUrl?: string;
}

export async function submitMemo(userId: string, data: SubmitMemoInput): Promise<MemoWithDetails> {
  const { title, content, attachmentUrl } = data;

  // Validate input
  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();

  if (!trimmedTitle || !trimmedContent) {
    throw new ValidationError('Title and content are required and cannot be empty');
  }

  try {
    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Fetch the user (creator) from the database
      const creator = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, role: true, reportsTo: true, name: true, email: true, isActive: true },
      });

      if (!creator) {
        throw new NotFoundError(`User with id=${userId} not found`);
      }

      // Ensure user is active
      if (!creator.isActive) {
        throw new ValidationError('Cannot submit memo: user account is inactive');
      }

      // Ensure user.role === "STAFF"
      if (creator.role !== 'STAFF') {
        throw new ValidationError('Only staff users can submit memos');
      }

      // Check if user has a manager
      if (!creator.reportsTo) {
        throw new ValidationError('No manager assigned');
      }

      // Fetch the manager
      const manager = await tx.user.findUnique({
        where: { id: creator.reportsTo },
        select: { id: true, name: true, email: true, phone: true },
      });

      if (!manager) {
        throw new ValidationError('Assigned manager does not exist');
      }

      // Basic debounce: check if user submitted a memo in the last 30 seconds
      const recentMemo = await tx.memo.findFirst({
        where: {
          createdBy: userId,
          createdAt: {
            gte: new Date(Date.now() - 30000), // 30 seconds ago
          },
        },
      });

      if (recentMemo) {
        throw new ValidationError('Please wait before submitting another memo');
      }

      // Create a new memo
      const memo = await tx.memo.create({
        data: {
          title: trimmedTitle,
          content: trimmedContent,
          attachmentUrl,
          status: 'PENDING',
          createdBy: creator.id,
          organizationId: creator.organizationId,
          currentApproverId: manager.id,
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true, phone: true },
          },
          currentApprover: {
            select: { id: true, name: true, email: true, phone: true },
          },
          comments: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      // Log the submission
      console.log(`Memo submitted by ${userId} assigned to ${manager.id}`);

      return memo;
    });

    // Send email and WhatsApp to manager (non-blocking)
    if (result.currentApprover) {
      void sendMemoAssignedEmail(result.currentApprover.email, result.title);
      void sendMemoAssignedWhatsApp(result.currentApprover.phone ?? '', result.title);
    }

    // Queue AI analysis (non-blocking, async)
    queueMemoForAIProcessing(result.id);

    return result as MemoWithDetails;
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    // Wrap other errors
    throw new ValidationError('Failed to submit memo');
  }
}

export async function getMemoById(id: string, currentUserOrganizationId?: string): Promise<MemoWithDetails> {
  const memo = await prisma.memo.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, email: true, phone: true },
      },
      currentApprover: {
        select: { id: true, name: true, email: true, phone: true },
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!memo) {
    throw new NotFoundError(`Memo with id=${id} not found`);
  }

  if (currentUserOrganizationId) {
    assertSameTenant(memo.organizationId, currentUserOrganizationId);
  }

  return memo as MemoWithDetails;
}

export async function getMemosForApprover(userId: string, currentUserOrganizationId?: string): Promise<MemoWithDetails[]> {
  // Validate user exists
  const approver = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true },
  });

  if (!approver) {
    throw new NotFoundError(`User with id=${userId} not found`);
  }

  if (currentUserOrganizationId) {
    assertSameTenant(approver.organizationId, currentUserOrganizationId);
  }

  const memos = await prisma.memo.findMany({
    where: {
      currentApproverId: userId,
      status: 'PENDING',
      organizationId: currentUserOrganizationId,
    },
    include: {
      creator: {
        select: { id: true, name: true, email: true, phone: true },
      },
      currentApprover: {
        select: { id: true, name: true, email: true, phone: true },
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return memos as MemoWithDetails[];
}

export async function addComment(memoId: string, userId: string, message: string): Promise<void> {
  // Validate memo exists
  const memo = await prisma.memo.findUnique({
    where: { id: memoId },
    select: { id: true, organizationId: true },
  });

  if (!memo) {
    throw new NotFoundError(`Memo with id=${memoId} not found`);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true },
  });

  if (!user) {
    throw new NotFoundError(`User with id=${userId} not found`);
  }

  if (user.organizationId !== memo.organizationId) {
    throw new ValidationError('Comment user must belong to the same organization as the memo');
  }

  // Create comment
  await prisma.comment.create({
    data: {
      memoId,
      userId,
      organizationId: memo.organizationId,
      message,
    },
  });
}

export async function updateMemoStatus(memoId: string, newStatus: MemoStatus): Promise<MemoWithDetails> {
  // Validate memo exists
  const existingMemo = await prisma.memo.findUnique({
    where: { id: memoId },
    select: { id: true, status: true },
  });

  if (!existingMemo) {
    throw new NotFoundError(`Memo with id=${memoId} not found`);
  }

  // Update status
  const memo = await prisma.memo.update({
    where: { id: memoId },
    data: { status: newStatus },
    include: {
      creator: {
        select: { id: true, name: true, email: true },
      },
      currentApprover: {
        select: { id: true, name: true, email: true },
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return memo as MemoWithDetails;
}

// ============================================================
// Decision Engine: Approve, Query, Decline Actions
// ============================================================

/**
 * Shared validation logic for decision engine actions
 * - Fetches memo and ensures it exists
 * - Ensures memo status is PENDING
 * - Ensures current approver is the requesting user
 * - Fetches user and ensures role is MANAGER
 */
async function validateDecisionAction(
  tx: any,
  userId: string,
  memoId: string
): Promise<{ memo: any; user: any }> {
  // Fetch memo
  const memo = await tx.memo.findUnique({
    where: { id: memoId },
    select: {
      id: true,
      status: true,
      currentApproverId: true,
      createdBy: true,
    },
  });

  if (!memo) {
    throw new NotFoundError(`Memo with id=${memoId} not found`);
  }

  // Ensure memo is PENDING
  if (memo.status !== 'PENDING') {
    throw new ValidationError(`Cannot perform action on memo with status ${memo.status}. Memo must be PENDING`);
  }

  // Ensure current approver matches requesting user
  if (memo.currentApproverId !== userId) {
    throw new ForbiddenError('This memo is not assigned to you for approval');
  }

  // Fetch user and ensure role is MANAGER
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      reportsTo: true,
    },
  });

  if (!user) {
    throw new NotFoundError(`User with id=${userId} not found`);
  }

  if (user.role !== 'MANAGER') {
    throw new ForbiddenError('Only managers can approve, query, or decline memos');
  }

  return { memo, user };
}

/**
 * Approve a memo: Pass it to the next manager or mark as approved
 * - If next manager exists: Set currentApproverId and keep status PENDING
 * - If top of hierarchy: Set status to APPROVED and clear currentApproverId
 */
export async function approveMemo(userId: string, memoId: string): Promise<MemoWithDetails> {
  try {
    const { result, approverName } = await prisma.$transaction(async (tx) => {
      const { memo, user } = await validateDecisionAction(tx, userId, memoId);

      // Check if user has a next manager (reportsTo)
      let nextManager = null;
      if (user.reportsTo) {
        nextManager = await tx.user.findUnique({
          where: { id: user.reportsTo },
          select: { id: true, name: true, email: true, phone: true },
        });
      }

      let updateData: any;

      if (nextManager) {
        // Pass to next manager
        updateData = {
          status: 'PENDING',
          currentApproverId: nextManager.id,
        };
        console.log(`[${userId}] APPROVED memo [${memoId}] and passed to [${nextManager.id}]`);
      } else {
        // Top of hierarchy - approve completely
        updateData = {
          status: 'APPROVED',
          currentApproverId: null,
        };
        console.log(`[${userId}] APPROVED memo [${memoId}] - reached top of hierarchy`);
      }

      // Update memo
      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: updateData,
        include: {
          creator: {
            select: { id: true, name: true, email: true, phone: true },
          },
          currentApprover: {
            select: { id: true, name: true, email: true, phone: true },
          },
          comments: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      return { result: updatedMemo, approverName: user.name };
    });

    // Send appropriate emails (non-blocking)
    if (result.status === 'APPROVED') {
      // Memo reached top of hierarchy - notify creator
      void sendMemoApprovedEmail(result.creator.email, result.title, approverName);
    } else if (result.currentApprover) {
      // Memo passed to next manager - notify them
      void sendMemoAssignedEmail(result.currentApprover.email, result.title);
    }

    return result as MemoWithDetails;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    throw new ValidationError('Failed to approve memo');
  }
}

/**
 * Query a memo: Send it back to the creator with a comment
 * - Requires non-empty message
 * - Creates a Comment record
 * - Sets memo status to QUERIED
 * - Sets currentApproverId back to memo.createdBy
 */
export async function queryMemo(userId: string, memoId: string, message: string): Promise<MemoWithDetails> {
  try {
    // Validate message
    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      throw new ValidationError('Query message cannot be empty');
    }

    const result = await prisma.$transaction(async (tx) => {
      const { memo, user } = await validateDecisionAction(tx, userId, memoId);

      // Create comment with the query
      await tx.comment.create({
        data: {
          memoId,
          userId,
          organizationId: memo.organizationId,
          message: trimmedMessage,
        },
      });

      // Update memo: status = QUERIED, currentApproverId = creator
      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: {
          status: 'QUERIED',
          currentApproverId: memo.createdBy,
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true, phone: true },
          },
          currentApprover: {
            select: { id: true, name: true, email: true, phone: true },
          },
          comments: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      console.log(`[${userId}] QUERIED memo [${memoId}] - returned to creator [${memo.createdBy}]`);

      return updatedMemo;
    });

    // Send query email to creator (non-blocking)
    void sendMemoQueriedEmail(result.creator.email, result.title, trimmedMessage);
    void sendMemoQueriedWhatsApp(result.creator.phone ?? '', result.title, trimmedMessage);

    return result as MemoWithDetails;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    throw new ValidationError('Failed to query memo');
  }
}

/**
 * Decline a memo: Reject it completely
 * - Sets memo status to DECLINED
 * - Sets currentApproverId to null
 */
export async function declineMemo(userId: string, memoId: string): Promise<MemoWithDetails> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const { memo, user } = await validateDecisionAction(tx, userId, memoId);

      // Update memo: status = DECLINED, currentApproverId = null
      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: {
          status: 'DECLINED',
          currentApproverId: null,
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
          currentApprover: {
            select: { id: true, name: true, email: true },
          },
          comments: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      console.log(`[${userId}] DECLINED memo [${memoId}]`);

      return updatedMemo;
    });

    // Send decline email to creator (non-blocking)
    // Need to fetch the user who declined (the current approver)
    const decliningUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    void sendMemoDeclinedEmail(result.creator.email, result.title, decliningUser?.name || 'Manager');

    return result as MemoWithDetails;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ForbiddenError) {
      throw error;
    }
    throw new ValidationError('Failed to decline memo');
  }
}
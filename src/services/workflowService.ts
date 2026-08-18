import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { sendEmail } from './emailService';
import { sendWhatsAppMessage } from './whatsappService';
import type { WorkflowApproverType, WorkflowApprovalMode, WorkflowStatus, WorkflowStepStatus, Prisma } from '@prisma/client';

export interface CreateWorkflowInput {
  organizationId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  steps: Array<{
    stepOrder: number;
    stepName: string;
    approverType: WorkflowApproverType;
    roleId?: string;
    departmentId?: string;
    specificUserId?: string;
    approvalMode?: WorkflowApprovalMode;
    minimumApprovals?: number;
    allowComments?: boolean;
    requireCommentOnReject?: boolean;
    allowSkip?: boolean;
    isRequired?: boolean;
  }>;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  steps?: Array<{
    id?: string;
    stepOrder: number;
    stepName: string;
    approverType: WorkflowApproverType;
    roleId?: string;
    departmentId?: string;
    specificUserId?: string;
    approvalMode?: WorkflowApprovalMode;
    minimumApprovals?: number;
    allowComments?: boolean;
    requireCommentOnReject?: boolean;
    allowSkip?: boolean;
    isRequired?: boolean;
  }>;
}

async function assertWorkflowAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    throw new ForbiddenError('Only admins or managers can manage workflows');
  }
}

async function logWorkflowEvent(organizationId: string, userId: string, action: string, entityType: string, entityId: string, details: string, previousValues?: Record<string, unknown>, newValues?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      organizationId,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date(),
    },
  });
}

export async function createWorkflow(input: CreateWorkflowInput, userId: string) {
  await assertWorkflowAccess(userId, input.organizationId);

  const workflow = await prisma.$transaction(async (tx) => {
    const created = await tx.workflow.create({
      data: {
        organizationId: input.organizationId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
        createdBy: userId,
      },
      include: { steps: true },
    });

    await Promise.all(
      input.steps.map((step) =>
        tx.workflowStep.create({
          data: {
            workflowId: created.id,
            stepOrder: step.stepOrder,
            stepName: step.stepName.trim(),
            approverType: step.approverType,
            roleId: step.roleId || null,
            departmentId: step.departmentId || null,
            specificUserId: step.specificUserId || null,
            approvalMode: step.approvalMode ?? 'SINGLE_APPROVAL',
            minimumApprovals: step.minimumApprovals ?? 1,
            allowComments: step.allowComments ?? true,
            requireCommentOnReject: step.requireCommentOnReject ?? false,
            allowSkip: step.allowSkip ?? false,
            isRequired: step.isRequired ?? true,
          },
        })
      )
    );

    return created;
  });

  await logWorkflowEvent(input.organizationId, userId, 'WORKFLOW_CREATED', 'Workflow', workflow.id, `Created workflow ${workflow.name}`);

  return workflow;
}

export async function listWorkflows(organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  return prisma.workflow.findMany({ where: { organizationId }, include: { steps: true }, orderBy: { createdAt: 'desc' } });
}

export async function getWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  const workflow = await prisma.workflow.findFirst({ where: { id, organizationId }, include: { steps: true } });
  if (!workflow) throw new NotFoundError('Workflow not found');
  return workflow;
}

export async function updateWorkflow(id: string, organizationId: string, userId: string, input: UpdateWorkflowInput) {
  await assertWorkflowAccess(userId, organizationId);
  const existing = await prisma.workflow.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError('Workflow not found');

  const workflow = await prisma.$transaction(async (tx) => {
    const updated = await tx.workflow.update({
      where: { id },
      data: {
        name: input.name?.trim() || existing.name,
        description: input.description?.trim() || existing.description,
        isActive: input.isActive ?? existing.isActive,
        isDefault: input.isDefault ?? existing.isDefault,
      },
      include: { steps: true },
    });

    if (input.steps) {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      await Promise.all(
        input.steps.map((step) =>
          tx.workflowStep.create({
            data: {
              workflowId: updated.id,
              stepOrder: step.stepOrder,
              stepName: step.stepName.trim(),
              approverType: step.approverType,
              roleId: step.roleId || null,
              departmentId: step.departmentId || null,
              specificUserId: step.specificUserId || null,
              approvalMode: step.approvalMode ?? 'SINGLE_APPROVAL',
              minimumApprovals: step.minimumApprovals ?? 1,
              allowComments: step.allowComments ?? true,
              requireCommentOnReject: step.requireCommentOnReject ?? false,
              allowSkip: step.allowSkip ?? false,
              isRequired: step.isRequired ?? true,
            },
          })
        )
      );
    }

    return updated;
  });

  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_UPDATED', 'Workflow', workflow.id, `Updated workflow ${workflow.name}`);
  return workflow;
}

export async function deleteWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  const workflow = await prisma.workflow.findFirst({ where: { id, organizationId }, include: { instances: true } });
  if (!workflow) throw new NotFoundError('Workflow not found');
  if (workflow.instances.length > 0) {
    throw new ValidationError('Cannot delete a workflow that is already in use');
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    await tx.workflow.delete({ where: { id } });
  });

  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_DELETED', 'Workflow', id, `Deleted workflow ${workflow.name}`);
}

export async function duplicateWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  const source = await prisma.workflow.findFirst({ where: { id, organizationId }, include: { steps: true } });
  if (!source) throw new NotFoundError('Workflow not found');

  const duplicate = await prisma.$transaction(async (tx) => {
    const created = await tx.workflow.create({
      data: {
        organizationId,
        name: `${source.name} Copy`,
        description: source.description,
        isDefault: false,
        isActive: false,
        createdBy: userId,
      },
    });

    await Promise.all(
      source.steps.map((step) =>
        tx.workflowStep.create({
          data: {
            workflowId: created.id,
            stepOrder: step.stepOrder,
            stepName: step.stepName,
            approverType: step.approverType as WorkflowApproverType,
            roleId: step.roleId,
            departmentId: step.departmentId,
            specificUserId: step.specificUserId,
            approvalMode: step.approvalMode as WorkflowApprovalMode,
            minimumApprovals: step.minimumApprovals,
            allowComments: step.allowComments,
            requireCommentOnReject: step.requireCommentOnReject,
            allowSkip: step.allowSkip,
            isRequired: step.isRequired,
          },
        })
      )
    );

    return created;
  });

  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_DUPLICATED', 'Workflow', duplicate.id, `Duplicated workflow ${source.name}`);
  return duplicate;
}

export async function activateWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  const workflow = await prisma.workflow.update({ where: { id }, data: { isActive: true } });
  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_ACTIVATED', 'Workflow', workflow.id, `Activated workflow ${workflow.name}`);
  return workflow;
}

export async function deactivateWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  const workflow = await prisma.workflow.update({ where: { id }, data: { isActive: false } });
  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_DEACTIVATED', 'Workflow', workflow.id, `Deactivated workflow ${workflow.name}`);
  return workflow;
}

export async function setDefaultWorkflow(id: string, organizationId: string, userId: string) {
  await assertWorkflowAccess(userId, organizationId);
  await prisma.$transaction(async (tx) => {
    await tx.workflow.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
    await tx.workflow.update({ where: { id }, data: { isDefault: true } });
  });
  const workflow = await prisma.workflow.findFirst({ where: { id, organizationId } });
  if (!workflow) throw new NotFoundError('Workflow not found');
  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_DEFAULT_SET', 'Workflow', workflow.id, `Set ${workflow.name} as default`);
  return workflow;
}

export async function reorderWorkflowSteps(id: string, organizationId: string, userId: string, stepOrderMap: Array<{ id: string; stepOrder: number }>) {
  await assertWorkflowAccess(userId, organizationId);
  const workflow = await prisma.workflow.findFirst({ where: { id, organizationId } });
  if (!workflow) throw new NotFoundError('Workflow not found');
  await prisma.$transaction(async (tx) => {
    for (const item of stepOrderMap) {
      await tx.workflowStep.updateMany({ where: { id: item.id, workflowId: id }, data: { stepOrder: item.stepOrder } });
    }
  });
  await logWorkflowEvent(organizationId, userId, 'WORKFLOW_STEPS_REORDERED', 'Workflow', workflow.id, 'Reordered workflow steps');
  return workflow;
}

export async function executeWorkflowForMemo(memoId: string, userId: string) {
  const memo = await prisma.memo.findUnique({ where: { id: memoId }, include: { creator: true, organization: true } });
  if (!memo) throw new NotFoundError('Memo not found');
  assertSameTenant(memo.organizationId, memo.creator.organizationId);
  const workflow = await prisma.workflow.findFirst({ where: { organizationId: memo.organizationId, isDefault: true, isActive: true } });
  if (!workflow) throw new ValidationError('No active workflow configured for this organization');

  const workflowInstance = await prisma.workflowInstance.create({
    data: {
      workflowId: workflow.id,
      memoId: memo.id,
      organizationId: memo.organizationId,
      status: 'IN_PROGRESS',
      currentApproverId: memo.currentApproverId,
    },
  });

  const steps = await prisma.workflowStep.findMany({ where: { workflowId: workflow.id }, orderBy: { stepOrder: 'asc' } });
  const createdStepInstances = await Promise.all(
    steps.map((step) => prisma.workflowStepInstance.create({
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowStepId: step.id,
        status: 'PENDING',
      },
    }))
  );

  const firstStep = createdStepInstances[0];
  if (firstStep) {
    await prisma.workflowInstance.update({ where: { id: workflowInstance.id }, data: { currentStepInstanceId: firstStep.id } });
  }

  await logWorkflowEvent(memo.organizationId, userId, 'WORKFLOW_EXECUTED', 'WorkflowInstance', workflowInstance.id, `Workflow started for memo ${memo.id}`);
  return { workflowInstance, stepInstances: createdStepInstances };
}

export async function approveWorkflowStep(stepInstanceId: string, userId: string, comment?: string) {
  const stepInstance = await prisma.workflowStepInstance.findUnique({ where: { id: stepInstanceId }, include: { workflowInstance: { include: { memo: true } }, workflowStep: true } });
  if (!stepInstance) throw new NotFoundError('Workflow step instance not found');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(stepInstance.workflowInstance.organizationId, user.organizationId);

  const updated = await prisma.workflowStepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'APPROVED',
      comments: comment || stepInstance.comments,
      approvedAt: new Date(),
      decisionHistory: { approvedBy: userId, comment },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: stepInstance.workflowInstance.organizationId,
      action: 'STEP_APPROVED',
      entityType: 'WorkflowStepInstance',
      entityId: updated.id,
      details: `Step approved by ${user.email}`,
    },
  });

  void sendEmail(user.email, 'Workflow step approved', `<p>Your workflow step was approved.</p>`);
  void sendWhatsAppMessage(user.phone ?? '', 'Workflow step approved');
  return updated;
}

export async function rejectWorkflowStep(stepInstanceId: string, userId: string, comment?: string) {
  const stepInstance = await prisma.workflowStepInstance.findUnique({ where: { id: stepInstanceId }, include: { workflowInstance: { include: { memo: true } }, workflowStep: true } });
  if (!stepInstance) throw new NotFoundError('Workflow step instance not found');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(stepInstance.workflowInstance.organizationId, user.organizationId);

  const updated = await prisma.workflowStepInstance.update({
    where: { id: stepInstanceId },
    data: {
      status: 'REJECTED',
      comments: comment || stepInstance.comments,
      rejectedAt: new Date(),
      decisionHistory: { rejectedBy: userId, comment },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: stepInstance.workflowInstance.organizationId,
      action: 'STEP_REJECTED',
      entityType: 'WorkflowStepInstance',
      entityId: updated.id,
      details: `Step rejected by ${user.email}`,
    },
  });
  return updated;
}

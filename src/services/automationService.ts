import { Prisma } from '@prisma/client';
import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { sendEmail } from './emailService';
import { sendWhatsAppMessage } from './whatsappService';

export interface CreateAutomationRuleInput {
  organizationId: string;
  workflowId?: string;
  name: string;
  description?: string;
  trigger: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  isActive?: boolean;
}

async function assertAutomationAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    throw new ForbiddenError('Only admins or managers can manage automation rules');
  }
}

export async function createAutomationRule(input: CreateAutomationRuleInput, userId: string) {
  await assertAutomationAccess(userId, input.organizationId);
  return prisma.automationRule.create({
    data: {
      organizationId: input.organizationId,
      workflowId: input.workflowId || null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger: input.trigger as any,
      conditions: (input.conditions ?? {}) as Prisma.InputJsonValue,
      actions: (input.actions ?? {}) as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
      createdBy: userId,
    },
  });
}

export async function listAutomationRules(organizationId: string, userId: string) {
  await assertAutomationAccess(userId, organizationId);
  return prisma.automationRule.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

export async function executeAutomationRule(ruleId: string, context: { memoId?: string; workflowInstanceId?: string; organizationId: string }) {
  const rule = await prisma.automationRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError('Automation rule not found');
  assertSameTenant(rule.organizationId, context.organizationId);

  const execution = await prisma.automationExecution.create({
    data: {
      organizationId: rule.organizationId,
      automationRuleId: rule.id,
      workflowId: rule.workflowId || null,
      workflowInstanceId: context.workflowInstanceId || null,
      memoId: context.memoId || null,
      status: 'RUNNING',
      attempts: 1,
      result: { started: true },
    },
  });

  try {
    if (rule.actions && typeof rule.actions === 'object') {
      const actions = rule.actions as Record<string, unknown>;
      if (actions.sendNotification) {
        await sendEmail('no-reply@example.com', 'Automation rule executed', `<p>${rule.name}</p>`);
      }
      if (actions.sendEmail) {
        await sendWhatsAppMessage('whatsapp:+000000000000', rule.name);
      }
    }

    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'COMPLETED', result: { completed: true } } });
    return execution;
  } catch (error) {
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}

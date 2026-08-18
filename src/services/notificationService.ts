import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { sendEmail } from './emailService';
import { sendWhatsAppMessage } from './whatsappService';

async function assertNotificationAccess(userId: string, organizationId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  assertSameTenant(user.organizationId, organizationId);
}

export async function createNotification(input: { organizationId: string; userId: string; notificationType: string; title: string; message: string; channel?: string; priority?: string; category?: string; body?: string; data?: Record<string, unknown> }, actorId: string) {
  await assertNotificationAccess(actorId, input.organizationId);
  const notification = await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      notificationType: input.notificationType,
      title: input.title,
      message: input.message,
      body: input.body ?? null,
      channel: (input.channel as any) ?? 'IN_APP',
      priority: (input.priority as any) ?? 'NORMAL',
      category: (input.category as any) ?? 'SYSTEM',
      data: (input.data ?? {}) as any,
    },
  });
  await sendEmail('no-reply@example.com', notification.title, notification.message);
  await sendWhatsAppMessage('whatsapp:+000000000000', notification.message);
  return notification;
}

export async function listNotifications(organizationId: string, userId: string) {
  await assertNotificationAccess(userId, organizationId);
  return prisma.notification.findMany({ where: { organizationId, userId }, orderBy: { createdAt: 'desc' } });
}

export async function markNotificationsRead(organizationId: string, userId: string, notificationIds: string[]) {
  await assertNotificationAccess(userId, organizationId);
  return prisma.notification.updateMany({ where: { organizationId, userId, id: { in: notificationIds } }, data: { isRead: true } });
}

import crypto from 'crypto';
import { Prisma, Role, InvitationStatus } from '@prisma/client';
import { prisma } from '../prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { assertSameTenant } from '../middleware/tenant';
import { sendEmail } from './emailService';

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: Role;
  expiresInDays?: number;
}

export interface UpdateInvitationInput {
  status?: InvitationStatus;
  expiresAt?: Date;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function toUtcDate(days = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function assertOrganizationExists(organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new NotFoundError(`Organization with id=${organizationId} not found`);
  }
  return organization;
}

async function assertInviterCanManage(invitedByUserId: string, organizationId: string) {
  const inviter = await prisma.user.findUnique({ where: { id: invitedByUserId } });
  if (!inviter) {
    throw new NotFoundError('Inviter not found');
  }
  assertSameTenant(inviter.organizationId, organizationId);
  if (inviter.role !== 'ADMIN' && inviter.role !== 'MANAGER') {
    throw new ForbiddenError('Only admins or managers can invite users');
  }
}

export async function inviteUser(input: CreateInvitationInput, invitedByUserId: string) {
  const organization = await assertOrganizationExists(input.organizationId);
  await assertInviterCanManage(invitedByUserId, organization.id);

  const normalizedEmail = input.email.trim().toLowerCase();
  const existingPending = await prisma.invitation.findFirst({
    where: { organizationId: organization.id, email: normalizedEmail, status: InvitationStatus.PENDING },
  });
  if (existingPending) {
    throw new ValidationError('A pending invitation already exists for this email');
  }

  const expiresAt = toUtcDate(input.expiresInDays ?? 7);
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: organization.id,
      email: normalizedEmail,
      role: input.role,
      invitedBy: invitedByUserId,
      token: generateToken(),
      status: InvitationStatus.PENDING,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      action: 'INVITATION_CREATED',
      entityType: 'Invitation',
      entityId: invitation.id,
      details: `Invited ${normalizedEmail}`,
    },
  });

  void sendEmail(
    normalizedEmail,
    'You are invited to FlowState',
    `<p>You have been invited to join ${organization.name}. Use the invitation token <strong>${invitation.token}</strong>.</p>`
  );

  return invitation;
}

export async function listInvitations(organizationId: string, currentUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  assertSameTenant(user.organizationId, organizationId);
  return prisma.invitation.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

export async function getInvitationById(invitationId: string, organizationId: string, currentUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  assertSameTenant(user.organizationId, organizationId);
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }
  assertSameTenant(invitation.organizationId, organizationId);
  return invitation;
}

export async function resendInvitation(invitationId: string, organizationId: string, currentUserId: string) {
  const invitation = await getInvitationById(invitationId, organizationId, currentUserId);
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError('Only pending invitations can be resent');
  }
  if (invitation.expiresAt < new Date()) {
    throw new ValidationError('Invitation has expired');
  }

  const organization = await assertOrganizationExists(organizationId);
  void sendEmail(
    invitation.email,
    'Invitation resent',
    `<p>Your invitation to join ${organization.name} was resent. Token: <strong>${invitation.token}</strong></p>`
  );

  return invitation;
}

export async function cancelInvitation(invitationId: string, organizationId: string, currentUserId: string) {
  const invitation = await getInvitationById(invitationId, organizationId, currentUserId);
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError('Only pending invitations can be cancelled');
  }

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: InvitationStatus.CANCELLED, updatedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'INVITATION_CANCELLED',
      entityType: 'Invitation',
      entityId: updated.id,
      details: `Cancelled invitation for ${updated.email}`,
    },
  });

  return updated;
}

export async function validateInvitationToken(token: string) {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }
  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ValidationError('Invitation is not pending');
  }
  if (invitation.expiresAt < new Date()) {
    throw new ValidationError('Invitation has expired');
  }
  return invitation;
}

export async function acceptInvitation(token: string, userInput: { name: string; passwordHash: string; email?: string }) {
  const invitation = await validateInvitationToken(token);
  const email = (userInput.email || invitation.email).trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  let user;

  if (existingUser) {
    if (existingUser.organizationId !== invitation.organizationId) {
      throw new ForbiddenError('User already belongs to a different organization');
    }
    user = existingUser;
  } else {
    user = await prisma.user.create({
      data: {
        name: userInput.name,
        email,
        passwordHash: userInput.passwordHash,
        role: invitation.role,
        organizationId: invitation.organizationId,
        isActive: true,
      },
    });
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: InvitationStatus.ACCEPTED,
      acceptedBy: user.id,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: invitation.organizationId,
      action: 'INVITATION_ACCEPTED',
      entityType: 'Invitation',
      entityId: invitation.id,
      details: `Accepted invitation for ${email}`,
    },
  });

  return { user, invitation };
}

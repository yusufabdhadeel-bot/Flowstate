import { prisma } from "../../prismaClient";

/**
 * Delete an organization and everything that hangs off it.
 *
 * The schema uses RESTRICT on the foreign keys, so parents cannot simply be
 * removed while child rows still reference them. Test fixtures must therefore be
 * torn down in dependency order.
 */
export async function deleteOrganizationCascade(
  organizationId: string,
): Promise<void> {
  // Security / session tables first.
  await prisma.securityEvent.deleteMany({ where: { organizationId } });
  await prisma.securityAlert.deleteMany({ where: { organizationId } });
  await prisma.securitySession.deleteMany({ where: { organizationId } });
  await prisma.apiKey.deleteMany({ where: { organizationId } });
  await prisma.webhookDelivery.deleteMany({
    where: { webhook: { organizationId } },
  });
  await prisma.webhookEndpoint.deleteMany({ where: { organizationId } });
  await prisma.mfaCredential.deleteMany({
    where: { user: { organizationId } },
  });
  await prisma.trustedDevice.deleteMany({
    where: { user: { organizationId } },
  });

  // Workflow / automation / reporting.
  await prisma.workflowStepInstance.deleteMany({
    where: { workflowInstance: { organizationId } },
  });
  await prisma.workflowInstance.deleteMany({ where: { organizationId } });
  await prisma.workflowStep.deleteMany({
    where: { workflow: { organizationId } },
  });
  await prisma.automationExecution.deleteMany({ where: { organizationId } });
  await prisma.automationRule.deleteMany({ where: { organizationId } });
  await prisma.reportExecution.deleteMany({ where: { organizationId } });
  await prisma.reportTemplate.deleteMany({ where: { organizationId } });
  await prisma.searchHistory.deleteMany({ where: { organizationId } });
  await prisma.fileRecord.deleteMany({ where: { organizationId } });
  await prisma.notificationPreference.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });

  // Memo-related.
  await prisma.comment.deleteMany({ where: { organizationId } });
  await prisma.memo.deleteMany({ where: { organizationId } });

  // Invitations reference the inviting user, so go before users.
  await prisma.invitation.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });

  // Users (self-referencing via reportsTo, so clear that link first).
  await prisma.user.updateMany({
    where: { organizationId },
    data: { reportsTo: null, departmentId: null, mfaSecret: null },
  });
  await prisma.user.deleteMany({ where: { organizationId } });

  await prisma.department.deleteMany({ where: { organizationId } });
  await prisma.workflow.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

-- Brings the database fully in line with prisma/schema.prisma.
--
-- The two historical migrations only backfilled organizationId on
-- User, Memo, Comment and AuditLog, but the schema declares it on every
-- tenant-owned model. This migration adds the remaining organizationId
-- columns plus the AuditLog and Organization columns that had no
-- migration, and normalises the TrustedDevice unique index name.
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorIp" TEXT,
ADD COLUMN     "isImmutable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "newValues" JSONB,
ADD COLUMN     "previousValues" JSONB,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "resourceId" TEXT,
ADD COLUMN     "resourceType" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "AutomationExecution" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "FileRecord" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "compliancePolicies" JSONB DEFAULT '{}',
ADD COLUMN     "dashboardSnapshot" JSONB DEFAULT '{}',
ADD COLUMN     "defaultSSOProviderId" UUID,
ADD COLUMN     "enterpriseAccessPolicy" JSONB DEFAULT '{}',
ADD COLUMN     "governanceRules" JSONB DEFAULT '{}',
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "securitySettings" JSONB DEFAULT '{}',
ADD COLUMN     "settings" JSONB DEFAULT '{}',
ADD COLUMN     "ssoEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ReportExecution" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "ReportTemplate" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "SearchHistory" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "WebhookEndpoint" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "organizationId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "WorkflowInstance" ADD COLUMN     "organizationId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "idx_apiKey_organizationId" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "idx_auditLog_actorId" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "idx_auditLog_resource" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "idx_automationExecution_organizationId" ON "AutomationExecution"("organizationId");

-- CreateIndex
CREATE INDEX "idx_automationRule_organizationId" ON "AutomationRule"("organizationId");

-- CreateIndex
CREATE INDEX "idx_department_organizationId" ON "Department"("organizationId");

-- CreateIndex
CREATE INDEX "idx_fileRecord_organizationId" ON "FileRecord"("organizationId");

-- CreateIndex
CREATE INDEX "idx_invitation_organizationId" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "idx_notification_organizationId" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "idx_notificationPreference_organizationId" ON "NotificationPreference"("organizationId");

-- CreateIndex
CREATE INDEX "idx_reportExecution_organizationId" ON "ReportExecution"("organizationId");

-- CreateIndex
CREATE INDEX "idx_reportTemplate_organizationId" ON "ReportTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "idx_searchHistory_organizationId" ON "SearchHistory"("organizationId");

-- CreateIndex
CREATE INDEX "idx_webhookEndpoint_organizationId" ON "WebhookEndpoint"("organizationId");

-- CreateIndex
CREATE INDEX "idx_workflow_organizationId" ON "Workflow"("organizationId");

-- CreateIndex
CREATE INDEX "idx_workflowInstance_organizationId" ON "WorkflowInstance"("organizationId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExecution" ADD CONSTRAINT "ReportExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uq_trustedDevice_user_device" RENAME TO "TrustedDevice_userId_deviceId_key";


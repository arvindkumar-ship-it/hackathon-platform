/*
  Warnings:

  - You are about to drop the column `action` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `entityId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `entityType` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `eventType` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outcome` to the `AuditLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- DropIndex
DROP INDEX "AuditLog_action_idx";

-- DropIndex
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "AuditLog_eventId_idx";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "action",
DROP COLUMN "entityId",
DROP COLUMN "entityType",
ADD COLUMN     "eventType" VARCHAR(100) NOT NULL,
ADD COLUMN     "ipAddress" VARCHAR(80),
ADD COLUMN     "outcome" "AuditOutcome" NOT NULL,
ADD COLUMN     "requestId" VARCHAR(120),
ADD COLUMN     "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
ADD COLUMN     "targetId" VARCHAR(120),
ADD COLUMN     "targetType" VARCHAR(80),
ADD COLUMN     "userAgent" VARCHAR(500);

-- CreateIndex
CREATE INDEX "AuditLog_eventType_createdAt_idx" ON "AuditLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_eventId_createdAt_idx" ON "AuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");

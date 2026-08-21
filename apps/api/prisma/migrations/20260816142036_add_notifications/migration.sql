/*
  Warnings:

  - You are about to drop the column `body` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `readAt` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Notification` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `Notification` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `channel` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idempotencyKey` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipient` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subject` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `templateData` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `templateKey` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TEAM_INVITATION', 'JUDGE_ASSIGNMENT', 'SUBMISSION_RECEIVED', 'EVALUATION_REMINDER', 'WINNER_ANNOUNCEMENT', 'EVENT_STATUS_CHANGED');

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "body",
DROP COLUMN "readAt",
DROP COLUMN "title",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "channel" "NotificationChannel" NOT NULL,
ADD COLUMN     "eventId" UUID,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" VARCHAR(255) NOT NULL,
ADD COLUMN     "lastError" VARCHAR(2000),
ADD COLUMN     "providerMessageId" VARCHAR(255),
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "recipient" VARCHAR(320) NOT NULL,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "subject" VARCHAR(255) NOT NULL,
ADD COLUMN     "templateData" JSONB NOT NULL,
ADD COLUMN     "templateKey" VARCHAR(100) NOT NULL,
ADD COLUMN     "type" "NotificationType" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "judgingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_eventId_type_createdAt_idx" ON "Notification"("eventId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

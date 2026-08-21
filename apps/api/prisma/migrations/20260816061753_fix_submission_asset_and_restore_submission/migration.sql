/*
  Warnings:

  - You are about to drop the column `fileName` on the `SubmissionAsset` table. All the data in the column will be lost.
  - You are about to drop the column `sizeBytes` on the `SubmissionAsset` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `SubmissionAsset` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[storageKey]` on the table `SubmissionAsset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `assetType` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `extension` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalName` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `safeName` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SubmissionAsset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SubmissionAsset" DROP COLUMN "fileName",
DROP COLUMN "sizeBytes",
DROP COLUMN "type",
ADD COLUMN     "assetType" "AssetType" NOT NULL,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "extension" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "originalName" TEXT NOT NULL,
ADD COLUMN     "safeName" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uploadedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAsset_storageKey_key" ON "SubmissionAsset"("storageKey");

-- CreateIndex
CREATE INDEX "SubmissionAsset_status_idx" ON "SubmissionAsset"("status");

-- CreateIndex
CREATE INDEX "SubmissionAsset_assetType_idx" ON "SubmissionAsset"("assetType");

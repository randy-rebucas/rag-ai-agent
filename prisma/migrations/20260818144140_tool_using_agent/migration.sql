-- CreateEnum
CREATE TYPE "ActionTool" AS ENUM ('UPDATE_PRICE', 'UPDATE_INVENTORY');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'AI_ACTION_PREPARED';
ALTER TYPE "EventType" ADD VALUE 'AI_ACTION_APPROVED';
ALTER TYPE "EventType" ADD VALUE 'AI_ACTION_EXECUTED';

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tool" "ActionTool" NOT NULL,
    "arguments" JSONB NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "actor" TEXT NOT NULL,
    "reasoning" TEXT,
    "sourceRefs" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Action_shopId_status_idx" ON "Action"("shopId", "status");

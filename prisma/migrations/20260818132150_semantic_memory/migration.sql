-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('STORE', 'PRODUCT', 'CUSTOMER', 'ORDER', 'INVENTORY', 'MARKETING', 'CONVERSATION', 'MERCHANT_PREFERENCE', 'ACTIVITY', 'INSIGHT', 'DECISION', 'OUTCOME');

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "memoryType" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "importance" DOUBLE PRECISION,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Memory_shopId_memoryType_idx" ON "Memory"("shopId", "memoryType");

-- CreateIndex
CREATE INDEX "Memory_shopId_entityType_entityId_idx" ON "Memory"("shopId", "entityType", "entityId");

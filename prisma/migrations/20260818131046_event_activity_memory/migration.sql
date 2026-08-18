-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('shopify', 'ai', 'system');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRICE_CHANGED', 'INVENTORY_UPDATED', 'INVENTORY_LOW', 'INVENTORY_RESTOCKED', 'ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'DISCOUNT_CREATED', 'DISCOUNT_UPDATED', 'COLLECTION_UPDATED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "shopifyId" TEXT,
    "source" "EventSource" NOT NULL DEFAULT 'shopify',
    "actor" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_shopId_entityType_entityId_idx" ON "Event"("shopId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Event_shopId_occurredAt_idx" ON "Event"("shopId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_shopId_source_eventType_shopifyId_occurredAt_key" ON "Event"("shopId", "source", "eventType", "shopifyId", "occurredAt");

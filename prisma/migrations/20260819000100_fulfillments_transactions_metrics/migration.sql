-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'FULFILLMENT_CREATED';
ALTER TYPE "EventType" ADD VALUE 'FULFILLMENT_UPDATED';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "salesVelocity" DECIMAL(12,4);
ALTER TABLE "Product" ADD COLUMN "metricsUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Fulfillment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTransaction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT,
    "status" TEXT,
    "gateway" TEXT,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "processedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fulfillment_shopId_shopifyId_key" ON "Fulfillment"("shopId", "shopifyId");
CREATE INDEX "Fulfillment_shopId_idx" ON "Fulfillment"("shopId");
CREATE INDEX "Fulfillment_orderId_idx" ON "Fulfillment"("orderId");

CREATE UNIQUE INDEX "OrderTransaction_shopId_shopifyId_key" ON "OrderTransaction"("shopId", "shopifyId");
CREATE INDEX "OrderTransaction_shopId_idx" ON "OrderTransaction"("shopId");
CREATE INDEX "OrderTransaction_orderId_idx" ON "OrderTransaction"("orderId");

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderTransaction" ADD CONSTRAINT "OrderTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Action" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "Action" ADD COLUMN "outcome" TEXT;

-- CreateIndex
CREATE INDEX "Action_shopId_tool_outcome_idx" ON "Action"("shopId", "tool", "outcome");

-- CreateTable
CREATE TABLE "ActionOutcomeStat" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tool" "ActionTool" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "positive" INTEGER NOT NULL DEFAULT 0,
    "negative" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionOutcomeStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionOutcomeStat_shopId_tool_key" ON "ActionOutcomeStat"("shopId", "tool");
CREATE INDEX "ActionOutcomeStat_shopId_idx" ON "ActionOutcomeStat"("shopId");

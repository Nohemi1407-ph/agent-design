-- CreateEnum
CREATE TYPE "CreditTxType" AS ENUM ('GRANT', 'PURCHASE', 'USAGE', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "CreditTx" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'owner',
    "type" "CreditTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "taskId" TEXT,
    "carouselId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTx_userId_createdAt_idx" ON "CreditTx"("userId", "createdAt");

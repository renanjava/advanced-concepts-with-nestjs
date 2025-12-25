-- CreateEnum
CREATE TYPE "SagaStatus" AS ENUM ('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'COMPENSATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'FUNDS_RESERVED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE 'COMPENSATING';
ALTER TYPE "PaymentStatus" ADD VALUE 'COMPENSATED';

-- CreateTable
CREATE TABLE "saga_executions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "status" "SagaStatus" NOT NULL,
    "compensationStep" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "saga_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saga_steps" (
    "id" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "saga_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saga_executions_paymentId_key" ON "saga_executions"("paymentId");

-- CreateIndex
CREATE INDEX "saga_steps_sagaId_idx" ON "saga_steps"("sagaId");

-- AddForeignKey
ALTER TABLE "saga_steps" ADD CONSTRAINT "saga_steps_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "saga_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

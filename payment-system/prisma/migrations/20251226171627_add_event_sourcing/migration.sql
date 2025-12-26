-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_snapshots" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_projections" (
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "gatewayTxId" TEXT,
    "reservationId" TEXT,
    "totalEvents" INTEGER NOT NULL,
    "lastEventType" TEXT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_projections_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "account_balance_projections" (
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentBalance" DECIMAL(10,2) NOT NULL,
    "reservedBalance" DECIMAL(10,2) NOT NULL,
    "totalDebits" DECIMAL(10,2) NOT NULL,
    "totalCredits" DECIMAL(10,2) NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balance_projections_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE INDEX "domain_events_aggregateId_aggregateType_idx" ON "domain_events"("aggregateId", "aggregateType");

-- CreateIndex
CREATE INDEX "domain_events_eventType_timestamp_idx" ON "domain_events"("eventType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_aggregateId_version_key" ON "domain_events"("aggregateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "event_snapshots_aggregateId_key" ON "event_snapshots"("aggregateId");

-- CreateIndex
CREATE INDEX "event_snapshots_aggregateId_idx" ON "event_snapshots"("aggregateId");

-- CreateIndex
CREATE INDEX "payment_projections_userId_idx" ON "payment_projections"("userId");

-- CreateIndex
CREATE INDEX "payment_projections_status_idx" ON "payment_projections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "account_balance_projections_userId_key" ON "account_balance_projections"("userId");

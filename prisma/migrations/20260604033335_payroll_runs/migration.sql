-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'BIWEEKLY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayrollRun_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "regularHours" REAL NOT NULL DEFAULT 0,
    "otHours" REAL NOT NULL DEFAULT 0,
    "regularPayCents" INTEGER NOT NULL DEFAULT 0,
    "otPayCents" INTEGER NOT NULL DEFAULT 0,
    "salaryPayCents" INTEGER NOT NULL DEFAULT 0,
    "tipsCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT,
    "grossPayCents" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayrollRun_status_idx" ON "PayrollRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_periodStart_periodEnd_key" ON "PayrollRun"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollLine_userId_idx" ON "PayrollLine"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_userId_key" ON "PayrollLine"("runId", "userId");

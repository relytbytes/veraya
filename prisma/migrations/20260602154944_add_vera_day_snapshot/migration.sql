-- CreateTable
CREATE TABLE "VeraDaySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "scores" TEXT NOT NULL,
    "actualRevenue" REAL NOT NULL,
    "actualNet" REAL NOT NULL,
    "actualMarginPct" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VeraDaySnapshot_date_key" ON "VeraDaySnapshot"("date");

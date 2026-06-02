-- CreateTable
CREATE TABLE "VeraFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "text" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "VeraFeedback_key_idx" ON "VeraFeedback"("key");

-- CreateTable
CREATE TABLE "PrepWasteLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "preppedQty" DECIMAL NOT NULL DEFAULT 0,
    "wastedQty" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrepWasteLog_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PrepWasteLog_ingredientId_idx" ON "PrepWasteLog"("ingredientId");

-- CreateIndex
CREATE INDEX "PrepWasteLog_date_idx" ON "PrepWasteLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PrepWasteLog_date_ingredientId_key" ON "PrepWasteLog"("date", "ingredientId");

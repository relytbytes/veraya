-- CreateTable
CREATE TABLE "BarcodeCache" (
    "barcode" TEXT NOT NULL PRIMARY KEY,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "quantity" TEXT,
    "imageUrl" TEXT,
    "source" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

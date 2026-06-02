-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT,
    "userId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "type" TEXT NOT NULL DEFAULT 'DINE_IN',
    "source" TEXT NOT NULL DEFAULT 'POS',
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "tax" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("closedAt", "createdAt", "discountAmount", "guestName", "guestPhone", "id", "notes", "source", "status", "stripePaymentIntentId", "subtotal", "tableId", "tax", "total", "type", "updatedAt", "userId") SELECT "closedAt", "createdAt", "discountAmount", "guestName", "guestPhone", "id", "notes", "source", "status", "stripePaymentIntentId", "subtotal", "tableId", "tax", "total", "type", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_Table" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "serviceStage" TEXT,
    "stageUpdatedAt" DATETIME,
    "floorX" REAL,
    "floorY" REAL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "shape" TEXT NOT NULL DEFAULT 'rect',
    "seatedAt" DATETIME,
    "guestName" TEXT,
    "partySize" INTEGER,
    "serverId" TEXT,
    "customerId" TEXT,
    "primaryTableId" TEXT,
    CONSTRAINT "Table_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Table_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Table_primaryTableId_fkey" FOREIGN KEY ("primaryTableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Table" ("capacity", "floorX", "floorY", "guestName", "id", "notes", "number", "partySize", "primaryTableId", "rotation", "seatedAt", "serverId", "serviceStage", "shape", "stageUpdatedAt", "status") SELECT "capacity", "floorX", "floorY", "guestName", "id", "notes", "number", "partySize", "primaryTableId", "rotation", "seatedAt", "serverId", "serviceStage", "shape", "stageUpdatedAt", "status" FROM "Table";
DROP TABLE "Table";
ALTER TABLE "new_Table" RENAME TO "Table";
CREATE UNIQUE INDEX "Table_number_key" ON "Table"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

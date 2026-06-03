-- CreateTable
CREATE TABLE "ServerSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#21A090',
    "serverId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerSection_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "sectionId" TEXT,
    CONSTRAINT "Table_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Table_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Table_primaryTableId_fkey" FOREIGN KEY ("primaryTableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Table_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ServerSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Table" ("capacity", "customerId", "floorX", "floorY", "guestName", "id", "notes", "number", "partySize", "primaryTableId", "rotation", "seatedAt", "serverId", "serviceStage", "shape", "stageUpdatedAt", "status") SELECT "capacity", "customerId", "floorX", "floorY", "guestName", "id", "notes", "number", "partySize", "primaryTableId", "rotation", "seatedAt", "serverId", "serviceStage", "shape", "stageUpdatedAt", "status" FROM "Table";
DROP TABLE "Table";
ALTER TABLE "new_Table" RENAME TO "Table";
CREATE UNIQUE INDEX "Table_number_key" ON "Table"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ServerSection_name_key" ON "ServerSection"("name");

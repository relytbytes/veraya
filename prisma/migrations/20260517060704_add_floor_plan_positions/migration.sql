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
    "shape" TEXT NOT NULL DEFAULT 'rect'
);
INSERT INTO "new_Table" ("capacity", "id", "notes", "number", "serviceStage", "stageUpdatedAt", "status") SELECT "capacity", "id", "notes", "number", "serviceStage", "stageUpdatedAt", "status" FROM "Table";
DROP TABLE "Table";
ALTER TABLE "new_Table" RENAME TO "Table";
CREATE UNIQUE INDEX "Table_number_key" ON "Table"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

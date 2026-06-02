-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BeverageProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bottleSizeMl" INTEGER NOT NULL DEFAULT 750,
    "pourSizeMl" INTEGER NOT NULL DEFAULT 44,
    "producer" TEXT,
    "vintage" TEXT,
    "abv" REAL,
    "binNumber" TEXT,
    "offerGlass" BOOLEAN NOT NULL DEFAULT false,
    "offerBottle" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BeverageProfile_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BeverageProfile" ("abv", "bottleSizeMl", "category", "id", "ingredientId", "pourSizeMl", "producer", "vintage") SELECT "abv", "bottleSizeMl", "category", "id", "ingredientId", "pourSizeMl", "producer", "vintage" FROM "BeverageProfile";
DROP TABLE "BeverageProfile";
ALTER TABLE "new_BeverageProfile" RENAME TO "BeverageProfile";
CREATE UNIQUE INDEX "BeverageProfile_ingredientId_key" ON "BeverageProfile"("ingredientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

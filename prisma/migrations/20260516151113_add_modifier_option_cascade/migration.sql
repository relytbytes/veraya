-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderItemModifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "modifierOptionId" TEXT NOT NULL,
    CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItemModifier_modifierOptionId_fkey" FOREIGN KEY ("modifierOptionId") REFERENCES "ModifierOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItemModifier" ("id", "modifierOptionId", "orderItemId") SELECT "id", "modifierOptionId", "orderItemId" FROM "OrderItemModifier";
DROP TABLE "OrderItemModifier";
ALTER TABLE "new_OrderItemModifier" RENAME TO "OrderItemModifier";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

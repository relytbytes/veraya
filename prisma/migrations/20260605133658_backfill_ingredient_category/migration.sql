-- Backfill inventory section from existing beverage profiles:
--   WINE profile        -> WINE
--   LIQUOR/BEER/NA      -> BAR (bar/liquor/beer)
--   everything else stays KITCHEN (the column default)
UPDATE "Ingredient"
SET "category" = 'WINE'
WHERE "id" IN (SELECT "ingredientId" FROM "BeverageProfile" WHERE "category" = 'WINE');

UPDATE "Ingredient"
SET "category" = 'BAR'
WHERE "id" IN (SELECT "ingredientId" FROM "BeverageProfile" WHERE "category" IN ('LIQUOR', 'BEER', 'NA_BEVERAGE'));

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_barcode_key" ON "Ingredient"("barcode");

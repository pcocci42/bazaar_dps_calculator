-- AlterTable
ALTER TABLE "CardEffect" ADD COLUMN     "attribute" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "resource" TEXT,
ADD COLUMN     "targetFilter" TEXT;

-- CreateIndex
CREATE INDEX "CardEffect_targetFilter_idx" ON "CardEffect"("targetFilter");

-- CreateIndex
CREATE INDEX "CardEffect_attribute_idx" ON "CardEffect"("attribute");

-- CreateIndex
CREATE INDEX "CardEffect_resource_idx" ON "CardEffect"("resource");

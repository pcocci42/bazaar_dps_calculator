-- DropForeignKey
ALTER TABLE "Card" DROP CONSTRAINT "Card_rawCardId_fkey";

-- CreateTable
CREATE TABLE "CardTier" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "cooldown" DOUBLE PRECISION,
    "ammo" DOUBLE PRECISION,
    "multicast" DOUBLE PRECISION,
    "critChance" DOUBLE PRECISION,
    "damage" DOUBLE PRECISION,
    "shield" DOUBLE PRECISION,
    "heal" DOUBLE PRECISION,
    "burn" DOUBLE PRECISION,
    "poison" DOUBLE PRECISION,
    "regen" DOUBLE PRECISION,
    "chargeSeconds" DOUBLE PRECISION,
    "descriptions" JSONB NOT NULL,

    CONSTRAINT "CardTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardEffect" (
    "id" TEXT NOT NULL,
    "cardTierId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "count" INTEGER,
    "operation" TEXT NOT NULL,
    "condition" TEXT,
    "formula" TEXT,
    "isCombatOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPermanent" BOOLEAN NOT NULL DEFAULT false,
    "rawText" TEXT NOT NULL,

    CONSTRAINT "CardEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardTier_tier_idx" ON "CardTier"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "CardTier_cardId_tier_key" ON "CardTier"("cardId", "tier");

-- CreateIndex
CREATE INDEX "CardEffect_kind_idx" ON "CardEffect"("kind");

-- CreateIndex
CREATE INDEX "CardEffect_target_idx" ON "CardEffect"("target");

-- CreateIndex
CREATE INDEX "CardEffect_operation_idx" ON "CardEffect"("operation");

-- CreateIndex
CREATE INDEX "Card_source_idx" ON "Card"("source");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card"("name");

-- CreateIndex
CREATE INDEX "Card_hero_idx" ON "Card"("hero");

-- CreateIndex
CREATE INDEX "Card_type_idx" ON "Card"("type");

-- CreateIndex
CREATE INDEX "Card_size_idx" ON "Card"("size");

-- CreateIndex
CREATE INDEX "RawCard_source_idx" ON "RawCard"("source");

-- CreateIndex
CREATE INDEX "RawCard_sourceCardId_idx" ON "RawCard"("sourceCardId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_rawCardId_fkey" FOREIGN KEY ("rawCardId") REFERENCES "RawCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTier" ADD CONSTRAINT "CardTier_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardEffect" ADD CONSTRAINT "CardEffect_cardTierId_fkey" FOREIGN KEY ("cardTierId") REFERENCES "CardTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

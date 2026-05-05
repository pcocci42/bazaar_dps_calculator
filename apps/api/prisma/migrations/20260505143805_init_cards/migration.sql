-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('UNSUPPORTED', 'PARTIAL', 'SUPPORTED');

-- CreateTable
CREATE TABLE "RawCard" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceCardId" TEXT,
    "patch" TEXT,
    "rawJson" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "rawCardId" TEXT,
    "name" TEXT NOT NULL,
    "hero" TEXT,
    "type" TEXT,
    "rarity" TEXT,
    "size" TEXT,
    "cooldown" DOUBLE PRECISION,
    "damage" DOUBLE PRECISION,
    "text" TEXT,
    "source" TEXT NOT NULL,
    "patch" TEXT,
    "supportStatus" "SupportStatus" NOT NULL DEFAULT 'UNSUPPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_rawCardId_key" ON "Card"("rawCardId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_rawCardId_fkey" FOREIGN KEY ("rawCardId") REFERENCES "RawCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

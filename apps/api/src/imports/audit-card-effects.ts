import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const totalCards = await prisma.card.count();
  const totalTiers = await prisma.cardTier.count();
  const totalEffects = await prisma.cardEffect.count();

  const effectsByKind = await prisma.cardEffect.groupBy({
    by: ["kind"],
    _count: {
      kind: true,
    },
    orderBy: {
      _count: {
        kind: "desc",
      },
    },
  });

  const otherEffects = await prisma.cardEffect.findMany({
    where: {
      kind: {
        in: ["OTHER", "SCALING"],
      },
    },
    select: {
      kind: true,
      rawText: true,
      formula: true,
      cardTier: {
        select: {
          tier: true,
          card: {
            select: {
              name: true,
              hero: true,
            },
          },
        },
      },
    },
    take: 50,
    orderBy: {
      rawText: "asc",
    },
  });

  const calculableTiers = await prisma.cardTier.count({
    where: {
      OR: [
        { damage: { not: null } },
        { shield: { not: null } },
        { heal: { not: null } },
        { burn: { not: null } },
        { poison: { not: null } },
        { regen: { not: null } },
      ],
    },
  });

  console.log("");
  console.log("=== Bazaar DB Audit ===");
  console.log(`Cards: ${totalCards}`);
  console.log(`Card tiers: ${totalTiers}`);
  console.log(`Card effects: ${totalEffects}`);
  console.log(`Tiers with at least one numeric combat value: ${calculableTiers}`);
  console.log("");

  console.log("=== Effects by kind ===");
  for (const row of effectsByKind) {
    console.log(`${row.kind.padEnd(18)} ${row._count.kind}`);
  }

  console.log("");
  console.log("=== Sample OTHER/SCALING effects ===");

  for (const effect of otherEffects) {
    console.log(
      `[${effect.kind}] ${effect.cardTier.card.name} (${effect.cardTier.tier}) - ${effect.rawText}`
    );
  }

  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
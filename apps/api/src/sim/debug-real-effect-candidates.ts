import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const kinds = [
  "DAMAGE",
  "BURN",
  "POISON",
  "SHIELD",
  "HEAL",
  "REGEN",
  "HASTE",
  "SLOW",
  "FREEZE",
  "CHARGE",
  "FLYING_START",
  "FLYING_STOP",
  "COOLDOWN_MOD",
  "MULTICAST_MOD",
  "RELOAD",
  "DESTROY",
];

async function main() {
  for (const kind of kinds) {
    const rows = await prisma.cardEffect.findMany({
      where: {
        kind,
      },
      include: {
        cardTier: {
          include: {
            card: true,
          },
        },
      },
      take: 5,
    });

    console.log(`\n== ${kind} ==`);

    for (const effect of rows) {
      console.log(
        `${effect.cardTier.card.name} | ${effect.cardTier.tier} | ${effect.rawText}`
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
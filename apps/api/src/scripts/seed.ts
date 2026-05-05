import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.card.deleteMany();
  await prisma.rawCard.deleteMany();

  const rawCard = await prisma.rawCard.create({
    data: {
      source: "manual",
      sourceCardId: "test_simple_sword",
      patch: "test",
      rawJson: {
        name: "Simple Sword",
        type: "Weapon",
        cooldown: 2,
        damage: 20,
        text: "Deal 20 damage.",
      },
    },
  });

  await prisma.card.create({
    data: {
      rawCardId: rawCard.id,
      name: "Simple Sword",
      type: "Weapon",
      cooldown: 2,
      damage: 20,
      text: "Deal 20 damage.",
      source: "manual",
      patch: "test",
      supportStatus: "SUPPORTED",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
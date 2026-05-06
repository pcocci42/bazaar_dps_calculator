import { PrismaClient } from "@prisma/client";
import { simulateBoardRequest } from "./simulate-board-request.js";

const prisma = new PrismaClient();

async function main() {
  const result = await simulateBoardRequest(
    {
      items: [
        {
          name: "Old Saltclaw",
          tier: "Gold",
          slotIndex: 0,
        },
        {
          name: "28 Hour Fitness",
          tier: "Gold",
          slotIndex: 1,
        },
      ],
      config: {
        durationSeconds: 14,
        enemyMaxHealth: 5000,
      },
      setup: {
        selectedEnchantments: [
          {
            slotIndex: 0,
            enchantment: "TestEnchant",
            tagsToAdd: ["Enchanted"],
            itemOverrides: {
              damageBonus: 5,
            },
          },
        ],
      },
      options: {
        maxEvents: 80,
      },
    },
    { prisma }
  );

  console.log("=== Board Request Smoke Test ===");
  console.log(result.summary);

  console.log("\n=== Runtime Board ===");
  for (const runtimeItem of result.board ?? []) {
    console.log({
      slotIndex: runtimeItem.slotIndex,
      name: runtimeItem.name,
      tier: runtimeItem.tier,
      tags: runtimeItem.tags,
      damageBonus: runtimeItem.bonuses.damage,
      cooldownSeconds: runtimeItem.cooldownSeconds,
      itemUses: result.events?.filter(
        (event) =>
          event.type === "ITEM_USED" &&
          event.sourceInstanceId === runtimeItem.instanceId
      ).length,
    });
  }

  console.log("\n=== Configurable Effects ===");
  for (const configurableEffect of result.configurableEffects ?? []) {
    console.log({
      sourceSlotIndex: configurableEffect.sourceSlotIndex,
      sourceName: configurableEffect.sourceName,
      kind: configurableEffect.effect.kind,
      reason: configurableEffect.reason,
      control: configurableEffect.suggestedControl,
      rawText: configurableEffect.effect.rawText,
    });
  }

  console.log("\n=== Events ===");
  for (const event of result.events ?? []) {
    console.log(`[${event.time.toFixed(2)}s] ${event.type}: ${event.message}`);
  }

  if (result.summary.damageDealt <= 0) {
    throw new Error("Expected request simulation to deal damage.");
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

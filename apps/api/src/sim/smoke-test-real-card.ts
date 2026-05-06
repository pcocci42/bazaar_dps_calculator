import { PrismaClient } from "@prisma/client";
import { buildBoardFromCardNames } from "./runtime-card-loader.js";
import { simulateBattle } from "./simulator.js";

const prisma = new PrismaClient();

async function main() {
  const board = await buildBoardFromCardNames(
    [
      {
        name: "Aerial Turret",
        tier: "Diamond",
        slotIndex: 0,
      },
    ],
    {
      prisma,
      source: "MOBALYTICS",
    }
  );

  console.log("=== Loaded Runtime Board ===");

  for (const slot of board) {
    console.log({
      slotIndex: slot.slotIndex,
      name: slot.item.name,
      tier: slot.item.tier,
      hero: slot.item.hero,
      size: slot.item.size,
      tags: slot.item.tags,
      cooldown: slot.item.baseCooldownSeconds,
      ammo: slot.item.baseAmmo,
      multicast: slot.item.baseMulticast,
      critChance: slot.item.baseCritChance,
      effects: slot.item.effects.map((effect) => ({
        kind: effect.kind,
        target: effect.target,
        value: effect.value,
        unit: effect.unit,
        operation: effect.operation,
        condition: effect.condition,
        rawText: effect.rawText,
      })),
    });
  }

  const result = simulateBattle(board, {
    durationSeconds: 10,
    tickSeconds: 0.05,
    enemyMaxHealth: 5000,
  });

  console.log("\n=== Real Card Smoke Test Result ===");
  console.log(`DPS: ${result.dps}`);
  console.log(result.totals);

  console.log("\n=== Final Player State ===");
  console.log(result.finalState.player);

  console.log("\n=== Final Enemy State ===");
  console.log(result.finalState.enemy);

  console.log("\n=== Events ===");
  for (const event of result.events.slice(0, 80)) {
    console.log(`[${event.time.toFixed(2)}s] ${event.type}: ${event.message}`);
  }

  if (result.events.length > 80) {
    console.log(`... ${result.events.length - 80} more events`);
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
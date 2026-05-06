import { simulateBattle } from "./simulator.js";
import type { BoardSlot, RuntimeEffect } from "./types.js";

function effect(input: Partial<RuntimeEffect> & Pick<RuntimeEffect, "kind" | "rawText">): RuntimeEffect {
  return {
    kind: input.kind,
    target: input.target ?? "ENEMY",
    targetFilter: input.targetFilter ?? null,
    attribute: input.attribute ?? null,
    resource: input.resource ?? null,
    value: input.value ?? null,
    unit: input.unit ?? null,
    durationSeconds: input.durationSeconds ?? null,
    count: input.count ?? null,
    operation: input.operation ?? "SET",
    condition: input.condition ?? null,
    formula: input.formula ?? null,
    metadata: input.metadata ?? null,
    isCombatOnly: input.isCombatOnly ?? true,
    isPermanent: input.isPermanent ?? false,
    rawText: input.rawText,
  };
}

const board: BoardSlot[] = [
  {
    slotIndex: 0,
    item: {
      cardId: "test-weapon",
      name: "Test Weapon",
      hero: null,
      size: "Small",
      tags: ["Weapon"],
      tier: "Diamond",
      baseCooldownSeconds: 1,
      baseAmmo: null,
      baseMulticast: 1,
      baseCritChance: 0,
      effects: [
        effect({
          kind: "DAMAGE",
          target: "ENEMY",
          attribute: "Damage",
          value: 100,
          rawText: "Deal 100 Damage",
        }),
      ],
    },
  },
];

const result = simulateBattle(board, {
  durationSeconds: 10,
  tickSeconds: 0.05,
  enemyMaxHealth: 5000,
});

console.log("=== Smoke Test Result ===");
console.log(`DPS: ${result.dps}`);
console.log(result.totals);

console.log("\n=== Final Enemy State ===");
console.log(result.finalState.enemy);

console.log("\n=== Events ===");
for (const event of result.events.slice(0, 30)) {
  console.log(`[${event.time.toFixed(2)}s] ${event.type}: ${event.message}`);
}
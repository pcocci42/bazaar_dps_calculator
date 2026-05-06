import { PrismaClient } from "@prisma/client";
import { buildBoardFromCardNames } from "./runtime-card-loader.js";
import { simulateBattle } from "./simulator.js";
import type {
  BattleEvent,
  BattleEventType,
  BoardSlot,
  SimulationConfig,
  SimulationResult,
} from "./types.js";

const prisma = new PrismaClient();

type ControlledBoardCard = {
  name: string;
  tier: string;
  slotIndex: number;
};

type ControlledBoardTest = {
  name: string;
  cards: ControlledBoardCard[];
  config?: Partial<SimulationConfig>;
  assert: (context: ControlledBoardTestContext) => void;
  notes?: string;
};

type ControlledBoardTestContext = {
  board: BoardSlot[];
  result: SimulationResult;
};

const tests: ControlledBoardTest[] = [
  {
    name: "real controlled DAMAGE",
    cards: [{ name: "Old Saltclaw", tier: "Gold", slotIndex: 0 }],
    config: { durationSeconds: 14, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertGreaterThan("damageDealt", result.totals.damageDealt, 0);
      assertEventExists(result, "DAMAGE_DEALT", { sourceName: "Old Saltclaw" });
    },
  },

  {
    name: "real controlled WEAPON_DAMAGE_MOD affects weapon output",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "28 Hour Fitness", tier: "Gold", slotIndex: 1 },
    ],
    config: { durationSeconds: 14, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      const weapon = findItem(result, "Old Saltclaw");
      assertNotNull("Old Saltclaw runtime item", weapon);
      assertGreaterThan("Old Saltclaw damageBonus", weapon.damageBonus, 0);

      const damageEvent = result.events.find((event) => {
        if (event.type !== "DAMAGE_DEALT") return false;
        const source = event.sourceInstanceId
          ? findItemByInstanceId(result, event.sourceInstanceId)
          : null;
        return source?.name === "Old Saltclaw" && (event.amount ?? 0) > 30;
      });

      if (!damageEvent) {
        throw new Error("Expected Old Saltclaw to deal more than its base 30 damage after Weapon damage mod");
      }
    },
  },
  {
    name: "real controlled SHIELD",
    cards: [{ name: "Security Camera", tier: "Gold", slotIndex: 0 }],
    config: { durationSeconds: 14, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertGreaterThan("shieldGained", result.totals.shieldGained, 0);
      assertEventExists(result, "SHIELD_GAINED", { sourceName: "Security Camera" });
    },
  },
  {
    name: "real controlled HEAL",
    cards: [{ name: "Kukri", tier: "Gold", slotIndex: 0 }],
    config: {
      durationSeconds: 14,
      enemyMaxHealth: 5000,
      playerMaxHealth: 1000,
      playerStartingHealth: 500,
    },
    assert: ({ result }) => {
      assertGreaterThan("healingDone", result.totals.healingDone, 0);
      assertEventExists(result, "HEAL_DONE", { sourceName: "Kukri" });
    },
  },
  {
    name: "real controlled REGEN tick",
    cards: [{ name: "Prep Station", tier: "Gold", slotIndex: 0 }],
    config: {
      durationSeconds: 10,
      enemyMaxHealth: 5000,
      playerMaxHealth: 1000,
      playerStartingHealth: 500,
    },
    assert: ({ result }) => {
      assertGreaterThan("regenGained", result.totals.regenGained, 0);
      assertGreaterThan("regenHealingDone", result.totals.regenHealingDone, 0);
      assertEventExists(result, "REGEN_GAINED", { sourceName: "Prep Station" });
      assertEventExists(result, "REGEN_HEAL_DONE");
    },
  },
  {
    name: "real controlled BURN vs Shield",
    cards: [{ name: "Tinderbox", tier: "Bronze", slotIndex: 0 }],
    config: {
      durationSeconds: 30,
      enemyMaxHealth: 5000,
      enemyStartingShield: 1000,
    },
    assert: ({ result }) => {
      assertGreaterThan("burnApplied", result.totals.burnApplied, 0);
      assertGreaterThan("burnDamageDealt", result.totals.burnDamageDealt, 0);
      assertEqual("enemy health protected by shield", result.finalState.enemy.health, 5000);
      assertLessThan("enemy shield reduced by burn", result.finalState.enemy.shield, 1000);
      assertEventExists(result, "BURN_APPLIED", { sourceName: "Tinderbox" });
      assertEventExists(result, "BURN_DAMAGE_DEALT");
    },
  },
  {
    name: "real controlled POISON bypasses Shield",
    cards: [{ name: "Death Caps", tier: "Gold", slotIndex: 0 }],
    config: {
      durationSeconds: 8,
      enemyMaxHealth: 5000,
      enemyStartingShield: 1000,
    },
    assert: ({ result }) => {
      assertGreaterThan("poisonApplied", result.totals.poisonApplied, 0);
      assertGreaterThan("poisonDamageDealt", result.totals.poisonDamageDealt, 0);
      assertLessThan("enemy health damaged by poison", result.finalState.enemy.health, 5000);
      assertEqual("enemy shield bypassed by poison", result.finalState.enemy.shield, 1000);
      assertEventExists(result, "POISON_APPLIED", { sourceName: "Death Caps" });
      assertEventExists(result, "POISON_DAMAGE_DEALT");
    },
  },
  {
    name: "real controlled HASTE targets item to the left",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "Cloud Wisp", tier: "Gold", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "HASTE_APPLIED", {
        sourceName: "Cloud Wisp",
        targetName: "Old Saltclaw",
      });
    },
  },
  {
    name: "real controlled SLOW targets another item",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "Weather Machine", tier: "Silver", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "SLOW_APPLIED", {
        sourceName: "Weather Machine",
        targetName: "Old Saltclaw",
      });
    },
  },
  {
    name: "real controlled FREEZE targets another item",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "Yeti Crab", tier: "Bronze", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "FREEZE_APPLIED", {
        sourceName: "Yeti Crab",
        targetName: "Old Saltclaw",
      });
    },
  },
  {
    name: "real controlled CHARGE filters Food target",
    cards: [
      { name: "Instant Noodles", tier: "Bronze", slotIndex: 0 },
      { name: "Cutting Board", tier: "Gold", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "CHARGE_APPLIED", {
        sourceName: "Cutting Board",
        targetName: "Instant Noodles",
      });
    },
  },
  {
    name: "real controlled FLYING_START targets adjacent item",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "Anemometer", tier: "Silver", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "FLYING_STARTED", {
        sourceName: "Anemometer",
        targetName: "Old Saltclaw",
      });
      assertItemFlag(result, "Old Saltclaw", "isFlying", true);
    },
  },
  {
    name: "real controlled FLYING_STOP can stop an item that was Flying",
    cards: [{ name: "Clockwork Disc", tier: "Silver", slotIndex: 0 }],
    config: { durationSeconds: 12, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "FLYING_STARTED", {
        sourceName: "Clockwork Disc",
        targetName: "Clockwork Disc",
      });
      assertEventExists(result, "FLYING_STOPPED", {
        sourceName: "Clockwork Disc",
        targetName: "Clockwork Disc",
      });
    },
    notes:
      "Clockwork Disc text is 'starts or stops Flying'; current parser emits both start and stop effects, so this validates runtime stop handling rather than full card semantics.",
  },
  {
    name: "real controlled COOLDOWN_MOD affects adjacent item",
    cards: [
      { name: "Old Saltclaw", tier: "Gold", slotIndex: 0 },
      { name: "Star Chart", tier: "Diamond", slotIndex: 1 },
    ],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      const target = findItem(result, "Old Saltclaw");
      assertNotNull("Old Saltclaw runtime item", target);
      assertNotNull("Old Saltclaw base cooldown", target.baseCooldownSeconds);
      assertNotNull("Old Saltclaw current cooldown", target.cooldownSeconds);
      assertLessThan(
        "Old Saltclaw cooldownSeconds",
        target.cooldownSeconds,
        target.baseCooldownSeconds
      );
    },
  },
  {
    name: "real controlled MULTICAST_MOD updates self multicast",
    cards: [
      { name: "Instant Noodles", tier: "Bronze", slotIndex: 0 },
      { name: "Skillet", tier: "Gold", slotIndex: 1 },
    ],
    config: { durationSeconds: 12, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      const skillet = findItem(result, "Skillet");
      assertNotNull("Skillet runtime item", skillet);
      assertGreaterThan("Skillet multicast", skillet.multicast, 1);
    },
  },
  {
    name: "real controlled RELOAD restores ammo",
    cards: [{ name: "Infinite Potion", tier: "Silver", slotIndex: 0 }],
    config: { durationSeconds: 12, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "RELOAD_DONE", { sourceName: "Infinite Potion" });
    },
  },
  {
    name: "real controlled DESTROY stops future uses",
    cards: [{ name: "Fire Bomb", tier: "Diamond", slotIndex: 0 }],
    config: { durationSeconds: 18, enemyMaxHealth: 5000 },
    assert: ({ result }) => {
      assertEventExists(result, "ITEM_DESTROYED", {
        sourceName: "Fire Bomb",
        targetName: "Fire Bomb",
      });
      assertItemFlag(result, "Fire Bomb", "isDestroyed", true);
    },
  },
];

async function main() {
  let passed = 0;
  let failed = 0;

  console.log("=== Real Controlled Board Suite ===");

  for (const test of tests) {
    try {
      const board = await buildBoardFromCardNames(test.cards, {
        prisma,
        source: "MOBALYTICS",
      });

      const result = simulateBattle(board, {
        durationSeconds: 18,
        tickSeconds: 0.05,
        enemyMaxHealth: 5000,
        ...test.config,
      });

      test.assert({ board, result });
      passed += 1;

      console.log(
        `PASS ${test.name} | DPS ${round(result.dps)} | events ${result.events.length}`
      );

      if (test.notes) {
        console.log(`  note: ${test.notes}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${test.name}`);
      console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed}/${tests.length} real controlled board tests passed.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function assertEventExists(
  result: SimulationResult,
  type: BattleEventType,
  filters: { sourceName?: string; targetName?: string } = {}
): BattleEvent {
  const event = result.events.find((candidate) => {
    if (candidate.type !== type) return false;

    if (filters.sourceName) {
      const source = candidate.sourceInstanceId
        ? findItemByInstanceId(result, candidate.sourceInstanceId)
        : null;
      if (source?.name !== filters.sourceName) return false;
    }

    if (filters.targetName) {
      const target = candidate.targetInstanceId
        ? findItemByInstanceId(result, candidate.targetInstanceId)
        : null;
      if (target?.name !== filters.targetName) return false;
    }

    return true;
  });

  if (!event) {
    const filterText = [
      filters.sourceName ? `source=${filters.sourceName}` : null,
      filters.targetName ? `target=${filters.targetName}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Expected event ${type}${filterText ? ` (${filterText})` : ""}. Seen events: ${summarizeEvents(result)}`
    );
  }

  return event;
}

function assertItemFlag(
  result: SimulationResult,
  itemName: string,
  flag: "isFlying" | "isDestroyed",
  expected: boolean
): void {
  const runtimeItem = findItem(result, itemName);
  assertNotNull(`${itemName} runtime item`, runtimeItem);

  if (runtimeItem[flag] !== expected) {
    throw new Error(
      `${itemName}.${flag}: expected ${expected}, got ${runtimeItem[flag]}`
    );
  }
}

function assertGreaterThan(label: string, actual: number, expectedExclusive: number): void {
  if (!(actual > expectedExclusive)) {
    throw new Error(`${label}: expected > ${expectedExclusive}, got ${actual}`);
  }
}

function assertLessThan(label: string, actual: number, expectedExclusive: number): void {
  if (!(actual < expectedExclusive)) {
    throw new Error(`${label}: expected < ${expectedExclusive}, got ${actual}`);
  }
}

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertNotNull<T>(label: string, value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${label}: expected value, got ${String(value)}`);
  }
}

function findItem(result: SimulationResult, name: string) {
  return result.finalState.items.find((item) => item.name === name) ?? null;
}

function findItemByInstanceId(result: SimulationResult, instanceId: string) {
  return result.finalState.items.find((item) => item.instanceId === instanceId) ?? null;
}

function summarizeEvents(result: SimulationResult): string {
  const uniqueTypes = result.events
    .map((event) => event.type)
    .filter((value, index, array) => array.indexOf(value) === index);

  return uniqueTypes.join(", ");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

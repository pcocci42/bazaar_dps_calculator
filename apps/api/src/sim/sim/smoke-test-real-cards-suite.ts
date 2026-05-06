import { PrismaClient } from "@prisma/client";
import { buildBoardFromCardNames } from "./runtime-card-loader.js";
import { simulateBattle } from "./simulator.js";
import type { BattleEventType, RuntimeEffect, SimulationResult } from "./types.js";

const prisma = new PrismaClient();

type RealEffectKindCase = {
  kind: RuntimeEffect["kind"];
  label: string;
  preferredCardNames?: string[];
  validator: (result: SimulationResult) => boolean;
  explainFailure: (result: SimulationResult) => string;
};

type SelectedRealCard = {
  name: string;
  tier: string;
  rawText: string;
  cooldown: number | null;
};

const cases: RealEffectKindCase[] = [
  {
    kind: "DAMAGE",
    label: "real DAMAGE",
    preferredCardNames: ["Aerial Turret", "Old Saltclaw", "Primal Core"],
    validator: (result) => result.totals.damageDealt > 0,
    explainFailure: (result) => `Expected damageDealt > 0, got ${result.totals.damageDealt}`,
  },
  {
    kind: "BURN",
    label: "real BURN",
    preferredCardNames: ["Tinderbox", "Grill", "Launch Pad", "Mantis Shrimp"],
    validator: (result) => result.totals.burnApplied > 0 && result.totals.burnDamageDealt > 0,
    explainFailure: (result) =>
      `Expected burnApplied and burnDamageDealt > 0, got burnApplied=${result.totals.burnApplied}, burnDamageDealt=${result.totals.burnDamageDealt}`,
  },
  {
    kind: "POISON",
    label: "real POISON",
    preferredCardNames: ["Death Caps", "Catfish", "Rapid Injection System"],
    validator: (result) =>
      result.totals.poisonApplied > 0 && result.totals.poisonDamageDealt > 0,
    explainFailure: (result) =>
      `Expected poisonApplied and poisonDamageDealt > 0, got poisonApplied=${result.totals.poisonApplied}, poisonDamageDealt=${result.totals.poisonDamageDealt}`,
  },
  {
    kind: "SHIELD",
    label: "real SHIELD",
    preferredCardNames: ["Security Camera", "Blueberry Pie"],
    validator: (result) => result.totals.shieldGained > 0,
    explainFailure: (result) => `Expected shieldGained > 0, got ${result.totals.shieldGained}`,
  },
  {
    kind: "HEAL",
    label: "real HEAL",
    preferredCardNames: ["Kukri", "Snow Wisp"],
    validator: (result) => hasEvent(result, "HEAL_DONE"),
    explainFailure: () => "Expected at least one HEAL_DONE event",
  },
  {
    kind: "REGEN",
    label: "real REGEN",
    preferredCardNames: ["Instant Noodles", "Gland", "Luau"],
    validator: (result) => result.totals.regenGained > 0,
    explainFailure: (result) => `Expected regenGained > 0, got ${result.totals.regenGained}`,
  },
  {
    kind: "HASTE",
    label: "real HASTE",
    preferredCardNames: ["Pylon", "Astrolabe", "Cloud Wisp"],
    validator: (result) => hasEvent(result, "HASTE_APPLIED"),
    explainFailure: () => "Expected at least one HASTE_APPLIED event",
  },
  {
    kind: "SLOW",
    label: "real SLOW",
    preferredCardNames: ["Bear Trap", "Barbed Wire", "Integrated HUD"],
    validator: (result) => hasEvent(result, "SLOW_APPLIED"),
    explainFailure: () => "Expected at least one SLOW_APPLIED event",
  },
  {
    kind: "FREEZE",
    label: "real FREEZE",
    preferredCardNames: ["Yeti Crab", "Igloo", "Rainbow Potion"],
    validator: (result) => hasEvent(result, "FREEZE_APPLIED"),
    explainFailure: () => "Expected at least one FREEZE_APPLIED event",
  },
  {
    kind: "CHARGE",
    label: "real CHARGE",
    preferredCardNames: ["Solar Farm", "Spider Mace", "Fairies", "Ignition Core"],
    validator: (result) => hasEvent(result, "CHARGE_APPLIED"),
    explainFailure: () => "Expected at least one CHARGE_APPLIED event",
  },
  {
    kind: "FLYING_START",
    label: "real FLYING_START",
    preferredCardNames: ["Cosmic Amulet", "Dragon Wing", "Propeller", "Anemometer"],
    validator: (result) => hasEvent(result, "FLYING_STARTED"),
    explainFailure: () => "Expected at least one FLYING_STARTED event",
  },
  {
    kind: "FLYING_STOP",
    label: "real FLYING_STOP loaded",
    preferredCardNames: ["Clockwork Disc", "Flying Pig", "MagShield"],
    validator: (result) =>
      result.finalState.items.some((item) =>
        item.effects.some((effect) => effect.kind === "FLYING_STOP")
      ),
    explainFailure: () =>
      "Expected runtime item to contain at least one FLYING_STOP effect. Note: a stop event needs an already-Flying target.",
  },
  {
    kind: "COOLDOWN_MOD",
    label: "real COOLDOWN_MOD",
    preferredCardNames: ["Aerial Turret", "Star Chart", "Nanobot Blue"],
    validator: (result) =>
      result.finalState.items.some(
        (item) =>
          item.baseCooldownSeconds !== null &&
          item.cooldownSeconds !== null &&
          item.cooldownSeconds !== item.baseCooldownSeconds
      ),
    explainFailure: (result) => {
      const item = result.finalState.items[0];
      return `Expected cooldownSeconds to change. base=${item?.baseCooldownSeconds}, current=${item?.cooldownSeconds}`;
    },
  },
  {
    kind: "MULTICAST_MOD",
    label: "real MULTICAST_MOD",
    preferredCardNames: ["Skillet", "Skyscraper", "Stretch Pants"],
    validator: (result) =>
      result.finalState.items.some((item) => item.multicast > (item.effects.length ? 1 : 0)),
    explainFailure: (result) => {
      const item = result.finalState.items[0];
      return `Expected multicast to increase, got ${item?.multicast}`;
    },
  },
  {
    kind: "RELOAD",
    label: "real RELOAD",
    preferredCardNames: ["Cellar", "Healing Draught", "Air-Pressure Rifle"],
    validator: (result) => hasEvent(result, "RELOAD_DONE"),
    explainFailure: () => "Expected at least one RELOAD_DONE event",
  },
  {
    kind: "DESTROY",
    label: "real DESTROY",
    preferredCardNames: ["Leather Jacket", "Fire Bomb", "Oblivion Vortex"],
    validator: (result) => hasEvent(result, "ITEM_DESTROYED"),
    explainFailure: () => "Expected at least one ITEM_DESTROYED event",
  },
];

async function main() {
  let passed = 0;
  let failed = 0;

  console.log("=== Real Cards Runtime Suite ===");

  for (const testCase of cases) {
    const selected = await selectCardForKind(testCase);

    if (!selected) {
      failed += 1;
      console.log(`FAIL ${testCase.label} | no suitable real card found`);
      continue;
    }

    const board = await buildBoardFromCardNames(
      [
        {
          name: selected.name,
          tier: selected.tier,
          slotIndex: 0,
        },
      ],
      {
        prisma,
        source: "MOBALYTICS",
      }
    );

    const durationSeconds = getDurationSeconds(selected.cooldown);
    const result = simulateBattle(board, {
      durationSeconds,
      tickSeconds: 0.05,
      enemyMaxHealth: 5000,
      enemyStartingShield: testCase.kind === "POISON" ? 1000 : 0,
    });

    const ok = testCase.validator(result);

    if (ok) {
      passed += 1;
      console.log(
        `PASS ${testCase.label} | ${selected.name} ${selected.tier} | DPS ${round(result.dps)} | ${selected.rawText}`
      );
    } else {
      failed += 1;
      console.log(
        `FAIL ${testCase.label} | ${selected.name} ${selected.tier} | ${selected.rawText}`
      );
      console.log(`  ${testCase.explainFailure(result)}`);
      console.log(
        `  Events: ${result.events
          .map((event) => event.type)
          .filter((value, index, array) => array.indexOf(value) === index)
          .join(", ")}`
      );
      console.log(`  Totals: ${JSON.stringify(result.totals)}`);
    }
  }

  console.log(`\n${passed}/${cases.length} real card smoke tests passed.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function selectCardForKind(
  testCase: RealEffectKindCase
): Promise<SelectedRealCard | null> {
  const rows = await prisma.cardEffect.findMany({
    where: {
      kind: testCase.kind,
      cardTier: {
        card: {
          source: "MOBALYTICS",
        },
      },
    },
    include: {
      cardTier: {
        include: {
          card: true,
        },
      },
    },
    take: 200,
  });

  const activeRows = rows.filter((row) => {
    if (row.cardTier.cooldown === null) return false;

    if (testCase.kind !== "FLYING_STOP" && row.condition !== null) {
      return false;
    }

    if (testCase.kind === "RELOAD" && row.cardTier.ammo === null) {
      return false;
    }

    return true;
  });

  const preferred =
    testCase.preferredCardNames
      ?.map((name) =>
        activeRows.find(
          (row) => row.cardTier.card.name.toLowerCase() === name.toLowerCase()
        )
      )
      .find(Boolean) ?? null;

  const selected = preferred ?? activeRows[0];

  if (!selected) return null;

  return {
    name: selected.cardTier.card.name,
    tier: selected.cardTier.tier,
    rawText: selected.rawText,
    cooldown: selected.cardTier.cooldown,
  };
}

function hasEvent(result: SimulationResult, type: BattleEventType): boolean {
  return result.events.some((event) => event.type === type);
}

function getDurationSeconds(cooldown: number | null): number {
  if (cooldown === null) return 12;

  return Math.max(12, Math.ceil(cooldown * 3 + 3));
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
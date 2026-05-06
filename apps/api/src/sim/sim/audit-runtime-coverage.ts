import { PrismaClient } from "@prisma/client";
import { isSupportedRuntimeFormula } from "./formula-resolver.js";

const prisma = new PrismaClient();

const SOURCE = process.env.SIM_AUDIT_SOURCE ?? "MOBALYTICS";
const SAMPLE_LIMIT_PER_REASON = Number(process.env.SIM_AUDIT_SAMPLE_LIMIT ?? 8);

const CORE_COMBAT_KINDS = new Set([
  "DAMAGE",
  "SHIELD",
  "HEAL",
  "BURN",
  "POISON",
  "REGEN",
  "HASTE",
  "SLOW",
  "FREEZE",
  "CHILL",
  "HEAT",
  "INVULNERABILITY",
  "CHARGE",
  "RELOAD",
  "DESTROY",
  "REPAIR",
  "FLYING_START",
  "FLYING_STOP",
  "COOLDOWN_MOD",
  "MULTICAST_MOD",
  "CRIT_CHANCE_MOD",
  "MAX_HEALTH_MOD",
  "MAX_AMMO_MOD",
  "AMMO_MOD",
  "RAGE",
]);

const CONFIGURABLE_KINDS = new Set([
  "ENCHANT",
  "TRANSFORM",
  "UPGRADE",
  "TAG_MOD",
  "VALUE_MOD",
  "INCOME_MOD",
  "RESOURCE_GAIN",
  "EVENT_TRIGGER",
  "IMMUNITY",
  "CRIT_DAMAGE_MOD",
  "LIFESTEAL_MOD",
]);

const NON_COMBAT_KINDS = new Set([
  "SHOP_MOD",
  "PRESTIGE",
  "TEMPLATE",
]);

const PARTIAL_COMBAT_KINDS = new Set([
  "USE_TRIGGER",
  "TRIGGER",
]);

const TRULY_UNSUPPORTED_KINDS = new Set([
  "OTHER",
]);

type RuntimeCoverageClass =
  | "SUPPORTED_COMBAT"
  | "PARTIAL_COMBAT"
  | "CONFIGURABLE"
  | "ENEMY_PROXY"
  | "NON_COMBAT"
  | "UNSUPPORTED";

type EffectRecord = {
  id: string;
  kind: string;
  target: string;
  targetFilter: string | null;
  attribute: string | null;
  resource: string | null;
  value: number | null;
  unit: string | null;
  durationSeconds: number | null;
  count: number | null;
  operation: string;
  condition: string | null;
  formula: string | null;
  metadata: unknown;
  isCombatOnly: boolean;
  isPermanent: boolean;
  rawText: string;
  cardTier: {
    tier: string;
    cooldown: number | null;
    card: {
      name: string;
      hero: string | null;
      type: string | null;
      size: string | null;
    };
  };
};

type EffectAssessment = {
  coverageClass: RuntimeCoverageClass;
  reasons: string[];
};

type TierAssessment = {
  coverageClass: RuntimeCoverageClass;
  reasons: Set<string>;
  effectClasses: Record<RuntimeCoverageClass, number>;
};

type ReasonSample = {
  cardName: string;
  tier: string;
  kind: string;
  rawText: string;
};

const EMPTY_CLASS_COUNTS: Record<RuntimeCoverageClass, number> = {
  SUPPORTED_COMBAT: 0,
  PARTIAL_COMBAT: 0,
  CONFIGURABLE: 0,
  ENEMY_PROXY: 0,
  NON_COMBAT: 0,
  UNSUPPORTED: 0,
};

function assessEffect(effect: EffectRecord): EffectAssessment {
  const reasons: string[] = [];

  if (TRULY_UNSUPPORTED_KINDS.has(effect.kind) || isUnknownKind(effect.kind)) {
    return {
      coverageClass: "UNSUPPORTED",
      reasons: [`unsupported or unknown effect kind: ${effect.kind}`],
    };
  }

  if (isEnemyBoardTarget(effect.target)) {
    return {
      coverageClass: "ENEMY_PROXY",
      reasons: ["enemy board target is modeled as proxy/aggregate only"],
    };
  }

  if (isConfigurableEffect(effect)) {
    return {
      coverageClass: "CONFIGURABLE",
      reasons: [configurableReason(effect)],
    };
  }

  if (isNonCombatEffect(effect)) {
    return {
      coverageClass: "NON_COMBAT",
      reasons: [nonCombatReason(effect)],
    };
  }

  if (PARTIAL_COMBAT_KINDS.has(effect.kind)) {
    return {
      coverageClass: "PARTIAL_COMBAT",
      reasons: [`partial combat effect kind: ${effect.kind}`],
    };
  }

  if (!CORE_COMBAT_KINDS.has(effect.kind)) {
    return {
      coverageClass: "UNSUPPORTED",
      reasons: [`unknown runtime category for effect kind: ${effect.kind}`],
    };
  }

  if (effect.target === "UNKNOWN") {
    reasons.push("target is UNKNOWN and inferred from raw text");
  }

  if (effect.targetFilter && !isRuntimeSupportedTargetFilter(effect)) {
    reasons.push(`target filter needs unsupported board/tag resolution: ${effect.targetFilter}`);
  }

  if (effect.condition && !isRuntimeSupportedCondition(effect.condition)) {
    reasons.push(`complex combat condition: ${effect.condition}`);
  }

  const supportedRuntimeFormula = isSupportedRuntimeFormula(effect);

  if (hasScalingLanguage(effect) && !supportedRuntimeFormula) {
    reasons.push("scaling/formula language needs card-specific validation");
  }

  if (effect.value === null && requiresNumericValue(effect.kind) && !supportedRuntimeFormula) {
    reasons.push("numeric runtime value is missing");
  }

  if (hasDynamicMetadata(effect.metadata) && !supportedRuntimeFormula) {
    reasons.push("dynamic metadata needs downstream runtime support");
  }

  if (isPlayerBoardPermanentCombatEffect(effect)) {
    reasons.push("permanent combat effect should be supplied as pre-fight configuration");
  }

  if (reasons.length > 0) {
    return {
      coverageClass: "PARTIAL_COMBAT",
      reasons,
    };
  }

  return {
    coverageClass: "SUPPORTED_COMBAT",
    reasons: ["player-board combat runtime supported"],
  };
}

function assessTier(effects: EffectRecord[]): TierAssessment {
  const reasons = new Set<string>();
  const effectClasses = { ...EMPTY_CLASS_COUNTS };

  if (effects.length === 0) {
    return {
      coverageClass: "UNSUPPORTED",
      reasons: new Set(["tier has no parsed runtime effects"]),
      effectClasses,
    };
  }

  for (const effect of effects) {
    const assessment = assessEffect(effect);
    effectClasses[assessment.coverageClass] += 1;

    for (const reason of assessment.reasons) {
      if (reason !== "player-board combat runtime supported") {
        reasons.add(reason);
      }
    }
  }

  const coverageClass = dominantClass(effectClasses);

  if (reasons.size === 0) {
    reasons.add("all combat effects are player-board runtime-supported");
  }

  return {
    coverageClass,
    reasons,
    effectClasses,
  };
}

async function main() {
  const cardTiers = await prisma.cardTier.findMany({
    where: {
      card: {
        source: SOURCE,
      },
    },
    include: {
      card: true,
      effects: true,
    },
    orderBy: [
      {
        card: {
          name: "asc",
        },
      },
      {
        tier: "asc",
      },
    ],
  });

  const cardIdsByClass: Record<RuntimeCoverageClass, Set<string>> = {
    SUPPORTED_COMBAT: new Set(),
    PARTIAL_COMBAT: new Set(),
    CONFIGURABLE: new Set(),
    ENEMY_PROXY: new Set(),
    NON_COMBAT: new Set(),
    UNSUPPORTED: new Set(),
  };

  const tierCounts = { ...EMPTY_CLASS_COUNTS };
  const effectCounts = { ...EMPTY_CLASS_COUNTS };
  const effectsByKind = new Map<string, Record<RuntimeCoverageClass, number>>();
  const reasonCounts = new Map<string, number>();
  const reasonSamples = new Map<string, ReasonSample[]>();
  const tiersByCard = new Map<string, RuntimeCoverageClass[]>();

  for (const cardTier of cardTiers) {
    const effects = cardTier.effects.map((effect) => ({
      ...effect,
      cardTier: {
        tier: cardTier.tier,
        cooldown: cardTier.cooldown,
        card: {
          name: cardTier.card.name,
          hero: cardTier.card.hero,
          type: cardTier.card.type,
          size: cardTier.card.size,
        },
      },
    })) as EffectRecord[];

    const tierAssessment = assessTier(effects);
    tierCounts[tierAssessment.coverageClass] += 1;

    if (!tiersByCard.has(cardTier.cardId)) {
      tiersByCard.set(cardTier.cardId, []);
    }
    tiersByCard.get(cardTier.cardId)!.push(tierAssessment.coverageClass);

    for (const effect of effects) {
      const assessment = assessEffect(effect);
      effectCounts[assessment.coverageClass] += 1;

      if (!effectsByKind.has(effect.kind)) {
        effectsByKind.set(effect.kind, { ...EMPTY_CLASS_COUNTS });
      }
      effectsByKind.get(effect.kind)![assessment.coverageClass] += 1;

      for (const reason of assessment.reasons) {
        if (reason === "player-board combat runtime supported") continue;

        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

        const samples = reasonSamples.get(reason) ?? [];
        if (samples.length < SAMPLE_LIMIT_PER_REASON) {
          samples.push({
            cardName: cardTier.card.name,
            tier: cardTier.tier,
            kind: effect.kind,
            rawText: effect.rawText,
          });
          reasonSamples.set(reason, samples);
        }
      }
    }
  }

  for (const [cardId, classes] of tiersByCard.entries()) {
    const cardClass = dominantClassFromList(classes);
    cardIdsByClass[cardClass].add(cardId);
  }

  const totalCards = tiersByCard.size;
  const totalTiers = cardTiers.length;
  const totalEffects = sumClasses(effectCounts);

  console.log("=== Bazaar Runtime Classification Audit ===");
  console.log(`Source: ${SOURCE}`);
  console.log("");

  printClassBlock("Cards", totalCards, classSetCounts(cardIdsByClass));
  printClassBlock("Card tiers", totalTiers, tierCounts);
  printClassBlock("Card effects", totalEffects, effectCounts);

  printCombatReadiness(effectCounts);

  console.log("\n=== Classification by effect kind ===");
  for (const [kind, counts] of [...effectsByKind.entries()].sort((a, b) => sumClasses(b[1]) - sumClasses(a[1]))) {
    const total = sumClasses(counts);
    console.log(
      `${kind.padEnd(18)} total=${String(total).padStart(4)} supported=${String(counts.SUPPORTED_COMBAT).padStart(4)} partial=${String(counts.PARTIAL_COMBAT).padStart(4)} configurable=${String(counts.CONFIGURABLE).padStart(4)} enemyProxy=${String(counts.ENEMY_PROXY).padStart(4)} nonCombat=${String(counts.NON_COMBAT).padStart(4)} unsupported=${String(counts.UNSUPPORTED).padStart(4)}`
    );
  }

  console.log("\n=== Top non-supported reasons ===");
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`${String(count).padStart(5)}  ${reason}`);
  }

  console.log("\n=== Samples by reason ===");
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`\n${reason} (${count})`);
    const samples = reasonSamples.get(reason) ?? [];
    for (const sample of samples) {
      console.log(`- ${sample.cardName} (${sample.tier}) [${sample.kind}] ${sample.rawText}`);
    }
  }
}

function printClassBlock(label: string, total: number, counts: Record<RuntimeCoverageClass, number>) {
  console.log(`=== ${label} ===`);
  console.log(`Total:             ${total}`);
  console.log(`Supported combat:  ${counts.SUPPORTED_COMBAT} (${formatPercent(counts.SUPPORTED_COMBAT, total)})`);
  console.log(`Partial combat:    ${counts.PARTIAL_COMBAT} (${formatPercent(counts.PARTIAL_COMBAT, total)})`);
  console.log(`Configurable/UI:   ${counts.CONFIGURABLE} (${formatPercent(counts.CONFIGURABLE, total)})`);
  console.log(`Enemy proxy:       ${counts.ENEMY_PROXY} (${formatPercent(counts.ENEMY_PROXY, total)})`);
  console.log(`Non-combat/meta:   ${counts.NON_COMBAT} (${formatPercent(counts.NON_COMBAT, total)})`);
  console.log(`Unsupported:       ${counts.UNSUPPORTED} (${formatPercent(counts.UNSUPPORTED, total)})`);
  console.log("");
}

function printCombatReadiness(effectCounts: Record<RuntimeCoverageClass, number>) {
  const combatTotal = effectCounts.SUPPORTED_COMBAT + effectCounts.PARTIAL_COMBAT;
  const modeledTotal =
    effectCounts.SUPPORTED_COMBAT +
    effectCounts.PARTIAL_COMBAT +
    effectCounts.CONFIGURABLE +
    effectCounts.ENEMY_PROXY +
    effectCounts.NON_COMBAT;
  const total = modeledTotal + effectCounts.UNSUPPORTED;

  console.log("=== Runtime readiness summary ===");
  console.log(
    `Player-board combat supported: ${effectCounts.SUPPORTED_COMBAT}/${combatTotal} (${formatPercent(effectCounts.SUPPORTED_COMBAT, combatTotal)})`
  );
  console.log(
    `Modeled or intentionally classified: ${modeledTotal}/${total} (${formatPercent(modeledTotal, total)})`
  );
  console.log(
    `Truly unsupported: ${effectCounts.UNSUPPORTED}/${total} (${formatPercent(effectCounts.UNSUPPORTED, total)})`
  );
}

function dominantClass(counts: Record<RuntimeCoverageClass, number>): RuntimeCoverageClass {
  return dominantClassFromList(expandClassCounts(counts));
}

function dominantClassFromList(classes: RuntimeCoverageClass[]): RuntimeCoverageClass {
  if (classes.includes("UNSUPPORTED")) return "UNSUPPORTED";
  if (classes.includes("PARTIAL_COMBAT")) return "PARTIAL_COMBAT";
  if (classes.includes("ENEMY_PROXY")) return "ENEMY_PROXY";
  if (classes.includes("CONFIGURABLE")) return "CONFIGURABLE";
  if (classes.includes("NON_COMBAT")) return "NON_COMBAT";
  return "SUPPORTED_COMBAT";
}

function expandClassCounts(counts: Record<RuntimeCoverageClass, number>): RuntimeCoverageClass[] {
  const classes: RuntimeCoverageClass[] = [];
  for (const coverageClass of Object.keys(counts) as RuntimeCoverageClass[]) {
    for (let i = 0; i < counts[coverageClass]; i += 1) {
      classes.push(coverageClass);
    }
  }
  return classes;
}

function classSetCounts(
  sets: Record<RuntimeCoverageClass, Set<string>>
): Record<RuntimeCoverageClass, number> {
  return {
    SUPPORTED_COMBAT: sets.SUPPORTED_COMBAT.size,
    PARTIAL_COMBAT: sets.PARTIAL_COMBAT.size,
    CONFIGURABLE: sets.CONFIGURABLE.size,
    ENEMY_PROXY: sets.ENEMY_PROXY.size,
    NON_COMBAT: sets.NON_COMBAT.size,
    UNSUPPORTED: sets.UNSUPPORTED.size,
  };
}

function sumClasses(counts: Record<RuntimeCoverageClass, number>): number {
  return (
    counts.SUPPORTED_COMBAT +
    counts.PARTIAL_COMBAT +
    counts.CONFIGURABLE +
    counts.ENEMY_PROXY +
    counts.NON_COMBAT +
    counts.UNSUPPORTED
  );
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function isUnknownKind(kind: string): boolean {
  return (
    !CORE_COMBAT_KINDS.has(kind) &&
    !CONFIGURABLE_KINDS.has(kind) &&
    !NON_COMBAT_KINDS.has(kind) &&
    !PARTIAL_COMBAT_KINDS.has(kind) &&
    !TRULY_UNSUPPORTED_KINDS.has(kind)
  );
}

function isConfigurableEffect(effect: EffectRecord): boolean {
  if (CONFIGURABLE_KINDS.has(effect.kind)) return true;
  if (effect.isPermanent) return true;

  const text = effect.rawText.toLowerCase();
  const condition = effect.condition?.toLowerCase() ?? "";

  return (
    condition.includes("when you sell") ||
    condition.includes("when you buy") ||
    condition.includes("at the start of each day") ||
    condition.includes("when this is transformed") ||
    text.includes("permanently") ||
    text.includes("enchant") ||
    text.includes("transform") ||
    text.includes("upgrade")
  );
}

function isNonCombatEffect(effect: EffectRecord): boolean {
  if (NON_COMBAT_KINDS.has(effect.kind)) return true;
  return isEconomyOrShopText(effect.rawText) || isEconomyOrShopText(effect.condition ?? "");
}

function configurableReason(effect: EffectRecord): string {
  if (effect.kind === "ENCHANT") return "configurable effect: enchant should be selected before simulation";
  if (effect.kind === "TRANSFORM") return "configurable effect: transform should be selected before simulation";
  if (effect.kind === "UPGRADE") return "configurable effect: upgrade should be selected before simulation";
  if (effect.kind === "TAG_MOD") return "configurable effect: tag/type mutation should be represented in board setup";
  if (effect.kind === "VALUE_MOD") return "configurable effect: value changes are UI/pre-fight inputs unless used by combat formula";
  if (effect.isPermanent) return "configurable effect: permanent change should be represented in initial board state";
  if (effect.condition?.toLowerCase().includes("when you sell")) return "configurable effect: sell trigger should be toggled/applied by UI";
  if (effect.condition?.toLowerCase().includes("when you buy")) return "configurable effect: buy trigger should be toggled/applied by UI";
  if (effect.condition?.toLowerCase().includes("at the start of each day")) return "configurable effect: day trigger belongs to pre-fight progression/UI";
  return `configurable effect kind: ${effect.kind}`;
}

function nonCombatReason(effect: EffectRecord): string {
  if (effect.kind === "SHOP_MOD") return "non-combat effect: shop/economy modifier";
  if (effect.kind === "PRESTIGE") return "non-combat effect: prestige modifier";
  if (effect.kind === "TEMPLATE") return "non-combat effect: item template metadata";
  return "non-combat/economy text should not run in combat loop";
}

function isRuntimeSupportedTargetFilter(effect: EffectRecord): boolean {
  if (!CORE_COMBAT_KINDS.has(effect.kind)) return false;
  if (!effect.targetFilter) return true;
  if (!isRuntimeItemTarget(effect.target)) return false;

  return /^[A-Za-z][A-Za-z ]*$/.test(effect.targetFilter);
}

function isRuntimeItemTarget(target: string): boolean {
  return (
    target === "SELF" ||
    target === "ADJACENT_ITEM" ||
    target === "ADJACENT_ITEMS" ||
    target === "LEFT_ITEM" ||
    target === "RIGHT_ITEM" ||
    target === "YOUR_ITEM" ||
    target === "YOUR_ITEMS" ||
    target === "YOUR_WEAPONS" ||
    target === "YOUR_SHIELD_ITEMS" ||
    target === "YOUR_HEAL_ITEMS" ||
    target === "YOUR_BURN_ITEMS" ||
    target === "YOUR_POISON_ITEMS" ||
    target === "YOUR_REGEN_ITEMS"
  );
}

function isEnemyBoardTarget(target: string): boolean {
  return target === "ENEMY_ITEM" || target === "ENEMY_ITEMS";
}

function isRuntimeSupportedCondition(condition: string): boolean {
  const lower = condition.toLowerCase();

  return (
    lower.includes("start of each fight") ||
    lower.includes("start of the fight") ||
    lower.startsWith("for each") ||
    lower.includes("this is flying") ||
    lower.includes("this starts flying") ||
    lower.includes("this stops flying") ||
    lower.includes("you use") ||
    lower.includes("uses") ||
    lower.includes("burn") ||
    lower.includes("poison") ||
    lower.includes("haste") ||
    lower.includes("slow") ||
    lower.includes("freeze") ||
    lower.includes("charge") ||
    lower.includes("destroy") ||
    lower.includes("repair") ||
    lower.includes("rage") ||
    lower.includes("enrage") ||
    lower.includes("crit") ||
    lower.includes("heal") ||
    lower.includes("heated") ||
    lower.includes("chilled")
  );
}

function hasScalingLanguage(effect: EffectRecord): boolean {
  const text = `${effect.rawText} ${effect.formula ?? ""}`.toLowerCase();

  return (
    text.includes("equal to") ||
    text.includes("times") ||
    text.includes(" for each ") ||
    text.includes(" for every ") ||
    text.includes("based on") ||
    text.includes("double") ||
    text.includes("triple") ||
    text.includes("quadruple") ||
    text.includes("half as") ||
    text.includes("xx")
  );
}

function requiresNumericValue(kind: string): boolean {
  return (
    kind === "DAMAGE" ||
    kind === "SHIELD" ||
    kind === "HEAL" ||
    kind === "BURN" ||
    kind === "POISON" ||
    kind === "REGEN" ||
    kind === "CHARGE" ||
    kind === "COOLDOWN_MOD" ||
    kind === "MULTICAST_MOD" ||
    kind === "CRIT_CHANCE_MOD" ||
    kind === "MAX_HEALTH_MOD" ||
    kind === "MAX_AMMO_MOD" ||
    kind === "AMMO_MOD" ||
    kind === "RAGE"
  );
}

function hasDynamicMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;

  const serialized = JSON.stringify(metadata).toLowerCase();
  return serialized.includes("dynamic") || serialized.includes("placeholder") || serialized.includes("multiplier");
}

function isEconomyOrShopText(rawText: string): boolean {
  return /merchant|sell|sells|buy|reroll|gold|income|scrap|prestige/i.test(rawText);
}

function isPlayerBoardPermanentCombatEffect(effect: EffectRecord): boolean {
  if (!effect.isPermanent) return false;
  if (isNonCombatEffect(effect) || isConfigurableEffect(effect)) return false;
  return CORE_COMBAT_KINDS.has(effect.kind);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

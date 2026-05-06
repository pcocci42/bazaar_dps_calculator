import { PrismaClient } from "@prisma/client";
import { isSupportedRuntimeFormula } from "./formula-resolver.js";

const prisma = new PrismaClient();

const SOURCE = process.env.SIM_AUDIT_SOURCE ?? "MOBALYTICS";
const SAMPLE_LIMIT_PER_REASON = Number(process.env.SIM_AUDIT_SAMPLE_LIMIT ?? 8);

const FULLY_SUPPORTED_KINDS = new Set([
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
  "RESOURCE_GAIN",
  "RAGE",
]);

const PARTIAL_KINDS = new Set([
  "CRIT_DAMAGE_MOD",
  "VALUE_MOD",
  "INCOME_MOD",
  "TAG_MOD",
  "LIFESTEAL_MOD",
  "EVENT_TRIGGER",
  "USE_TRIGGER",
  "TRIGGER",
  "IMMUNITY",
  "ENCHANT",
  "TRANSFORM",
  "UPGRADE",
]);

const UNSUPPORTED_KINDS = new Set([
  "SHOP_MOD",
  "PRESTIGE",
  "TEMPLATE",
  "OTHER",
]);

type CoverageStatus = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";

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
  status: CoverageStatus;
  reasons: string[];
};

type TierAssessment = {
  status: CoverageStatus;
  reasons: Set<string>;
  effectStatuses: Record<CoverageStatus, number>;
};

type ReasonSample = {
  cardName: string;
  tier: string;
  kind: string;
  rawText: string;
};

function assessEffect(effect: EffectRecord): EffectAssessment {
  const reasons: string[] = [];
  let status: CoverageStatus = "SUPPORTED";

  if (UNSUPPORTED_KINDS.has(effect.kind)) {
    status = maxStatus(status, "UNSUPPORTED");
    reasons.push(`unsupported effect kind: ${effect.kind}`);
  } else if (PARTIAL_KINDS.has(effect.kind)) {
    status = maxStatus(status, "PARTIAL");
    reasons.push(`partial effect kind: ${effect.kind}`);
  } else if (!FULLY_SUPPORTED_KINDS.has(effect.kind)) {
    status = maxStatus(status, "UNSUPPORTED");
    reasons.push(`unknown effect kind: ${effect.kind}`);
  }

  if (isEnemyBoardTarget(effect.target)) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("enemy board target is proxied or aggregate-only");
  }

  if (effect.target === "UNKNOWN") {
    status = maxStatus(status, "PARTIAL");
    reasons.push("target is UNKNOWN and inferred from raw text");
  }

  if (effect.targetFilter && !isRuntimeSupportedTargetFilter(effect)) {
    status = maxStatus(status, "PARTIAL");
    reasons.push(`target filter requires board/tag resolution: ${effect.targetFilter}`);
  }

  if (effect.condition && !isRuntimeSupportedCondition(effect.condition)) {
    status = maxStatus(status, "PARTIAL");
    reasons.push(`complex condition: ${effect.condition}`);
  }

  const supportedRuntimeFormula = isSupportedRuntimeFormula(effect);

  if (hasScalingLanguage(effect) && !supportedRuntimeFormula) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("scaling/formula language needs card-specific validation");
  }

  if (effect.value === null && requiresNumericValue(effect.kind) && !supportedRuntimeFormula) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("numeric runtime value is missing");
  }

  if (effect.isPermanent) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("permanent effect needs multi-fight persistence");
  }

  if (hasDynamicMetadata(effect.metadata) && !supportedRuntimeFormula) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("dynamic metadata needs downstream runtime support");
  }

  if (isEconomyOrShopText(effect.rawText)) {
    status = maxStatus(status, "PARTIAL");
    reasons.push("shop/economy text is not combat-accurate yet");
  }

  if (reasons.length === 0) {
    reasons.push("core runtime effect supported");
  }

  return { status, reasons };
}

function assessTier(effects: EffectRecord[]): TierAssessment {
  const reasons = new Set<string>();
  const effectStatuses: Record<CoverageStatus, number> = {
    SUPPORTED: 0,
    PARTIAL: 0,
    UNSUPPORTED: 0,
  };

  let status: CoverageStatus = "SUPPORTED";

  if (effects.length === 0) {
    return {
      status: "UNSUPPORTED",
      reasons: new Set(["tier has no parsed runtime effects"]),
      effectStatuses,
    };
  }

  for (const effect of effects) {
    const assessment = assessEffect(effect);
    effectStatuses[assessment.status] += 1;
    status = maxStatus(status, assessment.status);

    for (const reason of assessment.reasons) {
      if (reason !== "core runtime effect supported") {
        reasons.add(reason);
      }
    }
  }

  if (reasons.size === 0) {
    reasons.add("all effects are core runtime-supported");
  }

  return {
    status,
    reasons,
    effectStatuses,
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

  const cardIdsByStatus: Record<CoverageStatus, Set<string>> = {
    SUPPORTED: new Set(),
    PARTIAL: new Set(),
    UNSUPPORTED: new Set(),
  };

  const tierCounts: Record<CoverageStatus, number> = {
    SUPPORTED: 0,
    PARTIAL: 0,
    UNSUPPORTED: 0,
  };

  const effectCounts: Record<CoverageStatus, number> = {
    SUPPORTED: 0,
    PARTIAL: 0,
    UNSUPPORTED: 0,
  };

  const effectsByKind = new Map<string, Record<CoverageStatus, number>>();
  const reasonCounts = new Map<string, number>();
  const reasonSamples = new Map<string, ReasonSample[]>();
  const tiersByCard = new Map<string, CoverageStatus[]>();

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
    tierCounts[tierAssessment.status] += 1;

    if (!tiersByCard.has(cardTier.cardId)) {
      tiersByCard.set(cardTier.cardId, []);
    }
    tiersByCard.get(cardTier.cardId)!.push(tierAssessment.status);

    for (const effect of effects) {
      const assessment = assessEffect(effect);
      effectCounts[assessment.status] += 1;

      if (!effectsByKind.has(effect.kind)) {
        effectsByKind.set(effect.kind, {
          SUPPORTED: 0,
          PARTIAL: 0,
          UNSUPPORTED: 0,
        });
      }
      effectsByKind.get(effect.kind)![assessment.status] += 1;

      for (const reason of assessment.reasons) {
        if (reason === "core runtime effect supported") continue;

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

  for (const [cardId, statuses] of tiersByCard.entries()) {
    const cardStatus = statuses.reduce<CoverageStatus>(
      (current, next) => maxStatus(current, next),
      "SUPPORTED"
    );
    cardIdsByStatus[cardStatus].add(cardId);
  }

  const totalCards = tiersByCard.size;
  const totalTiers = cardTiers.length;
  const totalEffects = effectCounts.SUPPORTED + effectCounts.PARTIAL + effectCounts.UNSUPPORTED;

  console.log("=== Bazaar Runtime Coverage Audit ===");
  console.log(`Source: ${SOURCE}`);
  console.log("");

  printStatusBlock("Cards", {
    total: totalCards,
    supported: cardIdsByStatus.SUPPORTED.size,
    partial: cardIdsByStatus.PARTIAL.size,
    unsupported: cardIdsByStatus.UNSUPPORTED.size,
  });

  printStatusBlock("Card tiers", {
    total: totalTiers,
    supported: tierCounts.SUPPORTED,
    partial: tierCounts.PARTIAL,
    unsupported: tierCounts.UNSUPPORTED,
  });

  printStatusBlock("Card effects", {
    total: totalEffects,
    supported: effectCounts.SUPPORTED,
    partial: effectCounts.PARTIAL,
    unsupported: effectCounts.UNSUPPORTED,
  });

  console.log("\n=== Coverage by effect kind ===");
  for (const [kind, counts] of [...effectsByKind.entries()].sort((a, b) => {
    const aTotal = a[1].SUPPORTED + a[1].PARTIAL + a[1].UNSUPPORTED;
    const bTotal = b[1].SUPPORTED + b[1].PARTIAL + b[1].UNSUPPORTED;
    return bTotal - aTotal;
  })) {
    const total = counts.SUPPORTED + counts.PARTIAL + counts.UNSUPPORTED;
    console.log(
      `${kind.padEnd(18)} total=${String(total).padStart(4)} supported=${String(counts.SUPPORTED).padStart(4)} partial=${String(counts.PARTIAL).padStart(4)} unsupported=${String(counts.UNSUPPORTED).padStart(4)}`
    );
  }

  console.log("\n=== Top partial/unsupported reasons ===");
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

function printStatusBlock(
  label: string,
  counts: { total: number; supported: number; partial: number; unsupported: number }
) {
  console.log(`=== ${label} ===`);
  console.log(`Total:       ${counts.total}`);
  console.log(`Supported:   ${counts.supported} (${formatPercent(counts.supported, counts.total)})`);
  console.log(`Partial:     ${counts.partial} (${formatPercent(counts.partial, counts.total)})`);
  console.log(`Unsupported: ${counts.unsupported} (${formatPercent(counts.unsupported, counts.total)})`);
  console.log("");
}

function maxStatus(a: CoverageStatus, b: CoverageStatus): CoverageStatus {
  const rank: Record<CoverageStatus, number> = {
    SUPPORTED: 0,
    PARTIAL: 1,
    UNSUPPORTED: 2,
  };

  return rank[b] > rank[a] ? b : a;
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}


function isRuntimeSupportedTargetFilter(effect: EffectRecord): boolean {
  if (!FULLY_SUPPORTED_KINDS.has(effect.kind)) return false;
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
    lower.includes("crit")
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
    kind === "RAGE" ||
    kind === "VALUE_MOD" ||
    kind === "INCOME_MOD"
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

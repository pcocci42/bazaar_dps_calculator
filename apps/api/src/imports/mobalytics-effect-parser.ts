export type BazaarTier =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Diamond"
  | "Legendary"
  | string;

export type EffectKind =
  | "DAMAGE"
  | "SHIELD"
  | "HEAL"
  | "BURN"
  | "POISON"
  | "REGEN"
  | "HASTE"
  | "SLOW"
  | "FREEZE"
  | "CHARGE"
  | "RELOAD"
  | "DESTROY"
  | "REPAIR"
  | "FLYING_START"
  | "FLYING_STOP"
  | "COOLDOWN_MOD"
  | "MULTICAST_MOD"
  | "CRIT_CHANCE_MOD"
  | "CRIT_DAMAGE_MOD"
  | "VALUE_MOD"
  | "INCOME_MOD"
  | "RAGE"
  | "TRANSFORM"
  | "UPGRADE"
  | "PRESTIGE"
  | "IMMUNITY"
  | "TAG_MOD"
  | "LIFESTEAL_MOD"
  | "MAX_HEALTH_MOD"
  | "MAX_AMMO_MOD"
  | "AMMO_MOD"
  | "RESOURCE_GAIN"
  | "SHOP_MOD"
  | "CHILL"
  | "HEAT"
  | "ENCHANT"
  | "USE_TRIGGER"
  | "EVENT_TRIGGER"
  | "TEMPLATE"
  | "TRIGGER"
  | "SCALING"
  | "OTHER"
  | "INVULNERABILITY";

export type EffectTarget =
  | "SELF"
  | "ENEMY"
  | "ENEMY_ITEM"
  | "ENEMY_ITEMS"
  | "ADJACENT_ITEM"
  | "ADJACENT_ITEMS"
  | "LEFT_ITEM"
  | "RIGHT_ITEM"
  | "YOUR_ITEM"
  | "YOUR_ITEMS"
  | "YOUR_WEAPONS"
  | "YOUR_SHIELD_ITEMS"
  | "YOUR_HEAL_ITEMS"
  | "YOUR_BURN_ITEMS"
  | "YOUR_POISON_ITEMS"
  | "YOUR_REGEN_ITEMS"
  | "PLAYER"
  | "BOTH_PLAYERS"
  | "UNKNOWN";

export type ParsedEffect = {
  kind: EffectKind;
  target: EffectTarget;
  targetFilter: string | null;
  attribute: string | null;
  resource: string | null;
  value: number | null;
  unit: string | null;
  durationSeconds: number | null;
  count: number | null;
  operation:
    | "SET"
    | "GAIN"
    | "REDUCE"
    | "INCREASE"
    | "DOUBLE"
    | "HALVE"
    | "EQUAL_TO"
    | "TRIGGER"
    | "UNKNOWN";
  condition: string | null;
  formula: string | null;
  metadata: Record<string, unknown> | null;
  isCombatOnly: boolean;
  isPermanent: boolean;
  rawText: string;
};

export type ParsedTierEffects = {
  tier: BazaarTier;
  cooldown: number | null;
  ammo: number | null;
  multicast: number | null;
  critChance: number | null;
  descriptions: string[];
  effects: ParsedEffect[];
};

export type MobalyticsTierStat = {
  tier: BazaarTier;
  descriptions?: string[] | null;
  cooldown?: string | number | null;
  ammo?: string | number | null;
  lifesteal?: string | number | null;
  multicast?: string | number | null;
  critchance?: string | number | null;
};

export type MobalyticsItemForParsing = {
  id: string;
  slug: string;
  name: string;
  tierStats?: MobalyticsTierStat[] | null;
};

const KNOWN_TAGS = [
  "Weapon",
  "Tool",
  "Vehicle",
  "Drone",
  "Tech",
  "Apparel",
  "Aquatic",
  "Dinosaur",
  "Relic",
  "Friend",
  "Food",
  "Toy",
  "Property",
  "Potion",
  "Reagent",
  "Ray",
  "Loot",
  "Trap",
  "Core",
  "Dragon",
  "Chilled",
  "Heated",
];

function stripMobalyticsMarkup(input: string): string {
  return input
    .replace(/\{\{::([^}:]+)(?::[^}]*)?\}\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  const clean = stripMobalyticsMarkup(value);
  const match = clean.match(/-?\d+(?:\.\d+)?/);

  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeEffect(input: {
  kind: EffectKind;
  rawText: string;
  target?: EffectTarget;
  targetFilter?: string | null;
  attribute?: string | null;
  resource?: string | null;
  value?: number | null;
  unit?: string | null;
  durationSeconds?: number | null;
  count?: number | null;
  operation?: ParsedEffect["operation"];
  condition?: string | null;
  formula?: string | null;
  metadata?: Record<string, unknown> | null;
  isCombatOnly?: boolean;
  isPermanent?: boolean;
}): ParsedEffect {
  return {
    kind: input.kind,
    target: input.target ?? "UNKNOWN",
    targetFilter: input.targetFilter ?? null,
    attribute: input.attribute ?? null,
    resource: input.resource ?? null,
    value: input.value ?? null,
    unit: input.unit ?? null,
    durationSeconds: input.durationSeconds ?? null,
    count: input.count ?? null,
    operation: input.operation ?? "UNKNOWN",
    condition: input.condition ?? null,
    formula: input.formula ?? null,
    metadata: input.metadata ?? null,
    isCombatOnly: input.isCombatOnly ?? /for the fight|in combat|each fight/i.test(input.rawText),
    isPermanent: input.isPermanent ?? /permanent|permanently/i.test(input.rawText),
    rawText: input.rawText,
  };
}

function splitCondition(text: string): { condition: string | null; effectText: string } {
  const normalized = text.trim();

  const prefixCondition = normalized.match(/^([A-Z][A-Za-z ]+):\s*(.+)$/);
  if (prefixCondition) {
    return {
      condition: prefixCondition[1].trim(),
      effectText: prefixCondition[2].trim(),
    };
  }

  const whenMatch = normalized.match(
    /^(When|If|While|At the start of|At the end of|The first time|For each)\b(.+?),(.*)$/i
  );

  if (whenMatch) {
    return {
      condition: `${whenMatch[1]}${whenMatch[2]}`.trim(),
      effectText: whenMatch[3].trim(),
    };
  }

  return {
    condition: null,
    effectText: normalized,
  };
}

function inferTarget(text: string): EffectTarget {
  const lower = text.toLowerCase();

  if (lower.includes("both players")) return "BOTH_PLAYERS";
  if (lower.includes("enemy items")) return "ENEMY_ITEMS";
  if (lower.includes("enemy item")) return "ENEMY_ITEM";
  if (lower.includes("enemy")) return "ENEMY";

  if (lower.includes("adjacent items")) return "ADJACENT_ITEMS";
  if (lower.includes("adjacent item")) return "ADJACENT_ITEM";
  if (lower.includes("adjacent weapons")) return "ADJACENT_ITEMS";

  if (lower.includes("item to the left") || lower.includes("leftmost")) return "LEFT_ITEM";
  if (lower.includes("item to the right") || lower.includes("rightmost")) return "RIGHT_ITEM";

  if (lower.includes("your other")) return "YOUR_ITEMS";
  if (lower.includes("your weapons") || lower.includes("weapons gain")) return "YOUR_WEAPONS";
  if (lower.includes("shield items")) return "YOUR_SHIELD_ITEMS";
  if (lower.includes("heal items")) return "YOUR_HEAL_ITEMS";
  if (lower.includes("burn items")) return "YOUR_BURN_ITEMS";
  if (lower.includes("poison items")) return "YOUR_POISON_ITEMS";
  if (lower.includes("regen items")) return "YOUR_REGEN_ITEMS";

  if (lower.includes("your items") || lower.includes("all your items")) return "YOUR_ITEMS";
  if (lower.includes("all items")) return "YOUR_ITEMS";
  if (lower.includes("another item") || lower.includes("an item")) return "YOUR_ITEM";
  if (lower.includes("a weapon") || lower.includes("weapon gains")) return "YOUR_ITEM";

  if (
    lower.includes("you take") ||
    lower.includes("max health") ||
    lower.includes("prestige") ||
    lower.includes("scrap") ||
    lower.includes("rerolls") ||
    lower.includes("merchants")
  ) {
    return "PLAYER";
  }

  if (lower.includes("player")) return "PLAYER";
  if (lower.includes("this")) return "SELF";

  return "UNKNOWN";
}

function inferEffectTarget(kind: EffectKind, text: string): EffectTarget {
  const explicitTarget = inferTarget(text);
  const lower = text.toLowerCase();

  const genericSingleItemTarget =
    explicitTarget === "YOUR_ITEM" &&
    /\b(an?|another)\s+item\b/i.test(text) &&
    !/\b(your|this|left|right|adjacent|enemy)\b/i.test(text);

  if (explicitTarget !== "UNKNOWN" && !genericSingleItemTarget) {
    return explicitTarget;
  }


  if (lower.includes("yourself")) {
    return "PLAYER";
  }

  if (lower.includes("both players")) {
    return "BOTH_PLAYERS";
  }

  if (lower.includes("this item") || lower.includes("this")) {
    return "SELF";
  }

  switch (kind) {
    case "DAMAGE":
      if (/gain|gains|\+|has double|has triple|has quadruple|loses/i.test(text)) {
        return "SELF";
      }

      return "ENEMY";

    case "SHIELD":
    case "HEAL":
    case "REGEN":
    case "RAGE":
    case "MAX_HEALTH_MOD":
    case "RESOURCE_GAIN":
    case "PRESTIGE":
      return "PLAYER";

    case "BURN":
      if (lower.includes("both players")) return "BOTH_PLAYERS";
      if (lower.includes("yourself")) return "PLAYER";
      return "ENEMY";

    case "POISON":
      if (lower.includes("both players")) return "BOTH_PLAYERS";
      if (lower.includes("yourself")) return "PLAYER";
      return "ENEMY";

    case "HASTE":
    case "CHARGE":
    case "RELOAD":
    case "REPAIR":
    case "MULTICAST_MOD":
    case "COOLDOWN_MOD":
    case "CRIT_CHANCE_MOD":
    case "CRIT_DAMAGE_MOD":
    case "AMMO_MOD":
    case "MAX_AMMO_MOD":
    case "VALUE_MOD":
    case "LIFESTEAL_MOD":
      if (/\b\d+\s+items?\b/i.test(text)) return "YOUR_ITEMS";
      if (/\b(an?|another)\s+[A-Z]?[a-z]+/i.test(text)) return "YOUR_ITEM";
      return "SELF";

    case "SLOW":
    case "FREEZE":
      if (/\b\d+\s+items?\b/i.test(text)) return "ENEMY_ITEMS";
      if (/\b(an?|another)\s+item\b/i.test(text)) return "ENEMY_ITEM";
      return "ENEMY_ITEM";

    case "DESTROY":
      if (lower.includes("enemy")) return "ENEMY_ITEM";
      return "SELF";

    case "FLYING_START":
    case "FLYING_STOP":
      if (/\b\d+\s+items?\b/i.test(text)) return "YOUR_ITEMS";
      if (/\b(an?|another)\s+item\b/i.test(text)) return "YOUR_ITEM";
      return "SELF";

    case "TAG_MOD":
    case "IMMUNITY":
    case "TEMPLATE":
      return "SELF";

    case "ENCHANT":
    case "TRANSFORM":
    case "UPGRADE":
    case "USE_TRIGGER":
      return "YOUR_ITEM";

    case "CHILL":
    case "HEAT":
      if (/\b\d+\s+items?\b/i.test(text)) return "YOUR_ITEMS";
      if (/\b(an?|another)\s+item\b/i.test(text)) return "YOUR_ITEM";
      return "SELF";

    default:
      return explicitTarget;
  }
}

function normalizeKnownTag(candidate: string): string | null {
  const clean = candidate.trim().replace(/[.,;:!?]+$/, "");
  const lower = clean.toLowerCase();

  for (const tag of KNOWN_TAGS) {
    const tagLower = tag.toLowerCase();

    if (lower === tagLower || lower === `${tagLower}s`) {
      return tag;
    }
  }

  return null;
}

function inferTargetFilter(text: string): string | null {
  const lower = text.toLowerCase();

  for (const tag of KNOWN_TAGS) {
    const singular = tag.toLowerCase();
    const plural = `${singular}s`;

    if (
      lower.includes(` ${singular} `) ||
      lower.includes(` ${plural} `) ||
      lower.startsWith(`${singular} `) ||
      lower.startsWith(`${plural} `) ||
      lower.includes(`your ${plural}`) ||
      lower.includes(`your other ${plural}`) ||
      lower.includes(`adjacent ${plural}`) ||
      lower.includes(`adjacent ${singular}`) ||
      lower.includes(`a ${singular}`) ||
      lower.includes(`an ${singular}`)
    ) {
      return tag;
    }
  }

  return null;
}

function parseDurationSeconds(text: string): number | null {
  const match = text.match(/for\s+(-?\d+(?:\.\d+)?)\s+second/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseCount(text: string): number | null {
  const countMatch = text.match(/\b(\d+)\s+items?\b/i);
  if (countMatch) return Number(countMatch[1]);

  const oneItemMatch = text.match(/\b(an|a)\s+items?\b/i);
  if (oneItemMatch) return 1;

  return null;
}

function parseValueNearKeyword(text: string, keyword: string): number | null {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(`\\b${escaped}\\s+(-?\\d+(?:\\.\\d+)?)\\b`, "i"),
    new RegExp(`\\+(-?\\d+(?:\\.\\d+)?)%?\\s+${escaped}\\b`, "i"),
    new RegExp(`\\bgain\\s+\\+?(-?\\d+(?:\\.\\d+)?)%?\\s+${escaped}\\b`, "i"),
    new RegExp(`\\bgains\\s+\\+?(-?\\d+(?:\\.\\d+)?)%?\\s+${escaped}\\b`, "i"),
    new RegExp(`\\bhave\\s+\\+?(-?\\d+(?:\\.\\d+)?)%?\\s+${escaped}\\b`, "i"),
    new RegExp(`\\bhas\\s+\\+?(-?\\d+(?:\\.\\d+)?)%?\\s+${escaped}\\b`, "i"),
    new RegExp(`\\b${escaped}\\s+\\+?(-?\\d+(?:\\.\\d+)?)\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function parseSimpleNumericEffect(
  text: string,
  condition: string | null,
  kind: EffectKind,
  verbRegex: RegExp,
  unit: string | null = null,
  attribute: string | null = null
): ParsedEffect | null {
  const match = text.match(verbRegex);
  if (!match) return null;

  const value = Number(match[1]);

  return makeEffect({
    kind,
    rawText: text,
    target: inferEffectTarget(kind, text),
    targetFilter: inferTargetFilter(text),
    attribute,
    value: Number.isFinite(value) ? value : null,
    unit,
    durationSeconds: parseDurationSeconds(text),
    count: parseCount(text),
    operation: /lose|loses|reduce|reduced|less/i.test(text.toLowerCase())
      ? "REDUCE"
      : /gain|gains|\+/.test(text.toLowerCase())
        ? "GAIN"
        : "SET",
    condition,
  });
}

function parseScalingEffect(text: string, condition: string | null): ParsedEffect | null {
  const hasScaling =
    /equal to|times|twice|double|triple|quadruple|half|% of|for every|for each|based on/i.test(
      text
    );

  const hasKnownStat =
    /damage|crit chance|crit damage|shield|heal|burn|poison|regen|value|income|rage|enrage|max health|cooldown|ammo/i.test(
      text
    );

  if (!hasScaling || !hasKnownStat) return null;

  let kind: EffectKind = "SCALING";
  let attribute: string | null = null;

  if (/crit damage/i.test(text)) {
    kind = "CRIT_DAMAGE_MOD";
    attribute = "Crit Damage";
  } else if (/crit chance/i.test(text)) {
    kind = "CRIT_CHANCE_MOD";
    attribute = "Crit Chance";
  } else if (/damage/i.test(text)) {
    kind = "DAMAGE";
    attribute = "Damage";
  } else if (/shield/i.test(text)) {
    kind = "SHIELD";
    attribute = "Shield";
  } else if (/heal/i.test(text)) {
    kind = "HEAL";
    attribute = "Heal";
  } else if (/burn/i.test(text)) {
    kind = "BURN";
    attribute = "Burn";
  } else if (/poison/i.test(text)) {
    kind = "POISON";
    attribute = "Poison";
  } else if (/regen/i.test(text)) {
    kind = "REGEN";
    attribute = "Regen";
  } else if (/cooldown/i.test(text)) {
    kind = "COOLDOWN_MOD";
    attribute = "Cooldown";
  } else if (/value/i.test(text)) {
    kind = "VALUE_MOD";
    attribute = "Value";
  } else if (/\bammo\b/i.test(text)) {
    kind = "AMMO_MOD";
    attribute = "Ammo";
  } else if (/rage|enrage/i.test(text)) {
    kind = "RAGE";
    attribute = /duration|lasts/i.test(text) ? "Enrage Duration" : "Rage";
  }

  let multiplier: number | null = null;
  if (/double|twice/i.test(text)) multiplier = 2;
  if (/triple/i.test(text)) multiplier = 3;
  if (/quadruple/i.test(text)) multiplier = 4;
  if (/half/i.test(text)) multiplier = 0.5;

  return makeEffect({
    kind,
    rawText: text,
    target: inferEffectTarget(kind, text),
    targetFilter: inferTargetFilter(text),
    attribute,
    value: multiplier ?? toNumber(text),
    unit: /%/.test(text) ? "percent" : multiplier ? "multiplier" : null,
    durationSeconds: parseDurationSeconds(text),
    count: parseCount(text),
    operation: /half|halved/i.test(text)
      ? "HALVE"
      : /reduce|reduced|loses|less/i.test(text)
        ? "REDUCE"
        : /increase|increased|more/i.test(text)
          ? "INCREASE"
          : "EQUAL_TO",
    condition,
    formula: text,
    metadata: multiplier ? { multiplier } : null,
  });
}

function parseTagMod(text: string, condition: string | null): ParsedEffect | null {
  const directTagMatch = text.match(
    /\b(?:Adjacent items|Your items|This|Items?|Your [A-Z][A-Za-z]+s?) are ([A-Z][A-Za-z]+)\b/i
  );

  if (directTagMatch) {
    const tag = normalizeKnownTag(directTagMatch[1]);
    if (tag) {
      return makeEffect({
        kind: "TAG_MOD",
        rawText: text,
        target: inferEffectTarget("TAG_MOD", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Tag",
        value: null,
        operation: "SET",
        condition,
        metadata: {
          tag,
        },
      });
    }
  }

  const hasTypeMatch = text.match(/\b(.+?)\s+has\s+the\s+([A-Z][A-Za-z]+)\s+type\b/i);
  if (hasTypeMatch) {
    const tag = normalizeKnownTag(hasTypeMatch[2]);
    if (tag) {
      return makeEffect({
        kind: "TAG_MOD",
        rawText: text,
        target: inferEffectTarget("TAG_MOD", text),
        targetFilter: inferTargetFilter(hasTypeMatch[1]),
        attribute: "Tag",
        value: null,
        operation: "SET",
        condition,
        formula: text,
        metadata: {
          tag,
        },
      });
    }
  }

  const transformTagMatch = text.match(/\bYour other ([A-Z][A-Za-z]+)s are ([A-Z][A-Za-z]+)s?\b/i);
  if (transformTagMatch) {
    const fromTag = normalizeKnownTag(transformTagMatch[1]);
    const toTag = normalizeKnownTag(transformTagMatch[2]);

    if (fromTag && toTag) {
      return makeEffect({
        kind: "TAG_MOD",
        rawText: text,
        target: "YOUR_ITEMS",
        targetFilter: fromTag,
        attribute: "Tag",
        value: null,
        operation: "SET",
        condition,
        formula: text,
        metadata: {
          fromTag,
          tag: toTag,
        },
      });
    }
  }

  return null;
}

function parseDynamicTypeMod(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/\bThis has the Types of items you have(?: in your Stash)?\b/i);

  if (!match) return null;

  return makeEffect({
    kind: "TAG_MOD",
    rawText: text,
    target: "SELF",
    attribute: "Type",
    operation: "SET",
    condition,
    formula: text,
    metadata: {
      dynamic: true,
      source: /stash/i.test(text) ? "STASH" : "BOARD",
    },
  });
}

function parsePlaceholderValueMod(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/^(.+?)\s+have\s+XX\s+Value\.?$/i);

  if (!match) return null;

  return makeEffect({
    kind: "VALUE_MOD",
    rawText: text,
    target: "YOUR_ITEM",
    targetFilter: match[1].trim(),
    attribute: "Value",
    value: null,
    operation: "SET",
    condition,
    formula: text,
    metadata: {
      placeholderValue: "XX",
    },
    isCombatOnly: false,
  });
}

function parseResourceGain(text: string, condition: string | null): ParsedEffect | null {
  const scrapMatch = text.match(/\bget\s+(?:a|an|one|\d+)?\s*Scrap\b/i);
  if (scrapMatch) {
    const explicitValue = toNumber(text);
    return makeEffect({
      kind: "RESOURCE_GAIN",
      rawText: text,
      target: "PLAYER",
      resource: "Scrap",
      value: explicitValue ?? 1,
      unit: "count",
      operation: "GAIN",
      condition,
    });
  }

  const goldMatch = text.match(/\b(?:get|gain)\s+(-?\d+(?:\.\d+)?)\s+Gold\b/i);
  if (goldMatch) {
    return makeEffect({
      kind: "RESOURCE_GAIN",
      rawText: text,
      target: "PLAYER",
      resource: "Gold",
      value: Number(goldMatch[1]),
      unit: "count",
      operation: "GAIN",
      condition,
    });
  }

  return null;
}

function parseShopMod(text: string, condition: string | null): ParsedEffect | null {
  const merchantMatch = /\bMerchants?\b/i.test(text);
  const rerollMatch = text.match(/\bYour rerolls cost\s+(-?\d+(?:\.\d+)?)\s+less Gold\b/i);
  const sellValueMatch = text.match(/\bYour\s+(.+?)\s+have\s+\+?(-?\d+(?:\.\d+)?)\s+sell value\b/i);

  if (!merchantMatch && !rerollMatch && !sellValueMatch) return null;

  const sellDiscount = text.match(/sell items for\s+(-?\d+(?:\.\d+)?)\s+less Gold/i);
  const buyBonus = text.match(/buy items for\s+(-?\d+(?:\.\d+)?)\s+more Gold/i);

  if (rerollMatch) {
    return makeEffect({
      kind: "SHOP_MOD",
      rawText: text,
      target: "PLAYER",
      resource: "Gold",
      value: Number(rerollMatch[1]),
      unit: "count",
      operation: "REDUCE",
      condition,
      formula: /for each/i.test(text) ? text : null,
      metadata: {
        shopAttribute: "reroll_cost",
      },
      isCombatOnly: false,
    });
  }

  if (sellValueMatch) {
    return makeEffect({
      kind: "SHOP_MOD",
      rawText: text,
      target: "YOUR_ITEMS",
      targetFilter: sellValueMatch[1].trim(),
      resource: "Gold",
      attribute: "Sell Value",
      value: Number(sellValueMatch[2]),
      unit: "count",
      operation: "GAIN",
      condition,
      metadata: {
        shopAttribute: "sell_value",
      },
      isCombatOnly: false,
    });
  }

  return makeEffect({
    kind: "SHOP_MOD",
    rawText: text,
    target: "PLAYER",
    resource: "Gold",
    value: sellDiscount ? Number(sellDiscount[1]) : buyBonus ? Number(buyBonus[1]) : null,
    unit: "count",
    operation: "UNKNOWN",
    condition,
    formula: text,
    metadata: {
      sellDiscountGold: sellDiscount ? Number(sellDiscount[1]) : null,
      buyBonusGold: buyBonus ? Number(buyBonus[1]) : null,
    },
    isCombatOnly: false,
  });
}

function parseSellValue(text: string, condition: string | null): ParsedEffect | null {
  if (!/\bSells?\s+for\s+Gold\b/i.test(text)) return null;

  return makeEffect({
    kind: "RESOURCE_GAIN",
    rawText: text,
    target: "PLAYER",
    resource: "Gold",
    value: null,
    unit: "count",
    operation: "UNKNOWN",
    condition,
    formula: text,
    metadata: {
      source: "sell_value",
    },
    isCombatOnly: false,
  });
}

function parseCooldownIncrease(text: string, condition: string | null): ParsedEffect | null {
  const match =
    text.match(/Cooldowns?.*?(?:increased|increase).*?by\s+(-?\d+(?:\.\d+)?)\s+second/i) ??
    text.match(/Increase.*?Cooldown.*?by\s+(-?\d+(?:\.\d+)?)\s+second/i) ??
    text.match(/Cooldown.*?increased by\s+(-?\d+(?:\.\d+)?)\s+second/i);

  if (!match) return null;

  return makeEffect({
    kind: "COOLDOWN_MOD",
    rawText: text,
    target: inferEffectTarget("COOLDOWN_MOD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Cooldown",
    value: Number(match[1]),
    unit: "seconds",
    operation: "INCREASE",
    condition,
  });
}

function parseCooldownReduction(text: string, condition: string | null): ParsedEffect | null {
  const match =
    text.match(/Reduce\s+the\s+Cooldown\s+of\s+.*?\s+by\s+(-?\d+(?:\.\d+)?)(%|\s+seconds?|\s+second\(s\))?/i) ??
    text.match(/Reduce\s+.*?Cooldown\s+by\s+(-?\d+(?:\.\d+)?)(%|\s+seconds?|\s+second\(s\))?/i) ??
    text.match(/Cooldown\s+of\s+.*?(?:reduced|decreased)\s+by\s+(-?\d+(?:\.\d+)?)(%|\s+seconds?|\s+second\(s\))?/i) ??
    text.match(/Cooldown.*?(?:reduced|decreased) by\s+(-?\d+(?:\.\d+)?)(%|\s+seconds?|\s+second\(s\))?/i) ??
    text.match(/Cooldowns?\s+are\s+decreased\s+by\s+(-?\d+(?:\.\d+)?)(%|\s+seconds?|\s+second\(s\))?/i);

  if (!match) return null;

  const unitText = match[2]?.trim();

  return makeEffect({
    kind: "COOLDOWN_MOD",
    rawText: text,
    target: inferEffectTarget("COOLDOWN_MOD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Cooldown",
    value: Number(match[1]),
    unit: unitText === "%" ? "percent" : "seconds",
    operation: "REDUCE",
    condition,
    formula: /for every|for each|of adjacent|your other|another|adjacent|non-weapon/i.test(text)
      ? text
      : null,
    metadata: /non-weapon/i.test(text)
      ? {
          excludeTag: "Weapon",
        }
      : null,
    isCombatOnly: /for the fight/i.test(text),
  });
}

function parseMaxHealth(text: string, condition: string | null): ParsedEffect | null {
  const gainMatch =
    text.match(/\b(?:permanently\s+)?(?:gain|gains)\s+\+?(-?\d+(?:\.\d+)?)\s+Max Health\b/i) ??
    text.match(/\b(?:have|has)\s+\+(-?\d+(?:\.\d+)?)%?\s+Max Health\b/i);

  if (gainMatch) {
    return makeEffect({
      kind: "MAX_HEALTH_MOD",
      rawText: text,
      target: "PLAYER",
      attribute: "Max Health",
      value: Number(gainMatch[1]),
      unit: /%/.test(gainMatch[0]) ? "percent" : "health",
      operation: "GAIN",
      condition,
      isPermanent: /permanent|permanently/i.test(text),
    });
  }

  const setMatch = text.match(/\bYou have\s+(-?\d+(?:\.\d+)?)%?\s+Max Health\b/i);
  if (setMatch) {
    return makeEffect({
      kind: "MAX_HEALTH_MOD",
      rawText: text,
      target: "PLAYER",
      attribute: "Max Health",
      value: Number(setMatch[1]),
      unit: /%/.test(setMatch[0]) ? "percent" : "health",
      operation: "SET",
      condition,
      isCombatOnly: /fight|combat/i.test(text),
    });
  }

  const reduceMatch = text.match(
    /\bReduce\s+(?:an?\s+)?enemy'?s?\s+Max Health\s+by\s+(-?\d+(?:\.\d+)?)%?/i
  );

  if (reduceMatch) {
    return makeEffect({
      kind: "MAX_HEALTH_MOD",
      rawText: text,
      target: "ENEMY",
      attribute: "Max Health",
      value: Number(reduceMatch[1]),
      unit: /%/.test(reduceMatch[0]) ? "percent" : "health",
      operation: "REDUCE",
      condition,
      isCombatOnly: /for the fight/i.test(text),
    });
  }

  return null;
}

function parseMaxAmmo(text: string, condition: string | null): ParsedEffect | null {
  const gainMatch = text.match(/\+(-?\d+(?:\.\d+)?)\s+Max Ammo\b/i);
  if (gainMatch) {
    return makeEffect({
      kind: "MAX_AMMO_MOD",
      rawText: text,
      target: inferEffectTarget("MAX_AMMO_MOD", text),
      targetFilter: inferTargetFilter(text),
      attribute: "Max Ammo",
      value: Number(gainMatch[1]),
      unit: "count",
      operation: "GAIN",
      condition,
      formula: /for each/i.test(text) ? text : null,
    });
  }

  const loseMatch = text.match(/\b(?:This\s+)?(?:permanently\s+)?loses\s+(-?\d+(?:\.\d+)?)\s+Max Ammo\b/i);
  if (loseMatch) {
    return makeEffect({
      kind: "MAX_AMMO_MOD",
      rawText: text,
      target: inferEffectTarget("MAX_AMMO_MOD", text),
      targetFilter: inferTargetFilter(text),
      attribute: "Max Ammo",
      value: Number(loseMatch[1]),
      unit: "count",
      operation: "REDUCE",
      condition,
      isPermanent: /permanent|permanently/i.test(text),
      isCombatOnly: /for the fight/i.test(text),
    });
  }

  return null;
}

function parseAmmoMod(text: string, condition: string | null): ParsedEffect | null {
  const match =
    text.match(/\+(-?\d+(?:\.\d+)?)\s+Ammo\b/i) ??
    text.match(/\bhas\s+\+(-?\d+(?:\.\d+)?)\s+Ammo\b/i) ??
    text.match(/\bgains\s+\+?(-?\d+(?:\.\d+)?)\s+Ammo\b/i);

  if (!match) return null;

  if (/Max Ammo/i.test(text)) return null;

  return makeEffect({
    kind: "AMMO_MOD",
    rawText: text,
    target: inferEffectTarget("AMMO_MOD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Ammo",
    value: Number(match[1]),
    unit: "count",
    operation: "GAIN",
    condition,
    formula: /for each/i.test(text) ? text : null,
  });
}

function parseLifesteal(text: string, condition: string | null): ParsedEffect | null {
  if (!/\bLifesteal\b/i.test(text)) return null;

  return makeEffect({
    kind: "LIFESTEAL_MOD",
    rawText: text,
    target: inferEffectTarget("LIFESTEAL_MOD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Lifesteal",
    value: toNumber(text),
    operation: /gain|gains|\+/.test(text.toLowerCase()) ? "GAIN" : "SET",
    condition,
  });
}

function parseEnchant(text: string, condition: string | null): ParsedEffect | null {
  if (!/\bEnchant\b/i.test(text)) return null;

  return makeEffect({
    kind: "ENCHANT",
    rawText: text,
    target: inferEffectTarget("ENCHANT", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Enchant",
    operation: "TRIGGER",
    condition,
    formula: text,
    isCombatOnly: /for the fight/i.test(text),
  });
}

function parseUseTrigger(text: string, condition: string | null): ParsedEffect | null {
  const firstTimesMatch = text.match(/The first\s+(-?\d+(?:\.\d+)?)\s+times?.*?use this/i);
  if (firstTimesMatch) {
    return makeEffect({
      kind: "USE_TRIGGER",
      rawText: text,
      target: "SELF",
      count: Number(firstTimesMatch[1]),
      operation: "TRIGGER",
      condition,
      formula: text,
      isCombatOnly: /fight|combat/i.test(text),
    });
  }

  const useThisMatch = text.match(/\buse this\b/i);
  if (useThisMatch) {
    return makeEffect({
      kind: "USE_TRIGGER",
      rawText: text,
      target: "SELF",
      count: null,
      operation: "TRIGGER",
      condition,
      formula: text,
      isCombatOnly: /fight|combat/i.test(text),
    });
  }

  const useAllMatch = text.match(/\bUse\s+all\s+(?:of\s+)?your\s+(.+?)\b$/i);
  if (useAllMatch) {
    return makeEffect({
      kind: "USE_TRIGGER",
      rawText: text,
      target: "YOUR_ITEMS",
      targetFilter: inferTargetFilter(useAllMatch[1]),
      count: null,
      operation: "TRIGGER",
      condition,
      formula: text,
      metadata: {
        scope: "ALL",
        filterText: useAllMatch[1].trim(),
      },
      isCombatOnly: true,
    });
  }

  const useAnotherMatch = text.match(/\bUse\s+another\s+([A-Z][A-Za-z]+)\b/i);
  if (useAnotherMatch) {
    return makeEffect({
      kind: "USE_TRIGGER",
      rawText: text,
      target: "YOUR_ITEM",
      targetFilter: normalizeKnownTag(useAnotherMatch[1]) ?? useAnotherMatch[1],
      count: 1,
      operation: "TRIGGER",
      condition,
      formula: text,
      metadata: {
        scope: "ANOTHER",
      },
      isCombatOnly: true,
    });
  }

  return null;
}

function parseCritDamageMod(text: string, condition: string | null): ParsedEffect | null {
  if (!/\bCrit Damage\b/i.test(text)) return null;

  let multiplier: number | null = null;
  if (/double/i.test(text)) multiplier = 2;
  if (/triple/i.test(text)) multiplier = 3;
  if (/quadruple/i.test(text)) multiplier = 4;

  const numericValue = parseValueNearKeyword(text, "Crit Damage");

  return makeEffect({
    kind: "CRIT_DAMAGE_MOD",
    rawText: text,
    target: inferEffectTarget("CRIT_DAMAGE_MOD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Crit Damage",
    value: multiplier ?? numericValue,
    unit: multiplier ? "multiplier" : /%/.test(text) ? "percent" : null,
    operation: multiplier ? "EQUAL_TO" : /gain|gains|\+/.test(text.toLowerCase()) ? "GAIN" : "SET",
    condition,
    formula: multiplier ? text : null,
    metadata: multiplier ? { multiplier } : null,
  });
}

function parseDamageMultiplier(text: string, condition: string | null): ParsedEffect | null {
  if (!/\bdeals?\b.*\bDamage\b/i.test(text)) return null;

  let multiplier: number | null = null;
  if (/double/i.test(text)) multiplier = 2;
  if (/triple/i.test(text)) multiplier = 3;
  if (/quadruple/i.test(text)) multiplier = 4;

  if (!multiplier) return null;

  return makeEffect({
    kind: "DAMAGE",
    rawText: text,
    target: inferEffectTarget("DAMAGE", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Damage",
    value: multiplier,
    unit: "multiplier",
    operation: "EQUAL_TO",
    condition,
    formula: text,
    metadata: {
      multiplier,
    },
  });
}

function parseDamageTakenReduction(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/\bYou take\s+(-?\d+(?:\.\d+)?)%?\s+less\s+Damage\b/i);

  if (!match) return null;

  return makeEffect({
    kind: "DAMAGE",
    rawText: text,
    target: "PLAYER",
    attribute: "Damage Taken",
    value: Number(match[1]),
    unit: "percent",
    operation: "REDUCE",
    condition,
    metadata: {
      damageTakenModifier: true,
    },
  });
}

function parseShieldReduction(text: string, condition: string | null): ParsedEffect | null {
  const match =
    text.match(/\bloses\s+(-?\d+(?:\.\d+)?)%?\s+Shield\b/i) ??
    text.match(/\bReduce\s+.*?Shield\s+by\s+(-?\d+(?:\.\d+)?)%?/i);

  if (!match) return null;

  return makeEffect({
    kind: "SHIELD",
    rawText: text,
    target: inferEffectTarget("SHIELD", text),
    targetFilter: inferTargetFilter(text),
    attribute: "Shield",
    value: Number(match[1]),
    unit: /%/.test(match[0]) ? "percent" : null,
    operation: "REDUCE",
    condition,
    isCombatOnly: /for the fight/i.test(text),
  });
}

function parseStatLoss(text: string, condition: string | null): ParsedEffect | null {
  const damageLoss = text.match(/\bThis loses\s+(-?\d+(?:\.\d+)?)\s+Damage\b/i);

  if (damageLoss) {
    return makeEffect({
      kind: "DAMAGE",
      rawText: text,
      target: "SELF",
      attribute: "Damage",
      value: Number(damageLoss[1]),
      operation: "REDUCE",
      condition,
      isCombatOnly: /for the fight/i.test(text),
      isPermanent: /permanent|permanently/i.test(text),
    });
  }

  const critLoss = text.match(/\bThis loses\s+(-?\d+(?:\.\d+)?)%?\s+Crit Chance\b/i);

  if (critLoss) {
    return makeEffect({
      kind: "CRIT_CHANCE_MOD",
      rawText: text,
      target: "SELF",
      attribute: "Crit Chance",
      value: Number(critLoss[1]),
      unit: "percent",
      operation: "REDUCE",
      condition,
      isCombatOnly: /for the fight/i.test(text),
      isPermanent: /permanent|permanently/i.test(text),
    });
  }

  return null;
}

function parsePermanentValueGain(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/\bThis permanently gains\s+(-?\d+(?:\.\d+)?)\s+Value\b/i);

  if (!match) return null;

  return makeEffect({
    kind: "VALUE_MOD",
    rawText: text,
    target: "SELF",
    attribute: "Value",
    value: Number(match[1]),
    operation: "GAIN",
    condition,
    isPermanent: true,
    isCombatOnly: false,
  });
}

function parseRageMod(text: string, condition: string | null): ParsedEffect | null {
  if (/double Rage gain/i.test(text)) {
    return makeEffect({
      kind: "RAGE",
      rawText: text,
      target: "PLAYER",
      attribute: "Rage Gain",
      value: 2,
      unit: "multiplier",
      operation: "EQUAL_TO",
      condition,
      formula: text,
      metadata: {
        multiplier: 2,
      },
    });
  }

  if (/twice as much Rage to Enrage/i.test(text)) {
    return makeEffect({
      kind: "RAGE",
      rawText: text,
      target: "PLAYER",
      attribute: "Enrage Threshold",
      value: 2,
      unit: "multiplier",
      operation: "INCREASE",
      condition,
      formula: text,
      metadata: {
        multiplier: 2,
      },
    });
  }

  if (/Enrage lasts half as long/i.test(text)) {
    return makeEffect({
      kind: "RAGE",
      rawText: text,
      target: "PLAYER",
      attribute: "Enrage Duration",
      value: 0.5,
      unit: "multiplier",
      operation: "HALVE",
      condition,
      formula: text,
      metadata: {
        multiplier: 0.5,
      },
    });
  }

  return null;
}

function parseTemplate(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/\bThis is a\s+([A-Z][A-Za-z]+)\s+item Template\b/i);

  if (!match) return null;

  return makeEffect({
    kind: "TEMPLATE",
    rawText: text,
    target: "SELF",
    targetFilter: normalizeKnownTag(match[1]) ?? match[1],
    attribute: "Template",
    operation: "SET",
    condition,
    formula: text,
    metadata: {
      size: match[1],
    },
    isCombatOnly: false,
  });
}

function parseEventTrigger(text: string, condition: string | null): ParsedEffect | null {
  const expeditionMatch = text.match(/\bOn Day\s+(\d+),\s+allows you to embark on the\s+(.+?)\.\s*$/i);
  if (expeditionMatch) {
    return makeEffect({
      kind: "EVENT_TRIGGER",
      rawText: text,
      target: "PLAYER",
      count: Number(expeditionMatch[1]),
      operation: "TRIGGER",
      condition,
      formula: text,
      metadata: {
        event: "EXPEDITION",
        day: Number(expeditionMatch[1]),
        expedition: expeditionMatch[2].trim(),
      },
      isCombatOnly: false,
    });
  }

  if (/\bThe Sandstorm begins!?$/i.test(text)) {
    return makeEffect({
      kind: "EVENT_TRIGGER",
      rawText: text,
      target: "PLAYER",
      operation: "TRIGGER",
      condition,
      formula: text,
      metadata: {
        event: "SANDSTORM",
      },
      isCombatOnly: false,
    });
  }

  if (/\bFarai will return for this\b/i.test(text)) {
    return makeEffect({
      kind: "EVENT_TRIGGER",
      rawText: text,
      target: "PLAYER",
      operation: "TRIGGER",
      condition,
      formula: text,
      metadata: {
        event: "FARAI_RETURN",
      },
      isCombatOnly: false,
    });
  }

  return null;
}

function parseHeatOrChill(text: string, condition: string | null): ParsedEffect[] {
  const effects: ParsedEffect[] = [];

  const chillDuration = text.match(/\bChill(?:ed)?\b.*?for\s+(-?\d+(?:\.\d+)?)\s+second/i);
  if (/\bChill\b|\bChilled\b/i.test(text) && !/\bare Chilled\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "CHILL",
        rawText: text,
        target: inferEffectTarget("CHILL", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Chilled",
        durationSeconds: chillDuration ? Number(chillDuration[1]) : parseDurationSeconds(text),
        count: parseCount(text),
        operation: "SET",
        condition,
      })
    );
  }

  const heatDuration = text.match(/\bHeat(?:ed)?\b.*?for\s+(-?\d+(?:\.\d+)?)\s+second/i);
  if (/\bHeat\b|\bHeated\b/i.test(text) && !/\bare Heated\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "HEAT",
        rawText: text,
        target: inferEffectTarget("HEAT", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Heated",
        durationSeconds: heatDuration ? Number(heatDuration[1]) : parseDurationSeconds(text),
        count: parseCount(text),
        operation: "SET",
        condition,
      })
    );
  }

  return effects;
}

function parseMultiStatGain(text: string, condition: string | null): ParsedEffect[] {
  const match = text.match(
    /\bYour Weapons,\s*Shield,\s*and Heal items gain\s+\+?(-?\d+(?:\.\d+)?)\s+for the fight\b/i
  );

  if (!match) return [];

  const value = Number(match[1]);

  return [
    makeEffect({
      kind: "DAMAGE",
      rawText: text,
      target: "YOUR_WEAPONS",
      targetFilter: "Weapon",
      attribute: "Damage",
      value,
      operation: "GAIN",
      condition,
      isCombatOnly: true,
      metadata: {
        source: "multi_stat_gain",
      },
    }),
    makeEffect({
      kind: "SHIELD",
      rawText: text,
      target: "YOUR_SHIELD_ITEMS",
      attribute: "Shield",
      value,
      operation: "GAIN",
      condition,
      isCombatOnly: true,
      metadata: {
        source: "multi_stat_gain",
      },
    }),
    makeEffect({
      kind: "HEAL",
      rawText: text,
      target: "YOUR_HEAL_ITEMS",
      attribute: "Heal",
      value,
      operation: "GAIN",
      condition,
      isCombatOnly: true,
      metadata: {
        source: "multi_stat_gain",
      },
    }),
  ];
}

function parseKeywordEffects(text: string, condition: string | null): ParsedEffect[] {
  const effects: ParsedEffect[] = [];

  const pushSimple = (
    kind: EffectKind,
    regex: RegExp,
    unit: string | null = null,
    attribute: string | null = null
  ) => {
    const parsed = parseSimpleNumericEffect(text, condition, kind, regex, unit, attribute);
    if (parsed) effects.push(parsed);
  };

  const specialParsers = [
    parseEventTrigger,
    parseTemplate,
    parseTagMod,
    parseDynamicTypeMod,
    parsePlaceholderValueMod,
    parsePermanentValueGain,
    parseStatLoss,
    parseRageMod,
    parseResourceGain,
    parseShopMod,
    parseSellValue,
    parseCooldownIncrease,
    parseCooldownReduction,
    parseMaxHealth,
    parseMaxAmmo,
    parseAmmoMod,
    parseLifesteal,
    parseEnchant,
    parseUseTrigger,
    parseCritDamageMod,
    parseDamageMultiplier,
    parseDamageTakenReduction,
    parseShieldReduction,
    parseInvulnerability
  ];

  for (const parser of specialParsers) {
    const parsed = parser(text, condition);
    if (parsed) effects.push(parsed);
  }

  effects.push(...parseHeatOrChill(text, condition));
  effects.push(...parseMultiStatGain(text, condition));

  pushSimple("DAMAGE", /\bDeal\s+(-?\d+(?:\.\d+)?)\s+Damage\b/i, null, "Damage");
  pushSimple("DAMAGE", /\bdeal\s+(-?\d+(?:\.\d+)?)\s+damage\b/i, null, "Damage");
  pushSimple("DAMAGE", /\+(-?\d+(?:\.\d+)?)\s+Damage\b/i, null, "Damage");
  pushSimple("DAMAGE", /\bgain\s+(-?\d+(?:\.\d+)?)\s+Damage\b/i, null, "Damage");
  pushSimple("DAMAGE", /\bgains\s+(-?\d+(?:\.\d+)?)\s+Damage\b/i, null, "Damage");

  pushSimple("SHIELD", /\bShield\s+(-?\d+(?:\.\d+)?)\b/i, null, "Shield");
  pushSimple("SHIELD", /\bShield\s+\+(-?\d+(?:\.\d+)?)\b/i, null, "Shield");
  pushSimple("SHIELD", /\bGain\s+(-?\d+(?:\.\d+)?)\s+Shield\b/i, null, "Shield");
  pushSimple("SHIELD", /\bGains\s+(-?\d+(?:\.\d+)?)\s+Shield\b/i, null, "Shield");
  pushSimple("SHIELD", /\bThis gains\s+(-?\d+(?:\.\d+)?)\s+Shield\b/i, null, "Shield");
  pushSimple("SHIELD", /\+(-?\d+(?:\.\d+)?)\s+Shield\b/i, null, "Shield");

  pushSimple("HEAL", /\bHeal\s+(-?\d+(?:\.\d+)?)\b/i, null, "Heal");
  pushSimple("HEAL", /\bGain\s+(-?\d+(?:\.\d+)?)\s+Heal\b/i, null, "Heal");
  pushSimple("HEAL", /\+(-?\d+(?:\.\d+)?)\s+Heal\b/i, null, "Heal");

  pushSimple("BURN", /\bBurn\s+(-?\d+(?:\.\d+)?)\b/i, null, "Burn");
  pushSimple("BURN", /\bBurn\s+both Players\s+(-?\d+(?:\.\d+)?)\b/i, null, "Burn");
  pushSimple("BURN", /\bBurn\s+.*?\s+(-?\d+(?:\.\d+)?)\b/i, null, "Burn");
  pushSimple("BURN", /\+(-?\d+(?:\.\d+)?)\s+Burn\b/i, null, "Burn");

  pushSimple("POISON", /\bPoison\s+(-?\d+(?:\.\d+)?)\b/i, null, "Poison");
  pushSimple("POISON", /\bPoison\s+.*?\s+(-?\d+(?:\.\d+)?)\b/i, null, "Poison");
  pushSimple("POISON", /\+(-?\d+(?:\.\d+)?)\s+Poison\b/i, null, "Poison");

  pushSimple("REGEN", /\bRegen\s+(-?\d+(?:\.\d+)?)\b/i, null, "Regen");
  pushSimple("REGEN", /\bgain\s+(-?\d+(?:\.\d+)?)\s+Regen\b/i, null, "Regen");
  pushSimple("REGEN", /\+(-?\d+(?:\.\d+)?)\s+Regen\b/i, null, "Regen");

  pushSimple("RAGE", /\bGain\s+(-?\d+(?:\.\d+)?)\s+Rage\b/i, null, "Rage");
  pushSimple("RAGE", /\bgain\s+(-?\d+(?:\.\d+)?)\s+Rage\b/i, null, "Rage");

  pushSimple("VALUE_MOD", /\+(-?\d+(?:\.\d+)?)\s+Value\b/i, null, "Value");
  pushSimple("VALUE_MOD", /\+(-?\d+(?:\.\d+)?)\s+value\b/i, null, "Value");
  pushSimple("VALUE_MOD", /\bgain\s+Value\s+\+(-?\d+(?:\.\d+)?)\b/i, null, "Value");
  pushSimple("VALUE_MOD", /\bgain\s+(-?\d+(?:\.\d+)?)\s+Value\b/i, null, "Value");

  pushSimple("INCOME_MOD", /\+(-?\d+(?:\.\d+)?)\s+Income\b/i, null, "Income");
  pushSimple("PRESTIGE", /\brecover\s+(-?\d+(?:\.\d+)?)\s+Prestige\b/i, null, "Prestige");

  const critChanceValue =
    parseValueNearKeyword(text, "Crit Chance") ?? parseValueNearKeyword(text, "Crit chance");

  if (critChanceValue !== null) {
    effects.push(
      makeEffect({
        kind: "CRIT_CHANCE_MOD",
        rawText: text,
        target: inferEffectTarget("CRIT_CHANCE_MOD", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Crit Chance",
        value: critChanceValue,
        unit: "percent",
        operation: /lose|loses|reduce|reduced|less/i.test(text.toLowerCase())
          ? "REDUCE"
          : /gain|gains|\+/.test(text.toLowerCase())
            ? "GAIN"
            : "SET",
        condition,
        formula: /equal to/i.test(text) ? text : null,
      })
    );
  }

  if (/\bHaste\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "HASTE",
        rawText: text,
        target: inferEffectTarget("HASTE", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Haste",
        durationSeconds: parseDurationSeconds(text),
        count: parseCount(text),
        operation: "SET",
        condition,
      })
    );
  }

  if (/\bSlow\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "SLOW",
        rawText: text,
        target: inferEffectTarget("SLOW", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Slow",
        durationSeconds: parseDurationSeconds(text),
        count: parseCount(text),
        operation: "SET",
        condition,
      })
    );
  }

  if (/\bFreeze\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "FREEZE",
        rawText: text,
        target: inferEffectTarget("FREEZE", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Freeze",
        durationSeconds: parseDurationSeconds(text),
        count: parseCount(text),
        operation: "SET",
        condition,
      })
    );
  }

  if (/\bCharge\b/i.test(text)) {
    const chargeValue = toNumber(text.match(/Charge.*?(-?\d+(?:\.\d+)?)\s+second/i)?.[1] ?? null);

    effects.push(
      makeEffect({
        kind: "CHARGE",
        rawText: text,
        target: inferEffectTarget("CHARGE", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Charge",
        value: chargeValue,
        unit: "seconds",
        count: parseCount(text),
        operation: "GAIN",
        condition,
      })
    );
  }

  if (/\breload\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "RELOAD",
        rawText: text,
        target: inferEffectTarget("RELOAD", text),
        targetFilter: inferTargetFilter(text),
        operation: "TRIGGER",
        condition,
      })
    );
  }

  if (/\bdestroy\b|\bdestroyed\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "DESTROY",
        rawText: text,
        target: inferEffectTarget("DESTROY", text),
        targetFilter: inferTargetFilter(text),
        count: parseCount(text),
        operation: "TRIGGER",
        condition,
      })
    );
  }

  if (/\brepair\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "REPAIR",
        rawText: text,
        target: inferEffectTarget("REPAIR", text),
        targetFilter: inferTargetFilter(text),
        count: parseCount(text),
        operation: "TRIGGER",
        condition,
      })
    );
  }

  if (/starts Flying|start Flying/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "FLYING_START",
        rawText: text,
        target: inferEffectTarget("FLYING_START", text),
        targetFilter: inferTargetFilter(text),
        operation: "TRIGGER",
        condition,
      })
    );
  }

  if (/stops Flying|stop Flying/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "FLYING_STOP",
        rawText: text,
        target: inferEffectTarget("FLYING_STOP", text),
        targetFilter: inferTargetFilter(text),
        operation: "TRIGGER",
        condition,
      })
    );
  }

  const multicastGain = text.match(/\+(-?\d+(?:\.\d+)?)\s+Multicast/i);
  if (multicastGain) {
    effects.push(
      makeEffect({
        kind: "MULTICAST_MOD",
        rawText: text,
        target: inferEffectTarget("MULTICAST_MOD", text),
        targetFilter: inferTargetFilter(text),
        attribute: "Multicast",
        value: Number(multicastGain[1]),
        operation: "GAIN",
        condition,
      })
    );
  }

  if (/\btransform\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "TRANSFORM",
        rawText: text,
        target: inferEffectTarget("TRANSFORM", text),
        targetFilter: inferTargetFilter(text),
        operation: "TRIGGER",
        condition,
        formula: text,
      })
    );
  }

  if (/\bupgrade\b/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "UPGRADE",
        rawText: text,
        target: inferEffectTarget("UPGRADE", text),
        targetFilter: inferTargetFilter(text),
        operation: "TRIGGER",
        condition,
        formula: text,
      })
    );
  }

  if (/\bimmune\b|immunity/i.test(text)) {
    effects.push(
      makeEffect({
        kind: "IMMUNITY",
        rawText: text,
        target: inferEffectTarget("IMMUNITY", text),
        targetFilter: inferTargetFilter(text),
        operation: "SET",
        condition,
        formula: text,
      })
    );
  }

  return effects;
}

export function parseMobalyticsDescription(rawDescription: string): ParsedEffect[] {
  const text = stripMobalyticsMarkup(rawDescription);
  const { condition, effectText } = splitCondition(text);

  const effects: ParsedEffect[] = [];

  const scalingEffect = parseScalingEffect(effectText, condition);
  if (scalingEffect) effects.push(scalingEffect);

  effects.push(...parseKeywordEffects(effectText, condition));

  if (effects.length === 0) {
    effects.push(
      makeEffect({
        kind: condition ? "TRIGGER" : "OTHER",
        rawText: text,
        target: inferEffectTarget(condition ? "TRIGGER" : "OTHER", text),
        targetFilter: inferTargetFilter(text),
        operation: condition ? "TRIGGER" : "UNKNOWN",
        condition,
        formula: text,
      })
    );
  }

  return dedupeEffects(effects);
}

function dedupeEffects(effects: ParsedEffect[]): ParsedEffect[] {
  const seen = new Set<string>();
  const result: ParsedEffect[] = [];

  for (const effect of effects) {
    const key = JSON.stringify({
      kind: effect.kind,
      target: effect.target,
      targetFilter: effect.targetFilter,
      attribute: effect.attribute,
      resource: effect.resource,
      value: effect.value,
      unit: effect.unit,
      durationSeconds: effect.durationSeconds,
      count: effect.count,
      operation: effect.operation,
      condition: effect.condition,
      formula: effect.formula,
      metadata: effect.metadata,
      rawText: effect.rawText,
    });

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(effect);
  }

  return result;
}

export function parseMobalyticsItemTierEffects(
  item: MobalyticsItemForParsing
): ParsedTierEffects[] {
  const tierStats = item.tierStats ?? [];

  return tierStats.map((tierStat) => {
    const descriptions = tierStat.descriptions ?? [];
    const effects = descriptions.flatMap((description) =>
      parseMobalyticsDescription(description)
    );

    return {
      tier: tierStat.tier,
      cooldown: toNumber(tierStat.cooldown),
      ammo: toNumber(tierStat.ammo),
      multicast: toNumber(tierStat.multicast),
      critChance: toNumber(tierStat.critchance),
      descriptions: descriptions.map(stripMobalyticsMarkup),
      effects,
    };
  });
}

export function getPrimaryCombatNumbers(effects: ParsedEffect[]) {
  return {
    damage: firstValue(effects, "DAMAGE"),
    shield: firstValue(effects, "SHIELD"),
    heal: firstValue(effects, "HEAL"),
    burn: firstValue(effects, "BURN"),
    poison: firstValue(effects, "POISON"),
    regen: firstValue(effects, "REGEN"),
    chargeSeconds: firstValue(effects, "CHARGE"),
    critChance: firstValue(effects, "CRIT_CHANCE_MOD"),
    critDamage: firstValue(effects, "CRIT_DAMAGE_MOD"),
    multicastBonus: firstValue(effects, "MULTICAST_MOD"),
    ammoBonus: firstValue(effects, "AMMO_MOD"),
  };
}

function firstValue(effects: ParsedEffect[], kind: EffectKind): number | null {
  return effects.find((effect) => effect.kind === kind && effect.value !== null)
    ?.value ?? null;
}

function parseInvulnerability(text: string, condition: string | null): ParsedEffect | null {
  const match = text.match(/\bYou take no damage for\s+(-?\d+(?:\.\d+)?)\s+second/i);

  if (!match) return null;

  return makeEffect({
    kind: "INVULNERABILITY",
    rawText: text,
    target: "PLAYER",
    attribute: "Damage Taken",
    value: 0,
    unit: "damage",
    durationSeconds: Number(match[1]),
    operation: "SET",
    condition,
    metadata: {
      preventsDamage: true,
    },
  });
}
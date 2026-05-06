import type { BattleItem, BattleState, RuntimeEffect } from "./types.js";

export type RuntimeFormulaStat =
  | "damage"
  | "shield"
  | "heal"
  | "burn"
  | "poison"
  | "regen"
  | "cooldown"
  | "multicast"
  | "critChance"
  | "ammo"
  | "maxAmmo"
  | "maxHealth"
  | "value"
  | "rage";

const STAT_KIND_BY_RUNTIME_STAT: Partial<Record<RuntimeFormulaStat, string>> = {
  damage: "DAMAGE",
  shield: "SHIELD",
  heal: "HEAL",
  burn: "BURN",
  poison: "POISON",
  regen: "REGEN",
  cooldown: "COOLDOWN_MOD",
  multicast: "MULTICAST_MOD",
  critChance: "CRIT_CHANCE_MOD",
  ammo: "AMMO_MOD",
  maxAmmo: "MAX_AMMO_MOD",
  maxHealth: "MAX_HEALTH_MOD",
  value: "VALUE_MOD",
  rage: "RAGE",
};

export function resolveRuntimeAmount(input: {
  state: BattleState;
  source: BattleItem;
  effect: RuntimeEffect;
  stat?: RuntimeFormulaStat;
  fallback?: number;
}): number {
  const direct = input.effect.value;
  const textMultiplier = resolveTextMultiplier(getFormulaText(input.effect));

  if (input.effect.unit === "multiplier") {
    return direct ?? textMultiplier ?? 1;
  }

  if (input.effect.operation === "DOUBLE") return 2;
  if (input.effect.operation === "HALVE") return 0.5;

  const formulaValue = resolveFormulaValue(input.state, input.source, input.effect, input.stat);

  if (formulaValue !== null) {
    return formulaValue;
  }

  if (direct !== null && direct !== undefined) {
    const countMultiplier = resolveForEachCount(input.state, input.source, input.effect);
    return direct * (countMultiplier ?? 1);
  }

  return input.fallback ?? 0;
}

export function resolveItemStatValue(
  item: BattleItem,
  stat: RuntimeFormulaStat,
  state?: BattleState
): number {
  switch (stat) {
    case "damage":
      return Math.max(0, (getBaseEffectValue(item, "DAMAGE") + item.damageBonus) * item.damageMultiplier);
    case "shield":
      return Math.max(0, (getBaseEffectValue(item, "SHIELD") + item.shieldBonus) * item.shieldMultiplier);
    case "heal":
      return Math.max(0, (getBaseEffectValue(item, "HEAL") + item.healBonus) * item.healMultiplier);
    case "burn":
      return Math.max(0, (getBaseEffectValue(item, "BURN") + item.burnBonus) * item.burnMultiplier);
    case "poison":
      return Math.max(0, (getBaseEffectValue(item, "POISON") + item.poisonBonus) * item.poisonMultiplier);
    case "regen":
      return Math.max(0, (getBaseEffectValue(item, "REGEN") + item.regenBonus) * item.regenMultiplier);
    case "cooldown":
      return item.cooldownSeconds ?? item.baseCooldownSeconds ?? 0;
    case "multicast":
      return item.multicast;
    case "critChance":
      return item.critChance;
    case "ammo":
      return item.ammo ?? 0;
    case "maxAmmo":
      return item.ammoMax ?? 0;
    case "value":
      return Math.max(0, item.value + item.valueBonus) * item.valueMultiplier;
    case "rage":
      return state?.player.rageGainedThisFight ?? 0;
    case "maxHealth":
      return state?.player.maxHealth ?? 0;
  }
}

export function isSupportedRuntimeFormula(effect: {
  rawText: string;
  formula: string | null;
  unit: string | null;
  operation: string;
  value: number | null;
}): boolean {
  const text = getFormulaText(effect);

  if (!text) return false;

  return (
    hasSupportedMultiplierFormula(text) ||
    hasSupportedForEachFormula(text) ||
    hasSupportedEqualToFormula(text) ||
    hasSupportedPercentOfFormula(text) ||
    hasSupportedHalfCooldownFormula(text)
  );
}

function resolveFormulaValue(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  stat?: RuntimeFormulaStat
): number | null {
  const text = getFormulaText(effect);
  if (!text) return null;

  const multiplier = resolveTextMultiplier(text);

  if (hasForEachLanguage(text)) {
    const base = effect.value ?? multiplier ?? 1;
    const count = resolveForEachCount(state, source, effect) ?? 0;
    return base * count;
  }

  const percentOfStat = resolvePercentOfStat(text);
  if (percentOfStat) {
    const base = resolveFormulaStatValue(state, source, percentOfStat.stat);
    return base * (percentOfStat.percent / 100);
  }

  const equalToStat = resolveEqualToStat(text);
  if (equalToStat) {
    const base = resolveFormulaStatValue(state, source, equalToStat.stat);
    return base * equalToStat.multiplier;
  }

  if (multiplier !== null && stat) {
    const current = resolveItemStatValue(source, stat, state);
    return current * multiplier;
  }

  if (effect.unit === "multiplier" && effect.value !== null && stat) {
    const current = resolveItemStatValue(source, stat, state);
    return current * effect.value;
  }

  return null;
}

function resolveFormulaStatValue(
  state: BattleState,
  source: BattleItem,
  stat: RuntimeFormulaStat | "rageGained"
): number {
  if (stat === "maxHealth") return state.player.maxHealth;
  if (stat === "rageGained") return state.player.rageGainedThisFight;
  return resolveItemStatValue(source, stat, state);
}

function resolveForEachCount(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): number | null {
  const text = getFormulaText(effect);
  if (!hasForEachLanguage(text)) return null;

  const aliveItems = state.items.filter((item) => !item.isDestroyed);
  let candidates = aliveItems;

  if (/adjacent/i.test(text)) {
    candidates = aliveItems.filter(
      (item) =>
        item.slotIndex === source.slotIndex - 1 ||
        item.slotIndex === source.slotIndex + 1
    );
  } else if (/other/i.test(text)) {
    candidates = aliveItems.filter((item) => item.instanceId !== source.instanceId);
  }

  const filters = extractTagFilters(text, effect.targetFilter);
  if (filters.length === 0) {
    return candidates.length;
  }

  return candidates.filter((item) => hasAnyTag(item, filters)).length;
}

function getBaseEffectValue(item: BattleItem, kind: string): number {
  const matching = item.effects.find(
    (effect) =>
      effect.kind === kind &&
      effect.value !== null &&
      !isSelfStatMutationText(effect.rawText)
  );

  return matching?.value ?? 0;
}

function isSelfStatMutationText(rawText: string): boolean {
  return /\b(gain|gains|has|loses|double|triple|quadruple|for each|for every|equal to)\b/i.test(rawText) &&
    !/^\s*(deal|shield|heal|burn|poison|regen)\b/i.test(rawText);
}

function resolveEqualToStat(text: string): { stat: RuntimeFormulaStat | "rageGained"; multiplier: number } | null {
  const normalized = text.toLowerCase();

  const multiplier = resolveTextMultiplier(normalized) ?? 1;

  if (!/equal to|based on/i.test(normalized)) return null;

  const relevant = normalized.match(/(?:equal to|based on)\s+(.+)$/i)?.[1] ?? normalized;

  if (/rage .*gained|rage you have gained/.test(relevant)) return { stat: "rageGained", multiplier };
  if (/max health/.test(relevant)) return { stat: "maxHealth", multiplier };
  if (/crit chance/.test(relevant)) return { stat: "critChance", multiplier };
  if (/crit damage/.test(relevant)) return null;
  if (/ammo/.test(relevant)) return { stat: "ammo", multiplier };
  if (/value/.test(relevant)) return { stat: "value", multiplier };
  if (/shield/.test(relevant)) return { stat: "shield", multiplier };
  if (/heal|healed/.test(relevant)) return { stat: "heal", multiplier };
  if (/burn/.test(relevant)) return { stat: "burn", multiplier };
  if (/poison/.test(relevant)) return { stat: "poison", multiplier };
  if (/regen/.test(relevant)) return { stat: "regen", multiplier };
  if (/damage/.test(relevant)) return { stat: "damage", multiplier };

  return null;
}

function resolvePercentOfStat(text: string): { stat: RuntimeFormulaStat | "rageGained"; percent: number } | null {
  const match = text.match(/(-?\d+(?:\.\d+)?)%\s+of\s+(?:your\s+|this item's\s+|this item'?s\s+)?([A-Za-z ]+)/i);
  if (!match) return null;

  const statText = match[2].toLowerCase();
  const percent = Number(match[1]);

  if (!Number.isFinite(percent)) return null;

  if (statText.includes("max health")) return { stat: "maxHealth", percent };
  if (statText.includes("rage")) return { stat: "rageGained", percent };
  if (statText.includes("crit chance")) return { stat: "critChance", percent };
  if (statText.includes("damage")) return { stat: "damage", percent };
  if (statText.includes("shield")) return { stat: "shield", percent };
  if (statText.includes("heal")) return { stat: "heal", percent };
  if (statText.includes("burn")) return { stat: "burn", percent };
  if (statText.includes("poison")) return { stat: "poison", percent };
  if (statText.includes("regen")) return { stat: "regen", percent };
  if (statText.includes("ammo")) return { stat: "ammo", percent };
  if (statText.includes("value")) return { stat: "value", percent };

  return null;
}

function resolveTextMultiplier(text: string): number | null {
  if (/quadruple/i.test(text)) return 4;
  if (/triple/i.test(text)) return 3;
  if (/double|twice/i.test(text)) return 2;
  if (/half/i.test(text)) return 0.5;

  const timesMatch = text.match(/(-?\d+(?:\.\d+)?)\s+times/i);
  if (timesMatch) return Number(timesMatch[1]);

  return null;
}

function extractTagFilters(text: string, explicitTargetFilter: string | null): string[] {
  const tags = new Set<string>();

  if (explicitTargetFilter) {
    for (const tag of splitTagExpression(explicitTargetFilter)) tags.add(tag);
  }

  const patterns = [
    /for each (?:adjacent |other )?(.+?)(?:\.|$)/i,
    /for every (?:adjacent |other )?(.+?)(?:\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    for (const tag of splitTagExpression(match[1])) {
      tags.add(tag);
    }
  }

  return [...tags].filter(Boolean);
}

function splitTagExpression(input: string): string[] {
  return input
    .replace(/\byou have\b/gi, "")
    .replace(/\bon your board\b/gi, "")
    .replace(/\bin your stash\b/gi, "")
    .replace(/\bitem\b|\bitems\b/gi, "")
    .split(/\s+or\s+|\s+and\s+|,/) 
    .map((part) => normalizeTag(part))
    .filter((tag): tag is string => tag !== null);
}

function normalizeTag(input: string): string | null {
  const clean = input.trim().replace(/[^A-Za-z ]/g, "").trim();
  if (!clean) return null;

  const words = clean.split(/\s+/);
  const candidate = words[words.length - 1];
  if (!candidate) return null;

  const singular = candidate.replace(/s$/i, "");
  return singular.charAt(0).toUpperCase() + singular.slice(1).toLowerCase();
}

function hasAnyTag(item: BattleItem, tags: string[]): boolean {
  return tags.some((tag) =>
    item.tags.some((itemTag) => itemTag.toLowerCase() === tag.toLowerCase())
  );
}

function getFormulaText(effect: { rawText: string; formula: string | null }): string {
  return `${effect.rawText} ${effect.formula ?? ""}`.trim();
}

function hasForEachLanguage(text: string): boolean {
  return /\bfor each\b|\bfor every\b/i.test(text);
}

function hasSupportedForEachFormula(text: string): boolean {
  return hasForEachLanguage(text);
}

function hasSupportedMultiplierFormula(text: string): boolean {
  return /\bdouble\b|\btriple\b|\bquadruple\b|\btwice\b|\b\d+(?:\.\d+)?\s+times\b/i.test(text);
}

function hasSupportedEqualToFormula(text: string): boolean {
  return /\bequal to\b|\bbased on\b/i.test(text) &&
    /damage|shield|heal|burn|poison|regen|ammo|value|crit chance|max health|rage/i.test(text);
}

function hasSupportedPercentOfFormula(text: string): boolean {
  return /\d+(?:\.\d+)?%\s+of\s+(?:your\s+|this item's\s+|this item'?s\s+)?(?:damage|shield|heal|burn|poison|regen|ammo|value|crit chance|max health|rage)/i.test(text);
}

function hasSupportedHalfCooldownFormula(text: string): boolean {
  return /cooldown/i.test(text) && /half/i.test(text);
}

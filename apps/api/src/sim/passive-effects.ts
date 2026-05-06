import type { BattleItem, RuntimeEffect } from "./types.js";
import { isItemTarget } from "./targeting.js";

const STATIC_COMBAT_EFFECT_KINDS = new Set<string>([
  "DAMAGE",
  "SHIELD",
  "HEAL",
  "BURN",
  "POISON",
  "REGEN",
  "COOLDOWN_MOD",
  "MULTICAST_MOD",
  "CRIT_CHANCE_MOD",
  "CRIT_DAMAGE_MOD",
  "AMMO_MOD",
  "MAX_AMMO_MOD",
  "VALUE_MOD",
  "LIFESTEAL_MOD",
]);

const STAT_MUTATION_EFFECT_KINDS = new Set<string>([
  "DAMAGE",
  "SHIELD",
  "HEAL",
  "BURN",
  "POISON",
  "REGEN",
  "COOLDOWN_MOD",
  "MULTICAST_MOD",
  "CRIT_CHANCE_MOD",
  "CRIT_DAMAGE_MOD",
  "AMMO_MOD",
  "MAX_AMMO_MOD",
  "VALUE_MOD",
  "LIFESTEAL_MOD",
]);

/**
 * Returns true for player-board combat modifiers that should be applied once at
 * fight start and then ignored by normal ITEM_USED trigger resolution.
 *
 * Examples:
 * - Your Weapons gain +15 Damage for the fight
 * - Adjacent items have +1 Multicast
 * - This has +1 Multicast for each adjacent Food
 * - Your Friends' Cooldowns are reduced by 20%
 * - reduce this item's cooldown by half for the fight
 *
 * These are not active use effects; they mutate the board state for the fight.
 */
export function isStaticFightStartEffect(
  source: BattleItem,
  effect: RuntimeEffect
): boolean {
  if (!STATIC_COMBAT_EFFECT_KINDS.has(effect.kind)) return false;
  if (!isItemTarget(effect.target)) return false;
  if (isNonCombatOrUiCondition(effect.condition, effect.rawText)) return false;
  if (isActiveUseCondition(effect.condition) && source.cooldownSeconds !== null) return false;
  if (isEventDrivenCombatCondition(effect.condition)) return false;

  if (isDirectImmediateEffectText(effect.rawText)) return false;

  if (isSelfCooldownHalfFightStartEffect(effect)) return true;
  if (isStaticBoardModifierText(effect.rawText)) return true;

  // Passive/no-cooldown items often omit explicit "for the fight" wording in
  // imported text but still represent board modifiers rather than active uses.
  if (source.cooldownSeconds === null && isStatMutationText(effect)) return true;

  return false;
}

export function isStaticBoardModifierText(rawText: string): boolean {
  const raw = rawText.toLowerCase();

  if (/\bfor each\b|\bfor every\b/.test(raw)) return true;
  if (/\b(this|your|adjacent).+\b(has|have|gain|gains|loses|double|triple|quadruple)\b/.test(raw)) return true;
  if (/\b(your|adjacent).+\bcooldowns?\s+(are\s+)?(reduced|decreased|increased)\b/.test(raw)) return true;
  if (/\bcooldown\b/.test(raw) && /\bhalf|halved|reduced by half|reduce.*by half\b/.test(raw)) return true;
  if (/\bare affected by\b/.test(raw)) return true;

  return false;
}

export function isStaticEffectBlockedFromItemUse(effect: RuntimeEffect): boolean {
  if (isDirectImmediateEffectText(effect.rawText)) return false;
  if (isSelfCooldownHalfFightStartEffect(effect)) return true;
  if (!STAT_MUTATION_EFFECT_KINDS.has(effect.kind)) return false;

  return isStaticBoardModifierText(effect.rawText) || isStatMutationText(effect);
}

function isSelfCooldownHalfFightStartEffect(effect: RuntimeEffect): boolean {
  return (
    effect.kind === "COOLDOWN_MOD" &&
    effect.target === "SELF" &&
    /cooldown/i.test(effect.rawText) &&
    /half|halved|reduced by half|reduce.*by half/i.test(effect.rawText)
  );
}

function isStatMutationText(effect: RuntimeEffect): boolean {
  if (!STAT_MUTATION_EFFECT_KINDS.has(effect.kind)) return false;
  if (isDirectImmediateEffectText(effect.rawText)) return false;

  const raw = effect.rawText.toLowerCase();

  if (effect.unit === "multiplier") return true;

  if (
    effect.operation === "GAIN" ||
    effect.operation === "REDUCE" ||
    effect.operation === "INCREASE" ||
    effect.operation === "DOUBLE" ||
    effect.operation === "HALVE"
  ) {
    return true;
  }

  return /\b(this|your|adjacent).+\b(gain|gains|has|have|loses|double|triple|quadruple)\b/i.test(raw);
}

function isDirectImmediateEffectText(rawText: string): boolean {
  return (
    /^\s*(deal|shield|heal|burn|poison|regen)\b/i.test(rawText) ||
    /^\s*(haste|slow|freeze|chill|heat|charge|reload|repair|destroy)\b/i.test(rawText) ||
    /^\s*gain\s+\+?\d+(?:\.\d+)?\s+rage\b/i.test(rawText) ||
    /^\s*use\s+this\b/i.test(rawText)
  );
}

function isNonCombatOrUiCondition(condition: string | null, rawText: string): boolean {
  const value = `${condition ?? ""} ${rawText}`.toLowerCase();

  return (
    value.includes("when you sell") ||
    value.includes("when you buy") ||
    value.includes("at the start of each day") ||
    value.includes("merchant") ||
    value.includes("reroll") ||
    value.includes("shop")
  );
}

function isActiveUseCondition(condition: string | null): boolean {
  return Boolean(condition?.toLowerCase().includes("when you use"));
}

function isEventDrivenCombatCondition(condition: string | null): boolean {
  if (!condition) return false;

  const lower = condition.toLowerCase();

  // Deliberately do not include "when you use" here: some imported board auras
  // are phrased as use conditions but are better represented as one-time
  // fight-start stat modifiers for deterministic board simulation.
  return (
    lower.includes("when you burn") ||
    lower.includes("when you poison") ||
    lower.includes("when you slow") ||
    lower.includes("when you freeze") ||
    lower.includes("when you haste") ||
    lower.includes("when you heal") ||
    lower.includes("when you shield") ||
    lower.includes("when you crit") ||
    lower.includes("when you enrage") ||
    lower.includes("when this is") ||
    lower.includes("while this is") ||
    lower.includes("when your items start flying") ||
    lower.includes("when your items stop flying") ||
    lower.includes("the first time")
  );
}
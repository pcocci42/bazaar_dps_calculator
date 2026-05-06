import type {
  BattleItem,
  BattleState,
  SimulationConfig,
} from "./types.js";
import { resolveEffect } from "./effects.js";
import { resolveTriggeredEffects } from "./triggers.js";
import { getCooldownRate } from "./statuses.js";
import { emit, hasStatus, roundTime } from "./utils.js";
import { isStaticEffectBlockedFromItemUse } from "./passive-effects.js";

const MULTICAST_REPEAT_EFFECT_KINDS = new Set<string>([
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
  "CHARGE",
  "RELOAD",
  "DESTROY",
  "REPAIR",
  "FLYING_START",
  "FLYING_STOP",
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

export function tickItemCooldown(
  state: BattleState,
  item: BattleItem,
  delta: number,
  config: SimulationConfig
): void {
  if (item.isDestroyed) return;
  if (item.cooldownRemainingSeconds === null) return;
  if (item.cooldownSeconds === null) return;
  if (hasStatus(item, "FREEZE")) return;
  if (item.ammo !== null && item.ammo <= 0) return;

  const rate = getCooldownRate(item, config);
  item.cooldownRemainingSeconds = roundTime(
    Math.max(0, item.cooldownRemainingSeconds - delta * rate)
  );

  if (item.cooldownRemainingSeconds <= 0) {
    emit(state, {
      type: "ITEM_READY",
      sourceInstanceId: item.instanceId,
      targetInstanceId: item.instanceId,
      effectKind: null,
      amount: null,
      message: `${item.name} is ready`,
    });

    useItem(state, item, config);
  }
}

export function useItem(
  state: BattleState,
  item: BattleItem,
  config: SimulationConfig
): void {
  if (item.isDestroyed) return;
  if (item.ammo !== null && item.ammo <= 0) return;

  if (item.ammo !== null) {
    item.ammo -= 1;
  }

  state.totals.itemUses += 1;

  emit(state, {
    type: "ITEM_USED",
    sourceInstanceId: item.instanceId,
    targetInstanceId: item.instanceId,
    effectKind: null,
    amount: null,
    message: `${item.name} used`,
  });

  item.cooldownRemainingSeconds = item.cooldownSeconds;

  const immediateEffects = item.effects.filter(
    (effect) =>
      effect.condition === null &&
      !isRepeatedByMulticast(effect) &&
      !isStaticEffectBlockedFromItemUse(effect)
  );

  for (const effect of immediateEffects) {
    resolveEffect(state, item, effect, config, resolveTriggeredEffects);
  }

  const repeats = Math.max(1, Math.floor(item.multicast));
  const repeatedEffects = item.effects.filter(
    (effect) =>
      effect.condition === null &&
      isRepeatedByMulticast(effect) &&
      !isStaticEffectBlockedFromItemUse(effect)
  );

  for (let i = 0; i < repeats; i += 1) {
    for (const effect of repeatedEffects) {
      resolveEffect(state, item, effect, config, resolveTriggeredEffects);
    }
  }

  resolveTriggeredEffects(state, "ITEM_USED", item, config);
}

function isRepeatedByMulticast(effect: {
  kind: string;
  rawText: string;
  operation: string;
  unit: string | null;
}): boolean {
  if (!MULTICAST_REPEAT_EFFECT_KINDS.has(effect.kind)) return false;
  if (isStatMutationText(effect)) return false;

  return true;
}

function isStatMutationText(effect: {
  kind: string;
  rawText: string;
  operation: string;
  unit: string | null;
}): boolean {
  if (!STAT_MUTATION_EFFECT_KINDS.has(effect.kind)) return false;
  if (isDirectImmediateEffectText(effect.rawText)) return false;

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

  return /\b(this|your|adjacent).+\b(gain|gains|has|have|loses|double|triple|quadruple)\b/i.test(
    effect.rawText
  );
}

function isDirectImmediateEffectText(rawText: string): boolean {
  return (
    /^\s*(deal|shield|heal|burn|poison|regen)\b/i.test(rawText) ||
    /^\s*(haste|slow|freeze|chill|heat|charge|reload|repair|destroy)\b/i.test(rawText) ||
    /^\s*gain\s+\+?\d+(?:\.\d+)?\s+rage\b/i.test(rawText) ||
    /^\s*use\s+this\b/i.test(rawText)
  );
}
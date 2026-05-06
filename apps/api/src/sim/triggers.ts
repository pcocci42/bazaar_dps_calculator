import type {
  BattleEventType,
  BattleItem,
  BattleState,
  RuntimeEffect,
  SimulationConfig,
} from "./types.js";
import { resolveEffect } from "./effects.js";
import { hasStatus } from "./utils.js";
import { isStaticFightStartEffect } from "./passive-effects.js";

export function resolveFightStartEffects(
  state: BattleState,
  config: SimulationConfig
): void {
  for (const item of state.items) {
    for (const effect of item.effects) {
      if (shouldResolveAtFightStart(item, effect)) {
        resolveEffect(state, item, effect, config, resolveTriggeredEffects);
      }
    }
  }
}

export function resolveTriggeredEffects(
  state: BattleState,
  eventType: BattleEventType,
  eventSource: BattleItem,
  config: SimulationConfig,
  eventTarget: BattleItem | null = null
): void {
  for (const item of state.items) {
    if (item.isDestroyed) continue;

    for (const effect of item.effects) {
      if (!effect.condition) continue;
      if (shouldNeverResolveAsTriggered(item, effect)) continue;

      if (conditionMatchesEvent(effect.condition, eventType, eventSource, item, eventTarget)) {
        resolveEffect(state, item, effect, config, resolveTriggeredEffects);
      }
    }
  }
}

function shouldResolveAtFightStart(item: BattleItem, effect: RuntimeEffect): boolean {
  if (isStaticFightStartEffect(item, effect)) return true;
  if (isSelfCooldownHalfFightStartEffect(effect)) return true;
  if (isSelfStatMultiplierFightStartEffect(effect)) return true;

  if (effect.condition) {
    const condition = effect.condition.toLowerCase();

    if (
      condition.includes("start of each fight") ||
      condition.includes("start of the fight") ||
      condition.startsWith("for each") ||
      (condition === "heated" && hasStatus(item, "HEAT")) ||
      (condition === "chilled" && hasStatus(item, "CHILL")) ||
      (condition.includes("this is flying") && item.isFlying) ||
      (condition.includes("this is hasted") && hasStatus(item, "HASTE")) ||
      (condition.includes("this is slowed") && hasStatus(item, "SLOW")) ||
      (condition.includes("this is frozen") && hasStatus(item, "FREEZE"))
    ) {
      return true;
    }

    return false;
  }

  if (item.cooldownSeconds !== null) return false;

  return isPassiveFightStartEffect(effect);
}

function shouldNeverResolveAsTriggered(
  item: BattleItem,
  effect: RuntimeEffect
): boolean {
  return (
    isStaticFightStartEffect(item, effect) ||
    isSelfCooldownHalfFightStartEffect(effect) ||
    isSelfStatMultiplierFightStartEffect(effect)
  );
}

function isSelfCooldownHalfFightStartEffect(effect: RuntimeEffect): boolean {
  return (
    effect.kind === "COOLDOWN_MOD" &&
    effect.target === "SELF" &&
    /cooldown/i.test(effect.rawText) &&
    /half|halved|reduced by half|reduce.*by half/i.test(effect.rawText)
  );
}

function isSelfStatMultiplierFightStartEffect(effect: RuntimeEffect): boolean {
  if (effect.target !== "SELF") return false;

  if (
    effect.kind !== "DAMAGE" &&
    effect.kind !== "SHIELD" &&
    effect.kind !== "HEAL" &&
    effect.kind !== "BURN" &&
    effect.kind !== "POISON" &&
    effect.kind !== "REGEN" &&
    effect.kind !== "CRIT_CHANCE_MOD" &&
    effect.kind !== "CRIT_DAMAGE_MOD" &&
    effect.kind !== "MULTICAST_MOD"
  ) {
    return false;
  }

  return (
    effect.unit === "multiplier" ||
    /double|triple|quadruple|half|halved/i.test(effect.rawText)
  );
}

function isPassiveFightStartEffect(effect: RuntimeEffect): boolean {
  return (
    effect.kind === "DAMAGE" ||
    effect.kind === "SHIELD" ||
    effect.kind === "HEAL" ||
    effect.kind === "BURN" ||
    effect.kind === "POISON" ||
    effect.kind === "REGEN" ||
    effect.kind === "COOLDOWN_MOD" ||
    effect.kind === "MULTICAST_MOD" ||
    effect.kind === "CRIT_CHANCE_MOD" ||
    effect.kind === "CRIT_DAMAGE_MOD" ||
    effect.kind === "VALUE_MOD" ||
    effect.kind === "LIFESTEAL_MOD" ||
    effect.kind === "MAX_HEALTH_MOD" ||
    effect.kind === "MAX_AMMO_MOD" ||
    effect.kind === "AMMO_MOD" ||
    effect.kind === "TAG_MOD" ||
    effect.kind === "HASTE" ||
    effect.kind === "SLOW" ||
    effect.kind === "FREEZE" ||
    effect.kind === "CHILL" ||
    effect.kind === "HEAT" ||
    effect.kind === "INVULNERABILITY" ||
    effect.kind === "RAGE"
  );
}

export function conditionMatchesEvent(
  condition: string,
  eventType: BattleEventType,
  eventSource: BattleItem,
  effectOwner: BattleItem,
  eventTarget: BattleItem | null = null
): boolean {
  const lower = normalizeCondition(condition);
  const sourceIsSelf = eventSource.instanceId === effectOwner.instanceId;
  const targetIsSelf = eventTarget?.instanceId === effectOwner.instanceId;

  if (mentionsThis(lower) && !sourceIsSelf && !targetIsSelf) {
    return false;
  }

  if (isStatusCondition(lower, "hasted", "haste")) {
    return eventType === "HASTE_APPLIED" && (targetIsSelf || !mentionsThis(lower));
  }

  if (isStatusCondition(lower, "slowed", "slow")) {
    return eventType === "SLOW_APPLIED" && (targetIsSelf || !mentionsThis(lower));
  }

  if (isStatusCondition(lower, "frozen", "freeze")) {
    return eventType === "FREEZE_APPLIED" && (targetIsSelf || !mentionsThis(lower));
  }

  if (isStatusCondition(lower, "chilled", "chill")) {
    return eventType === "CHILL_APPLIED" && (targetIsSelf || !mentionsThis(lower));
  }

  if (isStatusCondition(lower, "heated", "heat")) {
    return eventType === "HEAT_APPLIED" && (targetIsSelf || !mentionsThis(lower));
  }

  if (eventType === "ITEM_USED") {
    if (lower.includes("adjacent") && lower.includes("use")) {
      return areAdjacent(effectOwner, eventSource);
    }

    if (lower.includes("another") && lower.includes("use")) {
      return !sourceIsSelf;
    }

    if (lower.includes("use") || lower.includes("uses")) {
      return sourceIsSelf || lower.includes("you") || lower.includes("your");
    }
  }

  if (eventType === "BURN_APPLIED") {
    if (lower.includes("burn")) return sourceIsSelf || !mentionsThis(lower);
  }

  if (eventType === "BURN_DAMAGE_DEALT") {
    if (lower.includes("burn") && lower.includes("damage")) return true;
  }

  if (eventType === "POISON_APPLIED") {
    if (lower.includes("poison")) return sourceIsSelf || !mentionsThis(lower);
  }

  if (eventType === "POISON_DAMAGE_DEALT") {
    if (lower.includes("poison") && lower.includes("damage")) return true;
  }

  if (eventType === "RAGE_GAINED") {
    if (lower.includes("rage")) return sourceIsSelf || !mentionsThis(lower);
  }

  if (eventType === "ENRAGE_STARTED") {
    if (lower.includes("enrage")) return true;
  }

  if (eventType === "CHARGE_APPLIED") {
    if (lower.includes("charge")) {
      return sourceIsSelf || targetIsSelf || !mentionsThis(lower);
    }
  }

  if (eventType === "FLYING_STARTED") {
    if ((lower.includes("start") || lower.includes("starts")) && lower.includes("flying")) {
      return sourceIsSelf || targetIsSelf || !mentionsThis(lower);
    }

    if (
      (lower.includes("while") || lower.includes("is")) &&
      lower.includes("flying") &&
      !lower.includes("stop")
    ) {
      return targetIsSelf || !mentionsThis(lower);
    }
  }

  if (eventType === "FLYING_STOPPED") {
    if (lower.includes("stop") && lower.includes("flying")) {
      return sourceIsSelf || targetIsSelf || !mentionsThis(lower);
    }
  }

  if (eventType === "ITEM_DESTROYED") {
    if (lower.includes("destroy")) {
      return sourceIsSelf || targetIsSelf || !mentionsThis(lower);
    }
  }

  if (eventType === "ITEM_REPAIRED") {
    if (lower.includes("repair")) {
      return sourceIsSelf || targetIsSelf || !mentionsThis(lower);
    }
  }

  return false;
}

function normalizeCondition(condition: string): string {
  return condition.toLowerCase().replace(/\s+/g, " ").trim();
}

function mentionsThis(condition: string): boolean {
  return /\bthis\b/.test(condition);
}

function isStatusCondition(condition: string, adjective: string, verb: string): boolean {
  return (
    condition === adjective ||
    condition.includes(`this is ${adjective}`) ||
    condition.includes(`this is affected by ${verb}`) ||
    condition.includes(`when you ${verb}`) ||
    condition.includes(`when your item ${verb}`) ||
    condition.includes(verb)
  );
}

function areAdjacent(a: BattleItem, b: BattleItem): boolean {
  return Math.abs(a.slotIndex - b.slotIndex) === 1;
}
import type {
  BattleEventType,
  BattleItem,
  BattleState,
  RuntimeEffect,
  SimulationConfig,
} from "./types.js";
import { getTargetsForEffect, isItemTarget } from "./targeting.js";
import { emit } from "./utils.js";
import { resolveRuntimeAmount } from "./formula-resolver.js";
import {
  applyBurn,
  applyDamage,
  applyHeal,
  applyPoison,
  applyRegen,
  applyShield,
} from "./combat.js";
import { applyStatusEffect } from "./statuses.js";

export type ResolveTriggeredEffectsFn = (
  state: BattleState,
  eventType: BattleEventType,
  eventSource: BattleItem,
  config: SimulationConfig,
  eventTarget?: BattleItem | null
) => void;

export function resolveEffect(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  switch (effect.kind) {
    case "DAMAGE":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "damage");
      } else {
        applyDamage(state, source, effect, config);
      }
      break;

    case "SHIELD":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "shield");
      } else {
        applyShield(state, source, effect);
      }
      break;

    case "HEAL":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "heal");
      } else {
        applyHeal(state, source, effect);
      }
      break;

    case "BURN":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "burn");
      } else {
        applyBurn(state, source, effect, config, resolveTriggeredEffects);
      }
      break;

    case "POISON":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "poison");
      } else {
        applyPoison(state, source, effect, config, resolveTriggeredEffects);
      }
      break;

    case "REGEN":
      if (isItemStatMutationEffect(effect)) {
        applyItemStatMod(state, source, effect, "regen");
      } else {
        applyRegen(state, source, effect);
      }
      break;

    case "HASTE":
    case "SLOW":
    case "FREEZE":
    case "CHILL":
    case "HEAT":
    case "INVULNERABILITY":
      applyStatusEffect(state, source, effect, config, resolveTriggeredEffects);
      break;

    case "RAGE":
      applyRage(state, source, effect, config, resolveTriggeredEffects);
      break;

    case "CHARGE":
      applyCharge(state, source, effect);
      break;

    case "RELOAD":
      applyReload(state, source, effect);
      break;

    case "FLYING_START":
      applyFlyingStart(state, source, effect, config, resolveTriggeredEffects);
      break;

    case "FLYING_STOP":
      applyFlyingStop(state, source, effect, config, resolveTriggeredEffects);
      break;

    case "DESTROY":
      applyDestroy(state, source, effect, config, resolveTriggeredEffects);
      break;

    case "COOLDOWN_MOD":
      applyCooldownMod(state, source, effect);
      break;

    case "MULTICAST_MOD":
      applyMulticastMod(state, source, effect);
      break;

    case "CRIT_CHANCE_MOD":
      applyCritChanceMod(state, source, effect);
      break;

    case "MAX_HEALTH_MOD":
      applyMaxHealthMod(state, source, effect);
      break;

    case "AMMO_MOD":
    case "MAX_AMMO_MOD":
      applyAmmoMod(state, source, effect);
      break;

    case "RESOURCE_GAIN":
      applyResourceGain(state, source, effect);
      break;

    default:
      emit(state, {
        type: "EFFECT_IGNORED",
        sourceInstanceId: source.instanceId,
        targetInstanceId: null,
        effectKind: effect.kind,
        amount: effect.value,
        message: `${source.name}: ignored unsupported runtime effect ${effect.kind}`,
        rawText: effect.rawText,
      });
      break;
  }
}


type MutableCombatStat = "damage" | "shield" | "heal" | "burn" | "poison" | "regen";

function isItemStatMutationEffect(effect: RuntimeEffect): boolean {
  if (!isItemTarget(effect.target)) return false;

  const raw = effect.rawText.toLowerCase();

  if (/^\s*(deal|shield|heal|burn|poison|regen)\b/i.test(effect.rawText)) {
    return false;
  }

  if (
    effect.operation === "GAIN" ||
    effect.operation === "REDUCE" ||
    effect.operation === "INCREASE" ||
    effect.operation === "DOUBLE" ||
    effect.operation === "HALVE"
  ) {
    return true;
  }

  if (effect.unit === "multiplier") return true;
  if (raw.includes(" gains ") || raw.includes(" gain ")) return true;
  if (raw.includes(" has double") || raw.includes(" has triple") || raw.includes(" has quadruple")) return true;
  if (raw.includes(" loses ")) return true;

  return false;
}

function applyItemStatMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  stat: MutableCombatStat
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat });
  if (amount === 0 && effect.unit !== "multiplier") return;

  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : effect.target === "SELF" ? [source] : [];

  for (const target of resolvedTargets) {
    applyMutableStatToItem(target, stat, effect, amount);

    emit(state, {
      type: "ITEM_STAT_MODIFIED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount,
      message: `${source.name} modified ${target.name}'s ${stat} (${describeStatValue(target, stat)})`,
      rawText: effect.rawText,
    });
  }
}

function applyMutableStatToItem(
  target: BattleItem,
  stat: MutableCombatStat,
  effect: RuntimeEffect,
  resolvedAmount: number
): void {
  const amount = resolvedAmount;

  if (effect.unit === "multiplier" || effect.operation === "DOUBLE" || effect.operation === "HALVE") {
    const multiplier =
      effect.operation === "DOUBLE"
        ? 2
        : effect.operation === "HALVE"
          ? 0.5
          : amount;

    multiplyItemStat(target, stat, multiplier);
    return;
  }

  if (effect.operation === "REDUCE") {
    addItemStatBonus(target, stat, -amount);
    return;
  }

  addItemStatBonus(target, stat, amount);
}

function addItemStatBonus(target: BattleItem, stat: MutableCombatStat, amount: number): void {
  switch (stat) {
    case "damage":
      target.damageBonus += amount;
      break;
    case "shield":
      target.shieldBonus += amount;
      break;
    case "heal":
      target.healBonus += amount;
      break;
    case "burn":
      target.burnBonus += amount;
      break;
    case "poison":
      target.poisonBonus += amount;
      break;
    case "regen":
      target.regenBonus += amount;
      break;
  }
}

function multiplyItemStat(target: BattleItem, stat: MutableCombatStat, multiplier: number): void {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return;

  switch (stat) {
    case "damage":
      target.damageMultiplier *= multiplier;
      break;
    case "shield":
      target.shieldMultiplier *= multiplier;
      break;
    case "heal":
      target.healMultiplier *= multiplier;
      break;
    case "burn":
      target.burnMultiplier *= multiplier;
      break;
    case "poison":
      target.poisonMultiplier *= multiplier;
      break;
    case "regen":
      target.regenMultiplier *= multiplier;
      break;
  }
}

function describeStatValue(target: BattleItem, stat: MutableCombatStat): string {
  switch (stat) {
    case "damage":
      return `bonus=${target.damageBonus}, multiplier=${target.damageMultiplier}`;
    case "shield":
      return `bonus=${target.shieldBonus}, multiplier=${target.shieldMultiplier}`;
    case "heal":
      return `bonus=${target.healBonus}, multiplier=${target.healMultiplier}`;
    case "burn":
      return `bonus=${target.burnBonus}, multiplier=${target.burnMultiplier}`;
    case "poison":
      return `bonus=${target.poisonBonus}, multiplier=${target.poisonMultiplier}`;
    case "regen":
      return `bonus=${target.regenBonus}, multiplier=${target.regenMultiplier}`;
  }
}

function applyRage(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: "rage" });
  if (amount <= 0) return;

  if (effect.attribute && /threshold/i.test(effect.attribute)) {
    emit(state, {
      type: "EFFECT_IGNORED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: null,
      effectKind: effect.kind,
      amount,
      message: `${source.name}: rage threshold modifiers are config/UI-level for now`,
      rawText: effect.rawText,
    });
    return;
  }

  state.player.rage += amount;
  state.player.rageGainedThisFight += amount;
  state.totals.rageGained += amount;

  emit(state, {
    type: "RAGE_GAINED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} gained ${amount} rage`,
    rawText: effect.rawText,
  });

  resolveTriggeredEffects(state, "RAGE_GAINED", source, config);

  if (!state.player.isEnraged && state.player.rage >= config.enrageThreshold) {
    const rageAtEnrage = state.player.rage;
    state.player.rage = Math.max(0, state.player.rage - config.enrageThreshold);
    state.player.isEnraged = true;
    state.player.enrageExpiresAt = state.time + config.enrageDurationSeconds;
    state.totals.enragesTriggered += 1;

    emit(state, {
      type: "ENRAGE_STARTED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: null,
      effectKind: effect.kind,
      amount: rageAtEnrage,
      message: `Player enraged at ${rageAtEnrage} rage`,
      rawText: effect.rawText,
    });

    resolveTriggeredEffects(state, "ENRAGE_STARTED", source, config);
  }
}

function applyCharge(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = effect.value ?? effect.durationSeconds ?? 0;
  if (amount <= 0) return;

  const targets = getTargetsForEffect(state, source, effect);

  for (const target of targets.length > 0 ? targets : [source]) {
    if (target.cooldownRemainingSeconds === null) continue;

    target.cooldownRemainingSeconds = Math.max(
      0,
      target.cooldownRemainingSeconds - amount
    );

    emit(state, {
      type: "CHARGE_APPLIED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount,
      message: `${source.name} charged ${target.name} by ${amount}s`,
      rawText: effect.rawText,
    });
  }
}

function applyReload(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (target.ammoMax === null) continue;

    target.ammo = target.ammoMax;

    emit(state, {
      type: "RELOAD_DONE",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount: target.ammo,
      message: `${source.name} reloaded ${target.name}`,
      rawText: effect.rawText,
    });
  }
}

function applyFlyingStart(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (target.isFlying) continue;

    target.isFlying = true;

    emit(state, {
      type: "FLYING_STARTED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount: null,
      message: `${target.name} started Flying`,
      rawText: effect.rawText,
    });

    resolveTriggeredEffects(state, "FLYING_STARTED", source, config, target);
  }
}

function applyFlyingStop(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];
  const isToggle = /starts? or stops? Flying/i.test(effect.rawText);

  for (const target of resolvedTargets) {
    if (!target.isFlying) {
      if (!isToggle) continue;

      target.isFlying = true;

      emit(state, {
        type: "FLYING_STARTED",
        sourceInstanceId: source.instanceId,
        targetInstanceId: target.instanceId,
        effectKind: effect.kind,
        amount: null,
        message: `${target.name} started Flying`,
        rawText: effect.rawText,
      });

      resolveTriggeredEffects(state, "FLYING_STARTED", source, config, target);
      continue;
    }

    target.isFlying = false;

    emit(state, {
      type: "FLYING_STOPPED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount: null,
      message: `${target.name} stopped Flying`,
      rawText: effect.rawText,
    });

    resolveTriggeredEffects(state, "FLYING_STOPPED", source, config, target);
  }
}

function applyDestroy(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (target.isDestroyed) continue;

    target.isDestroyed = true;

    emit(state, {
      type: "ITEM_DESTROYED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount: null,
      message: `${target.name} was destroyed`,
      rawText: effect.rawText,
    });

    resolveTriggeredEffects(state, "ITEM_DESTROYED", source, config, target);
  }
}

function applyCooldownMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: "cooldown" });
  if (amount <= 0) return;

  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (target.cooldownSeconds === null) continue;

    if (effect.operation === "HALVE" || (effect.unit === "multiplier" && amount < 1)) {
      target.cooldownSeconds = Math.max(0.1, target.cooldownSeconds * amount);
    }

    if (effect.operation === "DOUBLE" || (effect.unit === "multiplier" && amount > 1)) {
      target.cooldownSeconds *= amount;
    }

    if (effect.operation === "REDUCE") {
      if (effect.unit === "percent") {
        target.cooldownSeconds *= 1 - amount / 100;
      } else {
        target.cooldownSeconds = Math.max(0.1, target.cooldownSeconds - amount);
      }
    }

    if (effect.operation === "INCREASE") {
      if (effect.unit === "percent") {
        target.cooldownSeconds *= 1 + amount / 100;
      } else {
        target.cooldownSeconds += amount;
      }
    }

    target.cooldownRemainingSeconds = Math.min(
      target.cooldownRemainingSeconds ?? target.cooldownSeconds,
      target.cooldownSeconds
    );
  }
}

function applyMulticastMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: "multicast" });
  if (amount === 0) return;

  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    target.multicast += amount;
  }
}

function applyCritChanceMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: "critChance" });
  if (amount === 0) return;

  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (effect.operation === "REDUCE") {
      target.critChance = Math.max(0, target.critChance - amount);
    } else {
      target.critChance += amount;
    }
  }
}

function applyMaxHealthMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: "maxHealth" });
  if (amount === 0) return;

  if (effect.operation === "REDUCE") {
    state.enemy.maxHealth = Math.max(1, state.enemy.maxHealth - amount);
    state.enemy.health = Math.min(state.enemy.health, state.enemy.maxHealth);
  } else {
    state.player.maxHealth += amount;
    state.player.health += amount;
  }

  emit(state, {
    type: "HEAL_DONE",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} modified max health by ${amount}`,
    rawText: effect.rawText,
  });
}

function applyAmmoMod(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveRuntimeAmount({ state, source, effect, stat: effect.kind === "MAX_AMMO_MOD" ? "maxAmmo" : "ammo" });
  if (amount === 0) return;

  const targets = getTargetsForEffect(state, source, effect);
  const resolvedTargets = targets.length > 0 ? targets : [source];

  for (const target of resolvedTargets) {
    if (effect.kind === "MAX_AMMO_MOD") {
      target.ammoMax = (target.ammoMax ?? 0) + amount;
    }

    target.ammo = (target.ammo ?? 0) + amount;
  }
}

function applyResourceGain(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = effect.value ?? 0;

  if (effect.resource === "Gold") {
    state.player.gold += amount;
  }

  if (effect.resource === "Scrap") {
    state.player.scrap += amount;
  }

  emit(state, {
    type: "EFFECT_IGNORED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} gained resource ${effect.resource ?? "unknown"} ${amount}`,
    rawText: effect.rawText,
  });
}

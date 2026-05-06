import type {
  BattleEventType,
  BattleItem,
  BattleState,
  RuntimeEffect,
  SimulationConfig,
} from "./types.js";
import { emit, roundTime } from "./utils.js";
import { resolveRuntimeAmount } from "./formula-resolver.js";

type ResolveTriggeredEffectsFn = (
  state: BattleState,
  eventType: BattleEventType,
  eventSource: BattleItem,
  config: SimulationConfig
) => void;

export function tickBurnDamage(
  state: BattleState,
  config: SimulationConfig
): void {
  while (state.time >= state.nextBurnTickAt && state.enemy.burn > 0) {
    const burnBeforeTick = state.enemy.burn;
    const hasShield = state.enemy.shield > 0;

    const rawBurnDamage = burnBeforeTick;
    const effectiveDamage = hasShield
      ? rawBurnDamage * config.burnShieldDamageMultiplier
      : rawBurnDamage;

    const absorbedByShield = Math.min(state.enemy.shield, effectiveDamage);
    state.enemy.shield = Math.max(0, state.enemy.shield - absorbedByShield);

    const healthDamage = effectiveDamage - absorbedByShield;
    state.enemy.health = Math.max(0, state.enemy.health - healthDamage);

    state.enemy.burn = Math.max(0, state.enemy.burn - config.burnDecayPerTick);

    state.totals.damageDealt += effectiveDamage;
    state.totals.burnDamageDealt += effectiveDamage;

    emit(state, {
      type: "BURN_DAMAGE_DEALT",
      sourceInstanceId: null,
      targetInstanceId: null,
      effectKind: "BURN",
      amount: effectiveDamage,
      message:
        `Burn dealt ${effectiveDamage.toFixed(2)} damage` +
        (hasShield ? ` (${absorbedByShield.toFixed(2)} absorbed by shield)` : ""),
    });

    state.nextBurnTickAt = roundTime(
      state.nextBurnTickAt + config.burnTickIntervalSeconds
    );
  }

  while (state.time >= state.nextBurnTickAt && state.enemy.burn <= 0) {
    state.nextBurnTickAt = roundTime(
      state.nextBurnTickAt + config.burnTickIntervalSeconds
    );
  }
}

export function tickPoisonDamage(
  state: BattleState,
  config: SimulationConfig
): void {
  while (state.time >= state.nextPoisonTickAt && state.enemy.poison > 0) {
    const poisonBeforeTick = state.enemy.poison;
    const poisonDamage = poisonBeforeTick;

    state.enemy.health = Math.max(0, state.enemy.health - poisonDamage);

    if (config.poisonDecayPerTick > 0) {
      state.enemy.poison = Math.max(
        0,
        state.enemy.poison - config.poisonDecayPerTick
      );
    }

    state.totals.damageDealt += poisonDamage;
    state.totals.poisonDamageDealt += poisonDamage;

    emit(state, {
      type: "POISON_DAMAGE_DEALT",
      sourceInstanceId: null,
      targetInstanceId: null,
      effectKind: "POISON",
      amount: poisonDamage,
      message: `Poison dealt ${poisonDamage.toFixed(2)} damage directly to health`,
    });

    state.nextPoisonTickAt = roundTime(
      state.nextPoisonTickAt + config.poisonTickIntervalSeconds
    );
  }

  while (state.time >= state.nextPoisonTickAt && state.enemy.poison <= 0) {
    state.nextPoisonTickAt = roundTime(
      state.nextPoisonTickAt + config.poisonTickIntervalSeconds
    );
  }
}


export function tickRegenHealing(
  state: BattleState,
  config: SimulationConfig
): void {
  while (state.time >= state.nextRegenTickAt && state.player.regen > 0) {
    const amount = state.player.regen;
    const before = state.player.health;
    state.player.health = Math.min(state.player.maxHealth, state.player.health + amount);
    const actual = state.player.health - before;

    state.totals.healingDone += actual;
    state.totals.regenHealingDone += actual;

    emit(state, {
      type: "REGEN_HEAL_DONE",
      sourceInstanceId: null,
      targetInstanceId: null,
      effectKind: "REGEN",
      amount: actual,
      message: `Regen healed ${actual.toFixed(2)}`,
    });

    state.nextRegenTickAt = roundTime(
      state.nextRegenTickAt + config.regenTickIntervalSeconds
    );
  }

  while (state.time >= state.nextRegenTickAt && state.player.regen <= 0) {
    state.nextRegenTickAt = roundTime(
      state.nextRegenTickAt + config.regenTickIntervalSeconds
    );
  }
}

export function applyDamage(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig
): void {
  const baseDamage = resolveCombatAmount(state, source, effect, "damage");
  if (baseDamage <= 0) return;

  const critMultiplier = config.useExpectedCritDamage
    ? 1 + (source.critChance / 100) * (config.critDamageMultiplier - 1)
    : 1;

  const damage = baseDamage * critMultiplier;

  const absorbedByShield = Math.min(state.enemy.shield, damage);
  state.enemy.shield -= absorbedByShield;

  const healthDamage = damage - absorbedByShield;
  state.enemy.health = Math.max(0, state.enemy.health - healthDamage);

  state.totals.damageDealt += damage;

  emit(state, {
    type: "DAMAGE_DEALT",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount: damage,
    message: `${source.name} dealt ${damage.toFixed(2)} damage`,
    rawText: effect.rawText,
  });
}

export function applyShield(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveCombatAmount(state, source, effect, "shield");
  if (amount <= 0) return;

  state.player.shield += amount;
  state.totals.shieldGained += amount;

  emit(state, {
    type: "SHIELD_GAINED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} gained ${amount} shield`,
    rawText: effect.rawText,
  });
}

export function applyHeal(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveCombatAmount(state, source, effect, "heal");
  if (amount <= 0) return;

  const before = state.player.health;
  state.player.health = Math.min(state.player.maxHealth, state.player.health + amount);
  const actual = state.player.health - before;

  state.totals.healingDone += actual;

  emit(state, {
    type: "HEAL_DONE",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount: actual,
    message: `${source.name} healed ${actual}`,
    rawText: effect.rawText,
  });
}

export function applyBurn(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const amount = resolveCombatAmount(state, source, effect, "burn");
  if (amount <= 0) return;

  state.enemy.burn += amount;
  state.totals.burnApplied += amount;

  emit(state, {
    type: "BURN_APPLIED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} applied ${amount} burn`,
    rawText: effect.rawText,
  });

  resolveTriggeredEffects(state, "BURN_APPLIED", source, config);
}

export function applyPoison(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config: SimulationConfig,
  resolveTriggeredEffects: ResolveTriggeredEffectsFn
): void {
  const amount = resolveCombatAmount(state, source, effect, "poison");
  if (amount <= 0) return;

  state.enemy.poison += amount;
  state.totals.poisonApplied += amount;

  emit(state, {
    type: "POISON_APPLIED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} applied ${amount} poison`,
    rawText: effect.rawText,
  });

  resolveTriggeredEffects(state, "POISON_APPLIED", source, config);
}

export function applyRegen(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): void {
  const amount = resolveCombatAmount(state, source, effect, "regen");
  if (amount <= 0) return;

  state.player.regen += amount;
  state.totals.regenGained += amount;

  emit(state, {
    type: "REGEN_GAINED",
    sourceInstanceId: source.instanceId,
    targetInstanceId: null,
    effectKind: effect.kind,
    amount,
    message: `${source.name} gained ${amount} regen`,
    rawText: effect.rawText,
  });
}

type CombatStat = "damage" | "shield" | "heal" | "burn" | "poison" | "regen";

function resolveCombatAmount(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  stat: CombatStat
): number {
  const baseValue = resolveRuntimeAmount({ state, source, effect, stat });

  switch (stat) {
    case "damage":
      return Math.max(0, (baseValue + source.damageBonus) * source.damageMultiplier);
    case "shield":
      return Math.max(0, (baseValue + source.shieldBonus) * source.shieldMultiplier);
    case "heal":
      return Math.max(0, (baseValue + source.healBonus) * source.healMultiplier);
    case "burn":
      return Math.max(0, (baseValue + source.burnBonus) * source.burnMultiplier);
    case "poison":
      return Math.max(0, (baseValue + source.poisonBonus) * source.poisonMultiplier);
    case "regen":
      return Math.max(0, (baseValue + source.regenBonus) * source.regenMultiplier);
  }
}

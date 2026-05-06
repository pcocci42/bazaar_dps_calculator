import type {
  BattleItem,
  BattleState,
  BoardSlot,
  RuntimeEffect,
  RuntimeItemDefinition,
  SimulationConfig,
  SimulationResult,
} from "./types.js";
import { createInitialBattleState } from "./state.js";
import { resolveEffect } from "./effects.js";
import { resolveTriggeredEffects } from "./triggers.js";
import { emit } from "./utils.js";

export type SimulationSetup = {
  board: BoardSlot[];
  configOverrides?: Partial<SimulationConfig>;
  initialPlayerState?: InitialPlayerStateOverrides;
  initialEnemyState?: InitialEnemyStateOverrides;
  initialItemOverrides?: InitialItemOverride[];
  selectedEnchantments?: SelectedEnchantment[];
  appliedConfigEffects?: AppliedConfigEffect[];
};

export type InitialPlayerStateOverrides = {
  health?: number;
  maxHealth?: number;
  shield?: number;
  regen?: number;
  rage?: number;
  rageGainedThisFight?: number;
  gold?: number;
  scrap?: number;
};

export type InitialEnemyStateOverrides = {
  health?: number;
  maxHealth?: number;
  shield?: number;
  burn?: number;
  poison?: number;
};

export type InitialItemOverride = {
  slotIndex: number;
  name?: string;
  size?: string | null;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  baseCooldownSeconds?: number | null;
  cooldownSeconds?: number | null;
  cooldownRemainingSeconds?: number | null;
  ammoMax?: number | null;
  ammo?: number | null;
  multicast?: number;
  critChance?: number;
  value?: number;
  valueBonus?: number;
  valueMultiplier?: number;
  damageBonus?: number;
  shieldBonus?: number;
  healBonus?: number;
  burnBonus?: number;
  poisonBonus?: number;
  regenBonus?: number;
  damageMultiplier?: number;
  shieldMultiplier?: number;
  healMultiplier?: number;
  burnMultiplier?: number;
  poisonMultiplier?: number;
  regenMultiplier?: number;
  isFlying?: boolean;
  isDestroyed?: boolean;
  effectsToAdd?: RuntimeEffect[];
};

export type SelectedEnchantment = {
  slotIndex: number;
  enchantment: string;
  tagsToAdd?: string[];
  effectsToAdd?: RuntimeEffect[];
  itemOverrides?: Omit<InitialItemOverride, "slotIndex" | "effectsToAdd" | "addTags">;
  metadata?: Record<string, unknown> | null;
};

export type AppliedConfigEffect = {
  id?: string;
  enabled?: boolean;
  sourceSlotIndex?: number;
  targetSlotIndex?: number;
  label?: string;
  effect: RuntimeEffect;
};

export type ConfigurableBoardEffect = {
  sourceSlotIndex: number;
  sourceName: string;
  effect: RuntimeEffect;
  reason: string;
  suggestedControl: "toggle" | "select" | "numeric" | "manual";
};

export function prepareBoardForSimulationSetup(setup: SimulationSetup): BoardSlot[] {
  const board = cloneBoard(setup.board);

  for (const enchantment of setup.selectedEnchantments ?? []) {
    const slot = findBoardSlot(board, enchantment.slotIndex);
    if (!slot) continue;

    slot.item.tags = uniqueStrings([
      ...slot.item.tags,
      "Enchanted",
      enchantment.enchantment,
      ...(enchantment.tagsToAdd ?? []),
    ]);

    if (enchantment.itemOverrides) {
      applyDefinitionOverride(slot.item, enchantment.itemOverrides);
    }

    if (enchantment.effectsToAdd?.length) {
      slot.item.effects.push(...enchantment.effectsToAdd.map(cloneEffect));
    }
  }

  for (const override of setup.initialItemOverrides ?? []) {
    const slot = findBoardSlot(board, override.slotIndex);
    if (!slot) continue;

    applyDefinitionOverride(slot.item, override);

    if (override.effectsToAdd?.length) {
      slot.item.effects.push(...override.effectsToAdd.map(cloneEffect));
    }
  }

  return board.sort((a, b) => a.slotIndex - b.slotIndex);
}

export function getConfigOverridesFromSetup(setup: SimulationSetup): Partial<SimulationConfig> {
  const configOverrides: Partial<SimulationConfig> = {
    ...(setup.configOverrides ?? {}),
  };

  if (setup.initialPlayerState?.maxHealth !== undefined) {
    configOverrides.playerMaxHealth = setup.initialPlayerState.maxHealth;
  }

  if (setup.initialPlayerState?.health !== undefined) {
    configOverrides.playerStartingHealth = setup.initialPlayerState.health;
  }

  if (setup.initialPlayerState?.shield !== undefined) {
    configOverrides.playerStartingShield = setup.initialPlayerState.shield;
  }

  if (setup.initialEnemyState?.maxHealth !== undefined) {
    configOverrides.enemyMaxHealth = setup.initialEnemyState.maxHealth;
  }

  if (setup.initialEnemyState?.shield !== undefined) {
    configOverrides.enemyStartingShield = setup.initialEnemyState.shield;
  }

  return configOverrides;
}

export function createInitialBattleStateFromSetup(
  setup: SimulationSetup,
  config: SimulationConfig
): BattleState {
  const preparedBoard = prepareBoardForSimulationSetup(setup);
  const state = createInitialBattleState(preparedBoard, config);

  applyInitialStateOverrides(state, setup);
  applyRuntimeItemOverrides(state, setup);
  applySetupSelections(state, setup);
  applyConfigEffects(state, setup, config);

  return state;
}

export function applySimulationSetupToResult(result: SimulationResult): SimulationResult {
  return result;
}

export function getConfigurableBoardEffects(board: BoardSlot[]): ConfigurableBoardEffect[] {
  const configurableEffects: ConfigurableBoardEffect[] = [];

  for (const slot of board) {
    for (const effect of slot.item.effects) {
      const classification = classifyConfigurableEffect(effect);
      if (!classification) continue;

      configurableEffects.push({
        sourceSlotIndex: slot.slotIndex,
        sourceName: slot.item.name,
        effect,
        reason: classification.reason,
        suggestedControl: classification.suggestedControl,
      });
    }
  }

  return configurableEffects;
}

function applyInitialStateOverrides(state: BattleState, setup: SimulationSetup): void {
  const player = setup.initialPlayerState;
  if (player) {
    if (player.maxHealth !== undefined) state.player.maxHealth = player.maxHealth;
    if (player.health !== undefined) {
      state.player.health = Math.min(player.health, state.player.maxHealth);
    }
    if (player.shield !== undefined) state.player.shield = player.shield;
    if (player.regen !== undefined) state.player.regen = player.regen;
    if (player.rage !== undefined) state.player.rage = player.rage;
    if (player.rageGainedThisFight !== undefined) {
      state.player.rageGainedThisFight = player.rageGainedThisFight;
    }
    if (player.gold !== undefined) state.player.gold = player.gold;
    if (player.scrap !== undefined) state.player.scrap = player.scrap;
  }

  const enemy = setup.initialEnemyState;
  if (enemy) {
    if (enemy.maxHealth !== undefined) state.enemy.maxHealth = enemy.maxHealth;
    if (enemy.health !== undefined) {
      state.enemy.health = Math.min(enemy.health, state.enemy.maxHealth);
    }
    if (enemy.shield !== undefined) state.enemy.shield = enemy.shield;
    if (enemy.burn !== undefined) state.enemy.burn = enemy.burn;
    if (enemy.poison !== undefined) state.enemy.poison = enemy.poison;
  }
}

function applyRuntimeItemOverrides(state: BattleState, setup: SimulationSetup): void {
  for (const override of setup.initialItemOverrides ?? []) {
    const item = findBattleItem(state, override.slotIndex);
    if (!item) continue;

    applyRuntimeOverride(item, override);

    emit(state, {
      type: "SETUP_APPLIED",
      sourceInstanceId: item.instanceId,
      targetInstanceId: item.instanceId,
      effectKind: null,
      amount: null,
      message: `Applied setup override to ${item.name}`,
    });
  }
}

function applySetupSelections(state: BattleState, setup: SimulationSetup): void {
  for (const enchantment of setup.selectedEnchantments ?? []) {
    const item = findBattleItem(state, enchantment.slotIndex);
    if (!item) continue;

    item.tags = uniqueStrings([
      ...item.tags,
      "Enchanted",
      enchantment.enchantment,
      ...(enchantment.tagsToAdd ?? []),
    ]);

    if (enchantment.itemOverrides) {
      applyRuntimeOverride(item, enchantment.itemOverrides);
    }

    emit(state, {
      type: "SETUP_APPLIED",
      sourceInstanceId: item.instanceId,
      targetInstanceId: item.instanceId,
      effectKind: "ENCHANT",
      amount: null,
      message: `Selected ${enchantment.enchantment} enchantment for ${item.name}`,
    });
  }
}

function applyConfigEffects(
  state: BattleState,
  setup: SimulationSetup,
  config: SimulationConfig
): void {
  for (const configEffect of setup.appliedConfigEffects ?? []) {
    if (configEffect.enabled === false) continue;

    const source = resolveConfigEffectSource(state, configEffect);
    if (!source) continue;

    const effect = cloneEffect(configEffect.effect);
    effect.condition = null;
    effect.isCombatOnly = false;

    if (configEffect.targetSlotIndex !== undefined) {
      const target = findBattleItem(state, configEffect.targetSlotIndex);
      if (!target) continue;

      const targetedEffect = {
        ...effect,
        target: "SELF" as const,
        targetFilter: null,
      };

      resolveEffect(state, target, targetedEffect, config, resolveTriggeredEffects);
    } else {
      resolveEffect(state, source, effect, config, resolveTriggeredEffects);
    }

    emit(state, {
      type: "SETUP_APPLIED",
      sourceInstanceId: source.instanceId,
      targetInstanceId: configEffect.targetSlotIndex !== undefined
        ? findBattleItem(state, configEffect.targetSlotIndex)?.instanceId ?? null
        : null,
      effectKind: effect.kind,
      amount: effect.value,
      message: `Applied config effect${configEffect.label ? `: ${configEffect.label}` : ""}`,
      rawText: effect.rawText,
    });
  }
}

function resolveConfigEffectSource(
  state: BattleState,
  configEffect: AppliedConfigEffect
): BattleItem | null {
  if (configEffect.sourceSlotIndex !== undefined) {
    return findBattleItem(state, configEffect.sourceSlotIndex) ?? null;
  }

  if (configEffect.targetSlotIndex !== undefined) {
    return findBattleItem(state, configEffect.targetSlotIndex) ?? null;
  }

  return state.items[0] ?? null;
}

function applyDefinitionOverride(
  item: RuntimeItemDefinition,
  override: Omit<InitialItemOverride, "slotIndex">
): void {
  if (override.name !== undefined) item.name = override.name;
  if (override.size !== undefined) item.size = override.size;

  if (override.tags !== undefined) item.tags = uniqueStrings(override.tags);
  if (override.addTags?.length) item.tags = uniqueStrings([...item.tags, ...override.addTags]);
  if (override.removeTags?.length) {
    const removeTags = new Set(override.removeTags.map((tag) => tag.toLowerCase()));
    item.tags = item.tags.filter((tag) => !removeTags.has(tag.toLowerCase()));
  }

  if (override.baseCooldownSeconds !== undefined) item.baseCooldownSeconds = override.baseCooldownSeconds;
  if (override.ammoMax !== undefined) item.baseAmmo = override.ammoMax;
  if (override.multicast !== undefined) item.baseMulticast = override.multicast;
  if (override.critChance !== undefined) item.baseCritChance = override.critChance;
  if (override.value !== undefined) item.baseValue = override.value;
}

function applyRuntimeOverride(
  item: BattleItem,
  override: Omit<InitialItemOverride, "slotIndex" | "effectsToAdd">
): void {
  if (override.name !== undefined) item.name = override.name;
  if (override.size !== undefined) item.size = override.size;

  if (override.tags !== undefined) item.tags = uniqueStrings(override.tags);
  if (override.addTags?.length) item.tags = uniqueStrings([...item.tags, ...override.addTags]);
  if (override.removeTags?.length) {
    const removeTags = new Set(override.removeTags.map((tag) => tag.toLowerCase()));
    item.tags = item.tags.filter((tag) => !removeTags.has(tag.toLowerCase()));
  }

  if (override.baseCooldownSeconds !== undefined) item.baseCooldownSeconds = override.baseCooldownSeconds;
  if (override.cooldownSeconds !== undefined) item.cooldownSeconds = override.cooldownSeconds;
  if (override.cooldownRemainingSeconds !== undefined) {
    item.cooldownRemainingSeconds = override.cooldownRemainingSeconds;
  }
  if (override.ammoMax !== undefined) item.ammoMax = override.ammoMax;
  if (override.ammo !== undefined) item.ammo = override.ammo;
  if (override.multicast !== undefined) item.multicast = override.multicast;
  if (override.critChance !== undefined) item.critChance = override.critChance;
  if (override.value !== undefined) item.value = override.value;
  if (override.valueBonus !== undefined) item.valueBonus = override.valueBonus;
  if (override.valueMultiplier !== undefined) item.valueMultiplier = override.valueMultiplier;
  if (override.damageBonus !== undefined) item.damageBonus = override.damageBonus;
  if (override.shieldBonus !== undefined) item.shieldBonus = override.shieldBonus;
  if (override.healBonus !== undefined) item.healBonus = override.healBonus;
  if (override.burnBonus !== undefined) item.burnBonus = override.burnBonus;
  if (override.poisonBonus !== undefined) item.poisonBonus = override.poisonBonus;
  if (override.regenBonus !== undefined) item.regenBonus = override.regenBonus;
  if (override.damageMultiplier !== undefined) item.damageMultiplier = override.damageMultiplier;
  if (override.shieldMultiplier !== undefined) item.shieldMultiplier = override.shieldMultiplier;
  if (override.healMultiplier !== undefined) item.healMultiplier = override.healMultiplier;
  if (override.burnMultiplier !== undefined) item.burnMultiplier = override.burnMultiplier;
  if (override.poisonMultiplier !== undefined) item.poisonMultiplier = override.poisonMultiplier;
  if (override.regenMultiplier !== undefined) item.regenMultiplier = override.regenMultiplier;
  if (override.isFlying !== undefined) item.isFlying = override.isFlying;
  if (override.isDestroyed !== undefined) item.isDestroyed = override.isDestroyed;
}

function findBoardSlot(board: BoardSlot[], slotIndex: number): BoardSlot | null {
  return board.find((slot) => slot.slotIndex === slotIndex) ?? null;
}

function findBattleItem(state: BattleState, slotIndex: number): BattleItem | null {
  return state.items.find((item) => item.slotIndex === slotIndex) ?? null;
}

function cloneBoard(board: BoardSlot[]): BoardSlot[] {
  return board.map((slot) => ({
    slotIndex: slot.slotIndex,
    item: {
      ...slot.item,
      tags: [...slot.item.tags],
      effects: slot.item.effects.map(cloneEffect),
    },
  }));
}

function cloneEffect(effect: RuntimeEffect): RuntimeEffect {
  return {
    ...effect,
    metadata: effect.metadata ? { ...effect.metadata } : null,
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;

    const key = clean.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function classifyConfigurableEffect(effect: RuntimeEffect): Pick<ConfigurableBoardEffect, "reason" | "suggestedControl"> | null {
  const condition = effect.condition?.toLowerCase() ?? "";
  const rawText = effect.rawText.toLowerCase();

  if (effect.kind === "ENCHANT") {
    return {
      reason: "enchant should be selected before simulation",
      suggestedControl: "select",
    };
  }

  if (
    effect.kind === "TRANSFORM" ||
    effect.kind === "UPGRADE" ||
    effect.kind === "TAG_MOD"
  ) {
    return {
      reason: `${effect.kind.toLowerCase()} should be represented in board setup`,
      suggestedControl: "select",
    };
  }

  if (
    effect.isPermanent ||
    condition.includes("when you sell") ||
    condition.includes("when you buy") ||
    condition.includes("start of each day") ||
    rawText.includes("permanently")
  ) {
    return {
      reason: "pre-fight progression effect should be toggled or represented as initial board state",
      suggestedControl: "toggle",
    };
  }

  if (
    effect.kind === "VALUE_MOD" ||
    effect.kind === "RESOURCE_GAIN" ||
    effect.kind === "INCOME_MOD" ||
    effect.kind === "SHOP_MOD" ||
    effect.kind === "PRESTIGE" ||
    effect.kind === "CRIT_DAMAGE_MOD" ||
    effect.kind === "LIFESTEAL_MOD" ||
    effect.kind === "IMMUNITY"
  ) {
    return {
      reason: `${effect.kind.toLowerCase()} is configurable before combat or UI-level`,
      suggestedControl: effect.value === null ? "manual" : "toggle",
    };
  }

  return null;
}

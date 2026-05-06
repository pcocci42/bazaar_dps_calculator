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
  | "INVULNERABILITY"
  | "TEMPLATE"
  | "TRIGGER"
  | "OTHER";

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

export type EffectOperation =
  | "SET"
  | "GAIN"
  | "REDUCE"
  | "INCREASE"
  | "DOUBLE"
  | "HALVE"
  | "EQUAL_TO"
  | "TRIGGER"
  | "UNKNOWN";

export type RuntimeEffect = {
  id?: string;
  kind: EffectKind;
  target: EffectTarget;
  targetFilter: string | null;
  attribute: string | null;
  resource: string | null;
  value: number | null;
  unit: string | null;
  durationSeconds: number | null;
  count: number | null;
  operation: EffectOperation;
  condition: string | null;
  formula: string | null;
  metadata: Record<string, unknown> | null;
  isCombatOnly: boolean;
  isPermanent: boolean;
  rawText: string;
};

export type RuntimeItemDefinition = {
  cardId: string;
  name: string;
  hero: string | null;
  size: string | null;
  tags: string[];
  tier: string;
  baseCooldownSeconds: number | null;
  baseAmmo: number | null;
  baseMulticast: number | null;
  baseCritChance: number | null;
  baseValue?: number | null;
  effects: RuntimeEffect[];
};

export type BoardSlot = {
  slotIndex: number;
  item: RuntimeItemDefinition;
};

export type BattleStatusKind =
  | "HASTE"
  | "SLOW"
  | "FREEZE"
  | "INVULNERABILITY"
  | "CHILL"
  | "HEAT";

export type BattleStatus = {
  kind: BattleStatusKind;
  expiresAt: number;
  sourceInstanceId: string;
  value: number | null;
};

export type BattleItem = {
  instanceId: string;
  slotIndex: number;

  cardId: string;
  name: string;
  hero: string | null;
  size: string | null;
  tags: string[];
  tier: string;

  baseCooldownSeconds: number | null;
  cooldownSeconds: number | null;
  cooldownRemainingSeconds: number | null;

  ammoMax: number | null;
  ammo: number | null;

  multicast: number;
  critChance: number;

  value: number;
  valueBonus: number;
  valueMultiplier: number;

  damageBonus: number;
  shieldBonus: number;
  healBonus: number;
  burnBonus: number;
  poisonBonus: number;
  regenBonus: number;

  damageMultiplier: number;
  shieldMultiplier: number;
  healMultiplier: number;
  burnMultiplier: number;
  poisonMultiplier: number;
  regenMultiplier: number;

  isFlying: boolean;
  isDestroyed: boolean;

  statuses: BattleStatus[];
  effects: RuntimeEffect[];
};

export type PlayerState = {
  health: number;
  maxHealth: number;
  shield: number;
  regen: number;
  rage: number;
  rageGainedThisFight: number;
  isEnraged: boolean;
  enrageExpiresAt: number | null;
  gold: number;
  scrap: number;
};

export type EnemyState = {
  health: number;
  maxHealth: number;
  shield: number;
  burn: number;
  poison: number;
  statuses: BattleStatus[];
};

export type BattleEventType =
  | "FIGHT_START"
  | "ITEM_USED"
  | "ITEM_READY"
  | "ITEM_DESTROYED"
  | "ITEM_REPAIRED"
  | "DAMAGE_DEALT"
  | "SHIELD_GAINED"
  | "HEAL_DONE"
  | "BURN_APPLIED"
  | "BURN_DAMAGE_DEALT"
  | "POISON_APPLIED"
  | "POISON_DAMAGE_DEALT"
  | "REGEN_GAINED"
  | "REGEN_HEAL_DONE"
  | "RAGE_GAINED"
  | "ENRAGE_STARTED"
  | "ENRAGE_ENDED"
  | "HASTE_APPLIED"
  | "SLOW_APPLIED"
  | "FREEZE_APPLIED"
  | "CHILL_APPLIED"
  | "HEAT_APPLIED"
  | "INVULNERABILITY_APPLIED"
  | "CHARGE_APPLIED"
  | "RELOAD_DONE"
  | "FLYING_STARTED"
  | "FLYING_STOPPED"
  | "STATUS_EXPIRED"
  | "ITEM_STAT_MODIFIED"
  | "EFFECT_IGNORED";

export type BattleEvent = {
  time: number;
  type: BattleEventType;
  sourceInstanceId: string | null;
  targetInstanceId: string | null;
  effectKind: EffectKind | null;
  amount: number | null;
  message: string;
  rawText?: string;
};

export type BattleState = {
  time: number;
  player: PlayerState;
  enemy: EnemyState;
  items: BattleItem[];
  events: BattleEvent[];
  totals: BattleTotals;

  nextBurnTickAt: number;
  nextPoisonTickAt: number;
  nextRegenTickAt: number;
};

export type BattleTotals = {
  damageDealt: number;
  shieldGained: number;
  healingDone: number;
  burnApplied: number;
  burnDamageDealt: number;
  poisonApplied: number;
  poisonDamageDealt: number;
  regenGained: number;
  regenHealingDone: number;
  rageGained: number;
  enragesTriggered: number;
  itemUses: number;
};

export type SimulationConfig = {
  durationSeconds: number;
  tickSeconds: number;

  playerMaxHealth: number;
  playerStartingHealth: number | null;
  enemyMaxHealth: number;

  playerStartingShield: number;
  enemyStartingShield: number;

  hasteCooldownRateMultiplier: number;
  slowCooldownRateMultiplier: number;

  critDamageMultiplier: number;
  useExpectedCritDamage: boolean;

  burnTickIntervalSeconds: number;
  burnDecayPerTick: number;
  burnShieldDamageMultiplier: number;

  poisonTickIntervalSeconds: number;
  poisonDecayPerTick: number;

  regenTickIntervalSeconds: number;

  enrageThreshold: number;
  enrageDurationSeconds: number;
};

export type SimulationResult = {
  config: SimulationConfig;
  finalState: BattleState;
  events: BattleEvent[];
  totals: BattleTotals;
  dps: number;
};

export function defaultSimulationConfig(
  overrides: Partial<SimulationConfig> = {}
): SimulationConfig {
  return {
    durationSeconds: 10,
    tickSeconds: 0.05,

    playerMaxHealth: 1000,
    playerStartingHealth: null,
    enemyMaxHealth: 1000,

    playerStartingShield: 0,
    enemyStartingShield: 0,

    hasteCooldownRateMultiplier: 2,
    slowCooldownRateMultiplier: 0.5,

    critDamageMultiplier: 2,
    useExpectedCritDamage: true,

    burnTickIntervalSeconds: 0.5,
    burnDecayPerTick: 1,
    burnShieldDamageMultiplier: 0.5,

    poisonTickIntervalSeconds: 1,
    poisonDecayPerTick: 0,

    regenTickIntervalSeconds: 1,

    enrageThreshold: 100,
    enrageDurationSeconds: 5,

    ...overrides,
  };
}

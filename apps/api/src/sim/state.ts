import type { BattleState, BoardSlot, SimulationConfig } from "./types.js";

export function createInitialBattleState(
  board: BoardSlot[],
  config: SimulationConfig
): BattleState {
  return {
    time: 0,
    player: {
      health: Math.min(config.playerStartingHealth ?? config.playerMaxHealth, config.playerMaxHealth),
      maxHealth: config.playerMaxHealth,
      shield: config.playerStartingShield,
      regen: 0,
      rage: 0,
      rageGainedThisFight: 0,
      isEnraged: false,
      enrageExpiresAt: null,
      gold: 0,
      scrap: 0,
    },
    enemy: {
      health: config.enemyMaxHealth,
      maxHealth: config.enemyMaxHealth,
      shield: config.enemyStartingShield,
      burn: 0,
      poison: 0,
      statuses: [],
    },
    items: board
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => {
        const cooldown = slot.item.baseCooldownSeconds;

        return {
          instanceId: `${slot.slotIndex}:${slot.item.cardId}`,
          slotIndex: slot.slotIndex,

          cardId: slot.item.cardId,
          name: slot.item.name,
          hero: slot.item.hero,
          size: slot.item.size,
          tags: [...slot.item.tags],
          tier: slot.item.tier,

          baseCooldownSeconds: cooldown,
          cooldownSeconds: cooldown,
          cooldownRemainingSeconds: cooldown,

          ammoMax: slot.item.baseAmmo,
          ammo: slot.item.baseAmmo,

          multicast: slot.item.baseMulticast ?? 1,
          critChance: slot.item.baseCritChance ?? 0,

          value: slot.item.baseValue ?? 0,
          valueBonus: 0,
          valueMultiplier: 1,

          damageBonus: 0,
          shieldBonus: 0,
          healBonus: 0,
          burnBonus: 0,
          poisonBonus: 0,
          regenBonus: 0,

          damageMultiplier: 1,
          shieldMultiplier: 1,
          healMultiplier: 1,
          burnMultiplier: 1,
          poisonMultiplier: 1,
          regenMultiplier: 1,

          isFlying: false,
          isDestroyed: false,

          statuses: [],
          effects: slot.item.effects,
        };
      }),
    events: [],
    totals: {
      damageDealt: 0,
      shieldGained: 0,
      healingDone: 0,
      burnApplied: 0,
      burnDamageDealt: 0,
      poisonApplied: 0,
      poisonDamageDealt: 0,
      regenGained: 0,
      regenHealingDone: 0,
      rageGained: 0,
      enragesTriggered: 0,
      itemUses: 0,
    },
    nextBurnTickAt: config.burnTickIntervalSeconds,
    nextPoisonTickAt: config.poisonTickIntervalSeconds,
    nextRegenTickAt: config.regenTickIntervalSeconds,
  };
}

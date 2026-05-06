import type {
  BattleEventType,
  BattleItem,
  BattleState,
  RuntimeEffect,
  SimulationConfig,
} from "./types.js";
import { getTargetsForEffect } from "./targeting.js";
import { emit, hasStatus, roundTime } from "./utils.js";

type ResolveTriggeredEffectsFn = (
  state: BattleState,
  eventType: BattleEventType,
  eventSource: BattleItem,
  config: SimulationConfig,
  eventTarget?: BattleItem | null
) => void;

export function applyStatusEffect(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect,
  config?: SimulationConfig,
  resolveTriggeredEffects?: ResolveTriggeredEffectsFn
): void {
  const duration = effect.durationSeconds;
  if (duration === null || duration <= 0) return;

  const targets = getTargetsForEffect(state, source, effect);
  const statusKind = effect.kind;

  if (
    statusKind !== "HASTE" &&
    statusKind !== "SLOW" &&
    statusKind !== "FREEZE" &&
    statusKind !== "CHILL" &&
    statusKind !== "HEAT" &&
    statusKind !== "INVULNERABILITY"
  ) {
    return;
  }

  for (const target of targets.length > 0 ? targets : [source]) {
    target.statuses.push({
      kind: statusKind,
      expiresAt: roundTime(state.time + duration),
      sourceInstanceId: source.instanceId,
      value: effect.value,
    });

    const eventType = `${statusKind}_APPLIED` as BattleEventType;

    emit(state, {
      type: eventType,
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      effectKind: effect.kind,
      amount: duration,
      message: `${source.name} applied ${statusKind} to ${target.name} for ${duration}s`,
      rawText: effect.rawText,
    });

    if (config && resolveTriggeredEffects) {
      resolveTriggeredEffects(state, eventType, source, config, target);
    }
  }
}

export function expireStatuses(state: BattleState): void {
  for (const item of state.items) {
    const activeStatuses = [];

    for (const status of item.statuses) {
      if (status.expiresAt <= state.time) {
        emit(state, {
          type: "STATUS_EXPIRED",
          sourceInstanceId: status.sourceInstanceId,
          targetInstanceId: item.instanceId,
          effectKind: status.kind,
          amount: null,
          message: `${status.kind} expired on ${item.name}`,
        });
      } else {
        activeStatuses.push(status);
      }
    }

    item.statuses = activeStatuses;
  }
}

export function expireEnrage(state: BattleState): void {
  if (!state.player.isEnraged || state.player.enrageExpiresAt === null) return;
  if (state.player.enrageExpiresAt > state.time) return;

  state.player.isEnraged = false;
  state.player.enrageExpiresAt = null;

  emit(state, {
    type: "ENRAGE_ENDED",
    sourceInstanceId: null,
    targetInstanceId: null,
    effectKind: "RAGE",
    amount: null,
    message: "Player enrage ended",
  });
}

export function getCooldownRate(
  item: BattleItem,
  config: SimulationConfig
): number {
  let rate = 1;

  if (hasStatus(item, "HASTE")) {
    rate *= config.hasteCooldownRateMultiplier;
  }

  if (hasStatus(item, "SLOW")) {
    rate *= config.slowCooldownRateMultiplier;
  }

  return rate;
}

import {
  defaultSimulationConfig,
  type BattleState,
  type BoardSlot,
  type SimulationConfig,
  type SimulationResult,
} from "./types.js";
import { tickBurnDamage, tickPoisonDamage, tickRegenHealing } from "./combat.js";
import { tickItemCooldown } from "./item-runtime.js";
import { createInitialBattleState } from "./state.js";
import { expireEnrage, expireStatuses } from "./statuses.js";
import { resolveFightStartEffects } from "./triggers.js";
import { emit, roundTime } from "./utils.js";
import {
  createInitialBattleStateFromSetup,
  getConfigOverridesFromSetup,
  type SimulationSetup,
} from "./simulation-setup.js";

export function simulateBattle(
  board: BoardSlot[],
  configOverrides: Partial<SimulationConfig> = {}
): SimulationResult {
  const config = defaultSimulationConfig(configOverrides);
  const state = createInitialBattleState(board, config);

  runBattleLifecycle(state, config);

  return toSimulationResult(state, config);
}

export function simulateBattleWithSetup(setup: SimulationSetup): SimulationResult {
  const config = defaultSimulationConfig(getConfigOverridesFromSetup(setup));
  const state = createInitialBattleStateFromSetup(setup, config);

  runBattleLifecycle(state, config);

  return toSimulationResult(state, config);
}

function runBattleLifecycle(state: BattleState, config: SimulationConfig): void {
  emit(state, {
    type: "FIGHT_START",
    sourceInstanceId: null,
    targetInstanceId: null,
    effectKind: null,
    amount: null,
    message: "Fight started",
  });

  resolveFightStartEffects(state, config);

  while (state.time < config.durationSeconds) {
    tickBattle(state, config);
  }
}

function toSimulationResult(
  state: BattleState,
  config: SimulationConfig
): SimulationResult {
  return {
    config,
    finalState: state,
    events: state.events,
    totals: state.totals,
    dps: state.totals.damageDealt / config.durationSeconds,
  };
}

function tickBattle(state: BattleState, config: SimulationConfig): void {
  const nextTime = roundTime(state.time + config.tickSeconds);
  const delta = nextTime - state.time;

  state.time = nextTime;

  expireStatuses(state);
  expireEnrage(state);
  tickBurnDamage(state, config);
  tickPoisonDamage(state, config);
  tickRegenHealing(state, config);

  for (const item of state.items) {
    tickItemCooldown(state, item, delta, config);
  }
}

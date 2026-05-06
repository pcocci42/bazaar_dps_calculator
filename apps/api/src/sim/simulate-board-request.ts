import { PrismaClient } from "@prisma/client";
import type {
  BattleEvent,
  BoardSlot,
  RuntimeEffect,
  SimulationConfig,
  SimulationResult,
} from "./types.js";
import {
  buildBoardFromCardNames,
  type RuntimeBoardCardInput,
} from "./runtime-card-loader.js";
import {
  getConfigurableBoardEffects,
  type AppliedConfigEffect,
  type ConfigurableBoardEffect,
  type InitialEnemyStateOverrides,
  type InitialItemOverride,
  type InitialPlayerStateOverrides,
  type SelectedEnchantment,
  type SimulationSetup,
} from "./simulation-setup.js";
import { simulateBattleWithSetup } from "./simulator.js";

export type SimulateBoardRequestItem = RuntimeBoardCardInput;

export type SimulateBoardRequestSetup = {
  initialPlayerState?: InitialPlayerStateOverrides;
  initialEnemyState?: InitialEnemyStateOverrides;
  initialItemOverrides?: InitialItemOverride[];
  selectedEnchantments?: SelectedEnchantment[];
  appliedConfigEffects?: AppliedConfigEffect[];
};

export type SimulateBoardRequest = {
  source?: string;
  items: SimulateBoardRequestItem[];
  config?: Partial<SimulationConfig>;
  setup?: SimulateBoardRequestSetup;
  options?: {
    includeEvents?: boolean;
    maxEvents?: number;
    includeFinalState?: boolean;
    includeBoard?: boolean;
    includeConfigurableEffects?: boolean;
  };
};

export type SimulatedBoardItemSummary = {
  slotIndex: number;
  instanceId: string;
  cardId: string;
  name: string;
  tier: string;
  hero: string | null;
  size: string | null;
  tags: string[];
  baseCooldownSeconds: number | null;
  cooldownSeconds: number | null;
  cooldownRemainingSeconds: number | null;
  ammoMax: number | null;
  ammo: number | null;
  multicast: number;
  critChance: number;
  value: number;
  isFlying: boolean;
  isDestroyed: boolean;
  bonuses: {
    damage: number;
    shield: number;
    heal: number;
    burn: number;
    poison: number;
    regen: number;
    value: number;
  };
  multipliers: {
    damage: number;
    shield: number;
    heal: number;
    burn: number;
    poison: number;
    regen: number;
    value: number;
  };
  effects: RuntimeEffect[];
};

export type SimulationSummary = {
  dps: number;
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

export type SimulateBoardResponse = {
  summary: SimulationSummary;
  config: SimulationResult["config"];
  board?: SimulatedBoardItemSummary[];
  configurableEffects?: ConfigurableBoardEffect[];
  finalState?: SimulationResult["finalState"];
  events?: BattleEvent[];
  eventCount: number;
};

export type SimulateBoardRequestOptions = {
  prisma?: PrismaClient;
};

export async function simulateBoardRequest(
  request: SimulateBoardRequest,
  options: SimulateBoardRequestOptions = {}
): Promise<SimulateBoardResponse> {
  validateRequest(request);

  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? new PrismaClient();

  try {
    const board = await buildBoardFromCardNames(request.items, {
      prisma,
      source: request.source ?? "MOBALYTICS",
    });

    const setup: SimulationSetup = {
      board,
      configOverrides: request.config,
      initialPlayerState: request.setup?.initialPlayerState,
      initialEnemyState: request.setup?.initialEnemyState,
      initialItemOverrides: request.setup?.initialItemOverrides,
      selectedEnchantments: request.setup?.selectedEnchantments,
      appliedConfigEffects: request.setup?.appliedConfigEffects,
    };

    const result = simulateBattleWithSetup(setup);
    const maxEvents = request.options?.maxEvents ?? 250;
    const includeEvents = request.options?.includeEvents ?? true;
    const includeBoard = request.options?.includeBoard ?? true;
    const includeFinalState = request.options?.includeFinalState ?? true;
    const includeConfigurableEffects =
      request.options?.includeConfigurableEffects ?? true;

    return {
      summary: toSummary(result),
      config: result.config,
      board: includeBoard ? result.finalState.items.map(toBoardItemSummary) : undefined,
      configurableEffects: includeConfigurableEffects
        ? getConfigurableBoardEffects(board)
        : undefined,
      finalState: includeFinalState ? result.finalState : undefined,
      events: includeEvents ? result.events.slice(0, maxEvents) : undefined,
      eventCount: result.events.length,
    };
  } finally {
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  }
}

function validateRequest(request: SimulateBoardRequest): void {
  if (!Array.isArray(request.items) || request.items.length === 0) {
    throw new Error("Simulation request must include at least one item.");
  }

  const slotIndexes = new Set<number>();

  for (const item of request.items) {
    if (!item.name || !item.name.trim()) {
      throw new Error("Each simulation item must include a card name.");
    }

    if (!item.tier || !item.tier.trim()) {
      throw new Error(`Simulation item "${item.name}" must include a tier.`);
    }

    if (!Number.isInteger(item.slotIndex) || item.slotIndex < 0) {
      throw new Error(`Simulation item "${item.name}" has an invalid slotIndex.`);
    }

    if (slotIndexes.has(item.slotIndex)) {
      throw new Error(`Duplicate slotIndex in simulation request: ${item.slotIndex}.`);
    }

    slotIndexes.add(item.slotIndex);
  }
}

function toSummary(result: SimulationResult): SimulationSummary {
  return {
    dps: result.dps,
    damageDealt: result.totals.damageDealt,
    shieldGained: result.totals.shieldGained,
    healingDone: result.totals.healingDone,
    burnApplied: result.totals.burnApplied,
    burnDamageDealt: result.totals.burnDamageDealt,
    poisonApplied: result.totals.poisonApplied,
    poisonDamageDealt: result.totals.poisonDamageDealt,
    regenGained: result.totals.regenGained,
    regenHealingDone: result.totals.regenHealingDone,
    rageGained: result.totals.rageGained,
    enragesTriggered: result.totals.enragesTriggered,
    itemUses: result.totals.itemUses,
  };
}

function toBoardItemSummary(item: SimulationResult["finalState"]["items"][number]): SimulatedBoardItemSummary {
  return {
    slotIndex: item.slotIndex,
    instanceId: item.instanceId,
    cardId: item.cardId,
    name: item.name,
    tier: item.tier,
    hero: item.hero,
    size: item.size,
    tags: [...item.tags],
    baseCooldownSeconds: item.baseCooldownSeconds,
    cooldownSeconds: item.cooldownSeconds,
    cooldownRemainingSeconds: item.cooldownRemainingSeconds,
    ammoMax: item.ammoMax,
    ammo: item.ammo,
    multicast: item.multicast,
    critChance: item.critChance,
    value: item.value,
    isFlying: item.isFlying,
    isDestroyed: item.isDestroyed,
    bonuses: {
      damage: item.damageBonus,
      shield: item.shieldBonus,
      heal: item.healBonus,
      burn: item.burnBonus,
      poison: item.poisonBonus,
      regen: item.regenBonus,
      value: item.valueBonus,
    },
    multipliers: {
      damage: item.damageMultiplier,
      shield: item.shieldMultiplier,
      heal: item.healMultiplier,
      burn: item.burnMultiplier,
      poison: item.poisonMultiplier,
      regen: item.regenMultiplier,
      value: item.valueMultiplier,
    },
    effects: item.effects,
  };
}

export function buildSimulationSetupFromBoard(
  board: BoardSlot[],
  request: Omit<SimulateBoardRequest, "items" | "source">
): SimulationSetup {
  return {
    board,
    configOverrides: request.config,
    initialPlayerState: request.setup?.initialPlayerState,
    initialEnemyState: request.setup?.initialEnemyState,
    initialItemOverrides: request.setup?.initialItemOverrides,
    selectedEnchantments: request.setup?.selectedEnchantments,
    appliedConfigEffects: request.setup?.appliedConfigEffects,
  };
}

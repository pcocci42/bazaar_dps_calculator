import { PrismaClient } from "@prisma/client";
import type {
  BoardSlot,
  RuntimeEffect,
  RuntimeItemDefinition,
} from "./types.js";

export type RuntimeBoardCardInput = {
  name: string;
  tier: string;
  slotIndex: number;
};

export type RuntimeCardLoaderOptions = {
  source?: string;
  prisma?: PrismaClient;
};

type LoadedCard = Awaited<ReturnType<typeof loadCardByNameAndTier>>;

export async function buildBoardFromCardNames(
  cards: RuntimeBoardCardInput[],
  options: RuntimeCardLoaderOptions = {}
): Promise<BoardSlot[]> {
  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? new PrismaClient();

  try {
    const board: BoardSlot[] = [];

    for (const input of cards) {
      const loaded = await loadCardByNameAndTier(prisma, input.name, input.tier, {
        source: options.source,
      });

      board.push({
        slotIndex: input.slotIndex,
        item: toRuntimeItemDefinition(loaded),
      });
    }

    return board.sort((a, b) => a.slotIndex - b.slotIndex);
  } finally {
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  }
}

async function loadCardByNameAndTier(
  prisma: PrismaClient,
  name: string,
  tier: string,
  options: { source?: string } = {}
) {
  const card = await prisma.card.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
      source: options.source,
    },
    include: {
      tiers: {
        include: {
          effects: true,
        },
      },
    },
  });

  if (!card) {
    throw new Error(`Card not found: ${name}`);
  }

  const selectedTier = card.tiers.find(
    (cardTier) => cardTier.tier.toLowerCase() === tier.toLowerCase()
  );

  if (!selectedTier) {
    const availableTiers = card.tiers.map((cardTier) => cardTier.tier).join(", ");

    throw new Error(
      `Tier "${tier}" not found for card "${name}". Available tiers: ${availableTiers}`
    );
  }

  return {
    card,
    tier: selectedTier,
  };
}

function toRuntimeItemDefinition(loaded: NonNullable<LoadedCard>): RuntimeItemDefinition {
  const { card, tier } = loaded;

  return {
    cardId: card.id,
    name: card.name,
    hero: card.hero,
    size: card.size,
    tags: parseTags(card.type),
    tier: tier.tier,

    baseCooldownSeconds: tier.cooldown ?? card.cooldown ?? null,
    baseAmmo: tier.ammo ?? null,
    baseMulticast: tier.multicast ?? null,
    baseCritChance: tier.critChance ?? null,
    baseValue: null,

    effects: tier.effects.map(toRuntimeEffect),
  };
}

function toRuntimeEffect(effect: {
  id: string;
  kind: string;
  target: string;
  targetFilter: string | null;
  attribute: string | null;
  resource: string | null;
  value: number | null;
  unit: string | null;
  durationSeconds: number | null;
  count: number | null;
  operation: string;
  condition: string | null;
  formula: string | null;
  metadata: unknown;
  isCombatOnly: boolean;
  isPermanent: boolean;
  rawText: string;
}): RuntimeEffect {
  return {
    id: effect.id,
    kind: effect.kind as RuntimeEffect["kind"],
    target: effect.target as RuntimeEffect["target"],
    targetFilter: effect.targetFilter,
    attribute: effect.attribute,
    resource: effect.resource,
    value: effect.value,
    unit: effect.unit,
    durationSeconds: effect.durationSeconds,
    count: effect.count,
    operation: effect.operation as RuntimeEffect["operation"],
    condition: effect.condition,
    formula: effect.formula,
    metadata: normalizeMetadata(effect.metadata),
    isCombatOnly: effect.isCombatOnly,
    isPermanent: effect.isPermanent,
    rawText: effect.rawText,
  };
}

function parseTags(type: string | null): string[] {
  if (!type) return [];

  return type
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    value,
  };
}
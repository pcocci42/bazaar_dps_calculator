import { Prisma, PrismaClient, SupportStatus } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getPrimaryCombatNumbers,
  parseMobalyticsItemTierEffects,
  type MobalyticsTierStat,
} from "./mobalytics-effect-parser.js";

const prisma = new PrismaClient();

const SOURCE = "MOBALYTICS";
const INPUT_FILE = path.resolve("data/import/mobalytics-items.json");

type RawMobalyticsTierStat = {
  descriptions?: string[];
  cooldown?: number | string | null;
  ammo?: number | string | null;
  lifesteal?: number | string | null;
  multicast?: number | string | null;
  critchance?: number | string | null;
  tier?: string;
};

type MobalyticsItem = {
  id: string;
  slug: string;
  icon?: string | null;
  name: string;
  size?: string | null;
  tags?: string[] | null;
  heroes?: Array<{ name: string }>;
  tierStats?: RawMobalyticsTierStat[];
  enchantments?: unknown[] | null;
  ammo?: string | number | null;
  lifesteal?: string | number | null;
  multicast?: string | number | null;
  cooldown?: string | number | null;
  critchance?: string | number | null;
  descriptions?: string[];
  __typename?: string;
};

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getPrimaryHero(item: MobalyticsItem): string | null {
  return item.heroes?.[0]?.name ?? null;
}

function getType(item: MobalyticsItem): string | null {
  if (!item.tags || item.tags.length === 0) {
    return null;
  }

  return item.tags.join(",");
}

function getText(item: MobalyticsItem): string | null {
  if (!item.descriptions || item.descriptions.length === 0) {
    return null;
  }

  return item.descriptions.join("\n");
}

function getCooldown(item: MobalyticsItem): number | null {
  const directCooldown = toNumberOrNull(item.cooldown);

  if (directCooldown !== null) {
    return directCooldown;
  }

  const firstTierCooldown = item.tierStats?.[0]?.cooldown;
  return toNumberOrNull(firstTierCooldown);
}

function getPrimaryTierName(item: MobalyticsItem): string | null {
  return item.tierStats?.[0]?.tier ?? null;
}

function normalizeTierStats(item: MobalyticsItem): MobalyticsTierStat[] {
  return (item.tierStats ?? []).map((tierStat, index) => ({
    tier: tierStat.tier ?? `Unknown-${index + 1}`,
    descriptions: tierStat.descriptions ?? [],
    cooldown: tierStat.cooldown ?? null,
    ammo: tierStat.ammo ?? null,
    lifesteal: tierStat.lifesteal ?? null,
    multicast: tierStat.multicast ?? null,
    critchance: tierStat.critchance ?? null,
  }));
}

function getParsedTiers(item: MobalyticsItem) {
  return parseMobalyticsItemTierEffects({
    id: item.id,
    slug: item.slug,
    name: item.name,
    tierStats: normalizeTierStats(item),
  });
}

function getPrimaryDamage(item: MobalyticsItem): number | null {
  const parsedTiers = getParsedTiers(item);
  const firstTier = parsedTiers[0];

  if (!firstTier) {
    return null;
  }

  return getPrimaryCombatNumbers(firstTier.effects).damage;
}

async function deletePreviousMobalyticsData() {
  console.log("Deleting previous Mobalytics cards...");

  await prisma.card.deleteMany({
    where: {
      source: SOURCE,
    },
  });

  await prisma.rawCard.deleteMany({
    where: {
      source: SOURCE,
    },
  });
}

async function importItem(item: MobalyticsItem) {
  const rawCard = await prisma.rawCard.create({
    data: {
      source: SOURCE,
      sourceCardId: item.id,
      patch: null,
      rawJson: item as unknown as Prisma.InputJsonValue,
    },
  });

  const card = await prisma.card.create({
    data: {
      rawCardId: rawCard.id,

      name: item.name,
      hero: getPrimaryHero(item),
      type: getType(item),
      rarity: getPrimaryTierName(item),
      size: item.size ?? null,
      cooldown: getCooldown(item),
      damage: getPrimaryDamage(item),
      text: getText(item),

      source: SOURCE,
      patch: null,
      supportStatus: SupportStatus.PARTIAL,
    },
  });

  const parsedTiers = getParsedTiers(item);

  for (const parsedTier of parsedTiers) {
    const primaryNumbers = getPrimaryCombatNumbers(parsedTier.effects);

    const cardTier = await prisma.cardTier.create({
      data: {
        cardId: card.id,
        tier: parsedTier.tier,

        cooldown: parsedTier.cooldown,
        ammo: parsedTier.ammo,
        multicast: parsedTier.multicast,
        critChance: parsedTier.critChance,

        damage: primaryNumbers.damage,
        shield: primaryNumbers.shield,
        heal: primaryNumbers.heal,
        burn: primaryNumbers.burn,
        poison: primaryNumbers.poison,
        regen: primaryNumbers.regen,
        chargeSeconds: primaryNumbers.chargeSeconds,

        descriptions: parsedTier.descriptions as unknown as Prisma.InputJsonValue,
      },
    });

    if (parsedTier.effects.length > 0) {
      await prisma.cardEffect.createMany({
        data: parsedTier.effects.map((effect) => ({
          cardTierId: cardTier.id,
          kind: effect.kind,
          target: effect.target,
          targetFilter: effect.targetFilter,
          attribute: effect.attribute,
          resource: effect.resource,
          value: effect.value,
          unit: effect.unit,
          durationSeconds: effect.durationSeconds,
          count: effect.count,
          operation: effect.operation,
          condition: effect.condition,
          formula: effect.formula,
          metadata: effect.metadata as Prisma.InputJsonValue | undefined,
          isCombatOnly: effect.isCombatOnly,
          isPermanent: effect.isPermanent,
          rawText: effect.rawText,
        })),
      });
    }
  }
}

async function main() {
  const fileContent = await readFile(INPUT_FILE, "utf-8");
  const items = JSON.parse(fileContent) as MobalyticsItem[];

  console.log(`Loaded ${items.length} items from ${INPUT_FILE}`);

  await deletePreviousMobalyticsData();

  console.log("Importing items, tiers and effects...");

  let imported = 0;

  for (const item of items) {
    await importItem(item);

    imported += 1;

    if (imported % 100 === 0) {
      console.log(`Imported ${imported}/${items.length}`);
    }
  }

  console.log(`Imported ${imported} Mobalytics items into Postgres.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
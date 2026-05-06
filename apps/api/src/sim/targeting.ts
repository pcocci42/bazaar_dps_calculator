import type { BattleItem, BattleState, EffectTarget, RuntimeEffect } from "./types.js";

export function getTargetsForEffect(
  state: BattleState,
  source: BattleItem,
  effect: RuntimeEffect
): BattleItem[] {
  const aliveItems = state.items.filter((item) => !item.isDestroyed);

  let targets: BattleItem[];

  switch (effect.target) {
    case "SELF":
      targets = [source];
      break;

    case "LEFT_ITEM":
      targets = aliveItems.filter((item) => item.slotIndex === source.slotIndex - 1);
      break;

    case "RIGHT_ITEM":
      targets = aliveItems.filter((item) => item.slotIndex === source.slotIndex + 1);
      break;

    case "ADJACENT_ITEM":
    case "ADJACENT_ITEMS":
      targets = getAdjacentItems(aliveItems, source);
      break;

    case "YOUR_WEAPONS":
      targets = aliveItems.filter((item) => hasTag(item, "Weapon"));
      break;

    case "YOUR_SHIELD_ITEMS":
      targets = aliveItems.filter((item) => hasAnyEffectKind(item, ["SHIELD"]));
      break;

    case "YOUR_HEAL_ITEMS":
      targets = aliveItems.filter((item) => hasAnyEffectKind(item, ["HEAL"]));
      break;

    case "YOUR_BURN_ITEMS":
      targets = aliveItems.filter((item) => hasAnyEffectKind(item, ["BURN"]));
      break;

    case "YOUR_POISON_ITEMS":
      targets = aliveItems.filter((item) => hasAnyEffectKind(item, ["POISON"]));
      break;

    case "YOUR_REGEN_ITEMS":
      targets = aliveItems.filter((item) => hasAnyEffectKind(item, ["REGEN"]));
      break;

    case "YOUR_ITEM":
      targets = aliveItems.filter((item) => item.instanceId !== source.instanceId);
      break;

    case "YOUR_ITEMS":
      targets = aliveItems;
      break;

    case "ENEMY_ITEM":
    case "ENEMY_ITEMS":
      // We do not model the enemy board yet. For controlled single-board tests and
      // target-agnostic item effects like "Slow an item", resolve to friendly items
      // as a conservative local-board proxy instead of silently dropping the effect.
      targets = inferEnemyItemProxyTargets(source, effect, aliveItems);
      break;

    case "UNKNOWN":
      targets = inferUnknownTargets(source, effect, aliveItems);
      break;

    default:
      targets = [];
      break;
  }

  return applyTargetFilter(targets, effect.targetFilter);
}

function inferUnknownTargets(
  source: BattleItem,
  effect: RuntimeEffect,
  aliveItems: BattleItem[]
): BattleItem[] {
  const lower = effect.rawText.toLowerCase();
  const otherItems = aliveItems.filter((item) => item.instanceId !== source.instanceId);

  if (lower.includes("this")) {
    return [source];
  }

  if (lower.includes("item to the left")) {
    return aliveItems.filter((item) => item.slotIndex === source.slotIndex - 1);
  }

  if (lower.includes("item to the right")) {
    return aliveItems.filter((item) => item.slotIndex === source.slotIndex + 1);
  }

  if (lower.includes("adjacent")) {
    return getAdjacentItems(aliveItems, source);
  }

  if (lower.includes("all items") || lower.includes("your items")) {
    return aliveItems;
  }

  if (
    lower.includes("an item") ||
    lower.includes("a item") ||
    lower.includes("1 item") ||
    lower.includes("item(s)") ||
    lower.includes("items")
  ) {
    return otherItems.length > 0 ? otherItems : [source];
  }

  if (effect.targetFilter) {
    const targetFilter = effect.targetFilter.toLowerCase();

    if (
      lower.includes(`a ${targetFilter}`) ||
      lower.includes(`an ${targetFilter}`) ||
      lower.includes(`your ${targetFilter}`) ||
      lower.includes(targetFilter)
    ) {
      return otherItems.length > 0 ? otherItems : [source];
    }
  }

  if (lower.includes("your") || lower.includes("items")) {
    return aliveItems;
  }

  return [];
}

function inferEnemyItemProxyTargets(
  source: BattleItem,
  effect: RuntimeEffect,
  aliveItems: BattleItem[]
): BattleItem[] {
  const lower = effect.rawText.toLowerCase();
  const otherItems = aliveItems.filter((item) => item.instanceId !== source.instanceId);

  if (lower.includes("all items")) return aliveItems;
  if (lower.includes("adjacent")) return getAdjacentItems(aliveItems, source);

  return otherItems.length > 0 ? otherItems : [];
}

function getAdjacentItems(items: BattleItem[], source: BattleItem): BattleItem[] {
  return items.filter(
    (item) =>
      item.slotIndex === source.slotIndex - 1 ||
      item.slotIndex === source.slotIndex + 1
  );
}

function applyTargetFilter(items: BattleItem[], targetFilter: string | null): BattleItem[] {
  if (!targetFilter) return items;

  return items.filter((item) => hasTag(item, targetFilter));
}

function hasTag(item: BattleItem, tag: string): boolean {
  return item.tags.some((itemTag) => itemTag.toLowerCase() === tag.toLowerCase());
}

function hasAnyEffectKind(item: BattleItem, kinds: string[]): boolean {
  return item.effects.some((effect) => kinds.includes(effect.kind));
}

export function isItemTarget(effectTarget: EffectTarget): boolean {
  return (
    effectTarget === "SELF" ||
    effectTarget === "ADJACENT_ITEM" ||
    effectTarget === "ADJACENT_ITEMS" ||
    effectTarget === "LEFT_ITEM" ||
    effectTarget === "RIGHT_ITEM" ||
    effectTarget === "YOUR_ITEM" ||
    effectTarget === "YOUR_ITEMS" ||
    effectTarget === "YOUR_WEAPONS" ||
    effectTarget === "YOUR_SHIELD_ITEMS" ||
    effectTarget === "YOUR_HEAL_ITEMS" ||
    effectTarget === "YOUR_BURN_ITEMS" ||
    effectTarget === "YOUR_POISON_ITEMS" ||
    effectTarget === "YOUR_REGEN_ITEMS" ||
    effectTarget === "ENEMY_ITEM" ||
    effectTarget === "ENEMY_ITEMS" ||
    effectTarget === "UNKNOWN"
  );
}

import type { BoardSlot, RuntimeEffect, RuntimeItemDefinition } from "./types.js";

export function effect(
  input: Partial<RuntimeEffect> & Pick<RuntimeEffect, "kind" | "rawText">
): RuntimeEffect {
  return {
    kind: input.kind,
    target: input.target ?? "SELF",
    targetFilter: input.targetFilter ?? null,
    attribute: input.attribute ?? null,
    resource: input.resource ?? null,
    value: input.value ?? null,
    unit: input.unit ?? null,
    durationSeconds: input.durationSeconds ?? null,
    count: input.count ?? null,
    operation: input.operation ?? "SET",
    condition: input.condition ?? null,
    formula: input.formula ?? null,
    metadata: input.metadata ?? null,
    isCombatOnly: input.isCombatOnly ?? true,
    isPermanent: input.isPermanent ?? false,
    rawText: input.rawText,
  };
}

export function item(
  input: Partial<RuntimeItemDefinition> & Pick<RuntimeItemDefinition, "cardId" | "name" | "effects">
): RuntimeItemDefinition {
  return {
    cardId: input.cardId,
    name: input.name,
    hero: input.hero ?? null,
    size: input.size ?? "Small",
    tags: input.tags ?? [],
    tier: input.tier ?? "Diamond",
    baseCooldownSeconds: input.baseCooldownSeconds === undefined ? 1 : input.baseCooldownSeconds,
    baseAmmo: input.baseAmmo ?? null,
    baseMulticast: input.baseMulticast ?? 1,
    baseCritChance: input.baseCritChance ?? 0,
    baseValue: input.baseValue ?? null,
    effects: input.effects,
  };
}

export function board(items: RuntimeItemDefinition[]): BoardSlot[] {
  return items.map((runtimeItem, index) => ({
    slotIndex: index,
    item: runtimeItem,
  }));
}

export function assertClose(
  label: string,
  actual: number,
  expected: number,
  tolerance = 0.0001
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

export function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

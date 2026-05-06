import type { BattleEvent, BattleItem, BattleState } from "./types.js";

export function emit(
  state: BattleState,
  event: Omit<BattleEvent, "time">
): void {
  state.events.push({
    time: state.time,
    ...event,
  });
}

export function roundTime(value: number): number {
  return Math.round(value * 100000) / 100000;
}

export function hasStatus(item: BattleItem, kind: string): boolean {
  return item.statuses.some((status) => status.kind === kind);
}
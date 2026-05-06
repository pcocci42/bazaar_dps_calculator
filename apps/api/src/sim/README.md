# Bazaar simulation engine notes

This folder contains the runtime battle simulator used by the API project.

## Main entry points

- `simulator.ts` exposes `simulateBattle(board, configOverrides)`.
- `types.ts` defines runtime item/effect/state/result types.
- `run-smoke-tests.ts` runs the current core mechanics smoke suite.

Run the smoke suite from `apps/api`:

```bash
pnpm tsx src/sim/run-smoke-tests.ts
```

Run the real-card single-effect suite from `apps/api`:

```bash
pnpm tsx src/sim/smoke-test-real-cards-suite.ts
```

Run the real-card controlled-board suite from `apps/api`:

```bash
pnpm tsx src/sim/smoke-test-real-controlled-boards.ts
```

The controlled-board suite uses real DB cards in multi-item boards to validate targeting/interactions such as left-item Haste, non-self Slow/Freeze, Food-filtered Charge, adjacent Flying, adjacent Cooldown reduction, Weapon stat mutation, Multicast modification, Reload, and Destroy.

## Current modular structure

- `simulator.ts` - top-level orchestration and battle loop.
- `state.ts` - initial battle state creation.
- `item-runtime.ts` - item cooldown ticking, item use, ammo consumption, multicast execution.
- `effects.ts` - effect dispatch plus item-targeting effects such as Charge, Reload, Destroy, Flying, Cooldown, Crit, Ammo, Resources, and item stat mutation.
- `combat.ts` - direct combat numbers and tick-based combat: Damage, Shield, Heal, Regen, Burn, Poison.
- `statuses.ts` - Haste, Slow, Freeze, Chill, Heat, Invulnerability status application/expiry and cooldown-rate calculation.
- `triggers.ts` - fight-start effects and basic event-condition matching.
- `targeting.ts` - board item target resolution.
- `utils.ts` - shared helpers.
- `formula-resolver.ts` - runtime formula/scaling resolver for player-board combat effects.

## Supported core mechanics

Validated by `run-smoke-tests.ts`:

- Damage direct to enemy, including shield absorption.
- Item stat mutation for Damage/Shield/Heal/Burn/Poison/Regen bonuses and multipliers, so buffs such as “your Weapons gain Damage” affect future item uses.
- Shield gain for the player.
- Immediate Heal.
- Regen accumulation and 1-second healing ticks.
- Burn accumulation, 0.5-second damage ticks, per-tick decay, and reduced/absorbed Burn damage against Shield.
- Poison accumulation and 1-second damage ticks that bypass Shield.
- Expected crit damage using `baseCritChance` and `critDamageMultiplier`.
- Haste, Slow, and Freeze affecting item cooldown progress.
- Charge reducing item cooldown remaining time.
- Cooldown reduction/increase effects.
- Multicast repeating item effects per item use.
- Ammo consumption and Reload.
- Destroy stopping future item uses.
- Flying start/stop events and simple triggered effects.
- Rage gain, Enrage threshold/duration events, and `When you Enrage` triggers.
- Player-board condition triggers including `When you Burn`, `When you Poison`, `When you Haste/Slow/Freeze`, `When this is Hasted/Slowed/Frozen/Chilled/Heated`, and adjacent-item use triggers.
- Basic `When you use an item` style triggers.
- Runtime formula/scaling patterns for player-board combat: percent of max health/stat, equal-to item stat, `for each adjacent/other tag`, multiplier effects, and half cooldown.

## Still partial / intentionally conservative

These are represented in parsed effects, but should be expanded with card-specific tests before being treated as fully accurate:

- Enemy item behavior beyond direct player-vs-enemy aggregate state.
- Full enemy board simulation and enemy item cooldowns.
- Complex conditional language beyond the current `triggers.ts` matcher.
- Dynamic tag/type changes and their downstream effects.
- Complex formulas that depend on previous event amounts, enemy board state, shop/economy, or multi-fight history.
- Enchanting another item at runtime, shop/resource economy, prestige, transformations, templates. Enchant-related effects are preserved for UI/configuration, but the combat loop expects the selected enchanted item/effects to be supplied as initial runtime state.
- Permanent vs. for-fight persistence across multiple fights.
- Precise ordering for rare edge cases involving Destroy + triggered effects in the same use chain.

## Safety rule for future changes

When adding support for a new mechanic, add or update a smoke test in `run-smoke-tests.ts` first, then implement the mechanic, and verify the full suite still passes.

## Runtime coverage audit

Run the runtime coverage audit from `apps/api`:

```bash
pnpm tsx src/sim/audit-runtime-coverage.ts
```

Optional environment variables:

```bash
SIM_AUDIT_SOURCE=MOBALYTICS SIM_AUDIT_SAMPLE_LIMIT=8 pnpm tsx src/sim/audit-runtime-coverage.ts
```

The audit classifies every imported `CardTier` and `CardEffect` into:

- `SUPPORTED` - all effects are core runtime-supported and use simple values/targets.
- `PARTIAL` - the effect can often run, but relies on basic condition matching, target inference, scaling language, dynamic metadata, enemy-board proxies, or multi-fight persistence.
- `UNSUPPORTED` - the effect kind is not implemented in combat runtime yet, or the tier has no parsed runtime effects.

Use this audit as a planning tool rather than a hard truth. A `SUPPORTED` tier means the current runtime can execute the parsed effects mechanically; it does not prove every card-specific edge case is game-perfect. A `PARTIAL` tier is the priority queue for future focused smoke tests.

# Bazaar simulation engine notes

This folder contains the runtime battle simulator used by the API project.

## Main entry points

- `simulator.ts` exposes `simulateBattle(board, configOverrides)` and `simulateBattleWithSetup(setup)`.
- `types.ts` defines runtime item/effect/state/result types.
- `run-smoke-tests.ts` runs the current core mechanics and setup/config smoke suite.

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
- `simulation-setup.ts` - UI/API-ready setup layer for initial state, item overrides, selected enchantments, and toggled configurable effects.

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
- Simulation setup/config inputs: initial player/enemy state, item overrides, selected enchantments represented as board setup, and toggled pre-fight/configurable effects.

## Simulation setup layer

Use `simulateBattleWithSetup(setup)` when the UI/API needs to pass selected configuration into the fight. This keeps non-random choices outside the combat loop while still allowing them to affect the initial board accurately.

`SimulationSetup` supports:

- `board` - the selected board as `BoardSlot[]`.
- `configOverrides` - normal simulation config overrides such as duration, tick rate, health, shield, and Enrage settings.
- `initialPlayerState` - health, max health, shield, regen, rage, gold, and scrap before combat.
- `initialEnemyState` - aggregate/proxy enemy health, shield, Burn, and Poison before combat.
- `initialItemOverrides` - per-slot values such as tags, cooldown, ammo, crit chance, value, stat bonuses/multipliers, Flying/Destroyed flags, and additional effects.
- `selectedEnchantments` - deterministic enchantment choices. The combat loop does not randomly enchant during simulation; the UI should select the enchantment and pass tags/effects/stat overrides here.
- `appliedConfigEffects` - toggled pre-fight effects such as sell/buy/day/permanent bonuses that the user explicitly chooses to apply.

Use `getConfigurableBoardEffects(board)` to list board effects that should become UI controls instead of automatic combat actions.

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

The audit now uses runtime-aware classes instead of only `SUPPORTED/PARTIAL/UNSUPPORTED`:

- `SUPPORTED_COMBAT` - simulated directly by the player-board combat loop.
- `PARTIAL_COMBAT` - combat-relevant player-board effect, but still needs a focused implementation/test.
- `CONFIGURABLE` - preserved for UI or pre-fight setup, such as Enchant selection, permanent upgrades, sell/buy/day toggles, value inputs, transformations, and tag/type setup.
- `ENEMY_PROXY` - enemy-board effects represented only as aggregate/proxy behavior. This is intentional while the simulator focuses on the player board.
- `NON_COMBAT` - shop/economy/meta effects that should not execute inside the combat loop.
- `UNSUPPORTED` - truly unknown or unclassified behavior.

The key number for fight accuracy is `Player-board combat supported`, not total imported effects. Configurable and non-combat effects are not failures: they are inputs the UI should eventually expose and pass into the simulator as initial board/config state.

## API/request bridge

`simulate-board-request.ts` is the internal API-facing bridge. It accepts a frontend-shaped request, loads real cards from Postgres, applies `SimulationSetup`, runs the simulator, and returns a UI-friendly response.

Smoke-test the request bridge from `apps/api`:

```bash
pnpm sim:request
```

Example request body for `POST /sim/simulate`:

```json
{
  "source": "MOBALYTICS",
  "items": [
    { "name": "Old Saltclaw", "tier": "Gold", "slotIndex": 0 },
    { "name": "28 Hour Fitness", "tier": "Gold", "slotIndex": 1 }
  ],
  "config": {
    "durationSeconds": 14,
    "enemyMaxHealth": 5000
  },
  "setup": {
    "initialPlayerState": { "maxHealth": 1000 },
    "initialEnemyState": { "shield": 0 },
    "selectedEnchantments": [],
    "appliedConfigEffects": [],
    "initialItemOverrides": []
  },
  "options": {
    "includeEvents": true,
    "maxEvents": 250,
    "includeBoard": true,
    "includeFinalState": true,
    "includeConfigurableEffects": true
  }
}
```

The API project now exposes:

- `GET /health`
- `GET /cards/search?q=<name>&source=MOBALYTICS&limit=20`
- `POST /sim/simulate`

The `/sim/simulate` route intentionally uses selected/configured inputs for enchantments, permanent effects, buy/sell/day effects, and item overrides. It does not randomize or mutate meta-game state inside the combat loop.

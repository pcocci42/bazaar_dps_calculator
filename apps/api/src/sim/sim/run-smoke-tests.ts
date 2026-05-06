import { simulateBattle, simulateBattleWithSetup } from "./simulator.js";
import type { SimulationResult } from "./types.js";
import { assertClose, assertEqual, board, effect, item } from "./smoke-test-utils.js";

type SmokeTest = {
  name: string;
  run: () => SimulationResult;
  assert: (result: SimulationResult) => void;
};

const tests: SmokeTest[] = [
  {
    name: "damage direct",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "damage",
            name: "Damage Item",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 10, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 1000);
      assertClose("enemy health", result.finalState.enemy.health, 4000);
      assertEqual("itemUses", result.totals.itemUses, 10);
    },
  },

  {
    name: "damage stat bonus affects later uses",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "weapon-bonus-source",
            name: "Weapon Trainer",
            baseCooldownSeconds: null,
            tags: ["Property"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "YOUR_WEAPONS",
                targetFilter: "Weapon",
                attribute: "Damage",
                value: 50,
                operation: "GAIN",
                rawText: "Your Weapons gain +50 Damage for the fight",
              }),
            ],
          }),
          item({
            cardId: "buffed-weapon",
            name: "Buffed Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      const buffedWeapon = result.finalState.items.find((runtimeItem) => runtimeItem.name === "Buffed Weapon");
      if (!buffedWeapon) throw new Error("Buffed Weapon missing");
      assertClose("damage bonus", buffedWeapon.damageBonus, 50);
      assertClose("damageDealt", result.totals.damageDealt, 450);
      assertClose("enemy health", result.finalState.enemy.health, 4550);
    },
  },
  {
    name: "burn stat bonus affects later burn applications",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "burn-bonus-source",
            name: "Burn Trainer",
            baseCooldownSeconds: null,
            tags: ["Property"],
            effects: [
              effect({
                kind: "BURN",
                target: "YOUR_BURN_ITEMS",
                attribute: "Burn",
                value: 5,
                operation: "GAIN",
                rawText: "Your Burn items gain +5 Burn for the fight",
              }),
            ],
          }),
          item({
            cardId: "buffed-burn",
            name: "Buffed Burn Item",
            tags: ["Burn"],
            effects: [
              effect({
                kind: "BURN",
                target: "ENEMY",
                attribute: "Burn",
                value: 10,
                rawText: "Burn 10",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      const buffedBurnItem = result.finalState.items.find((runtimeItem) => runtimeItem.name === "Buffed Burn Item");
      if (!buffedBurnItem) throw new Error("Buffed Burn Item missing");
      assertClose("burn bonus", buffedBurnItem.burnBonus, 5);
      assertClose("burnApplied", result.totals.burnApplied, 45);
    },
  },
  {
    name: "shield",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "shield",
            name: "Shield Item",
            tags: ["Shield"],
            effects: [
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: 50,
                rawText: "Shield 50",
              }),
            ],
          }),
        ]),
        { durationSeconds: 10, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("shieldGained", result.totals.shieldGained, 500);
      assertClose("player shield", result.finalState.player.shield, 500);
      assertClose("damageDealt", result.totals.damageDealt, 0);
    },
  },
  {
    name: "heal immediate",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "heal",
            name: "Heal Item",
            tags: ["Heal"],
            effects: [
              effect({
                kind: "HEAL",
                target: "PLAYER",
                attribute: "Heal",
                value: 100,
                rawText: "Heal 100",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, playerMaxHealth: 1000, playerStartingHealth: 500 }
      ),
    assert: (result) => {
      assertClose("healingDone", result.totals.healingDone, 300);
      assertClose("player health", result.finalState.player.health, 800);
    },
  },
  {
    name: "regen tick",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "regen",
            name: "Regen Item",
            tags: ["Regen"],
            effects: [
              effect({
                kind: "REGEN",
                target: "PLAYER",
                attribute: "Regen",
                value: 10,
                rawText: "Regen 10",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, playerMaxHealth: 1000, playerStartingHealth: 500 }
      ),
    assert: (result) => {
      assertClose("regenGained", result.totals.regenGained, 30);
      assertClose("regenHealingDone", result.totals.regenHealingDone, 30);
      assertClose("player health", result.finalState.player.health, 530);
      assertClose("player regen", result.finalState.player.regen, 30);
    },
  },
  {
    name: "burn tick",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "burn",
            name: "Burn Item",
            tags: ["Burn"],
            effects: [
              effect({
                kind: "BURN",
                target: "ENEMY",
                attribute: "Burn",
                value: 10,
                rawText: "Burn 10",
              }),
            ],
          }),
        ]),
        { durationSeconds: 10, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("burnApplied", result.totals.burnApplied, 100);
      assertClose("burnDamageDealt", result.totals.burnDamageDealt, 747);
      assertClose("enemy health", result.finalState.enemy.health, 4253);
    },
  },
  {
    name: "burn vs shield",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "burn-shield",
            name: "Burn Item",
            tags: ["Burn"],
            effects: [
              effect({
                kind: "BURN",
                target: "ENEMY",
                attribute: "Burn",
                value: 10,
                rawText: "Burn 10",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000, enemyStartingShield: 1000 }
      ),
    assert: (result) => {
      assertClose("burnDamageDealt", result.totals.burnDamageDealt, 27);
      assertClose("enemy health", result.finalState.enemy.health, 5000);
      assertClose("enemy shield", result.finalState.enemy.shield, 973);
    },
  },
  {
    name: "poison bypasses shield",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "poison",
            name: "Poison Item",
            tags: ["Poison"],
            effects: [
              effect({
                kind: "POISON",
                target: "ENEMY",
                attribute: "Poison",
                value: 10,
                rawText: "Poison 10",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000, enemyStartingShield: 1000 }
      ),
    assert: (result) => {
      assertClose("poisonApplied", result.totals.poisonApplied, 30);
      assertClose("poisonDamageDealt", result.totals.poisonDamageDealt, 30);
      assertClose("enemy health", result.finalState.enemy.health, 4970);
      assertClose("enemy shield", result.finalState.enemy.shield, 1000);
    },
  },
  {
    name: "expected crit damage",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "crit",
            name: "Crit Weapon",
            tags: ["Weapon"],
            baseCritChance: 50,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000, critDamageMultiplier: 2 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 150);
      assertClose("enemy health", result.finalState.enemy.health, 4850);
    },
  },
  {
    name: "multicast",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "multicast",
            name: "Multicast Weapon",
            tags: ["Weapon"],
            baseMulticast: 3,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 300);
      assertEqual("itemUses", result.totals.itemUses, 1);
    },
  },
  {
    name: "haste speeds cooldown",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "haste",
            name: "Haste Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "HASTE",
                target: "SELF",
                attribute: "Haste",
                durationSeconds: 5,
                rawText: "Haste this for 5 seconds",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 5);
      assertClose("damageDealt", result.totals.damageDealt, 500);
    },
  },
  {
    name: "slow delays cooldown",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "slow",
            name: "Slow Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "SLOW",
                target: "SELF",
                attribute: "Slow",
                durationSeconds: 5,
                rawText: "Slow this for 5 seconds",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 2);
      assertClose("damageDealt", result.totals.damageDealt, 200);
    },
  },
  {
    name: "freeze pauses cooldown",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "freeze",
            name: "Freeze Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "FREEZE",
                target: "SELF",
                attribute: "Freeze",
                durationSeconds: 1,
                rawText: "Freeze this for 1 second",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 2);
      assertClose("damageDealt", result.totals.damageDealt, 200);
    },
  },
  {
    name: "charge self cooldown",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "charge",
            name: "Charge Weapon",
            tags: ["Weapon"],
            baseCooldownSeconds: 4,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
              effect({
                kind: "CHARGE",
                target: "SELF",
                attribute: "Charge",
                value: 2,
                unit: "seconds",
                rawText: "Charge this 2 seconds",
              }),
            ],
          }),
        ]),
        { durationSeconds: 10, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 4);
      assertClose("damageDealt", result.totals.damageDealt, 400);
    },
  },
  {
    name: "cooldown reduction",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "cooldown-mod",
            name: "Cooldown Weapon",
            tags: ["Weapon"],
            baseCooldownSeconds: 2,
            effects: [
              effect({
                kind: "COOLDOWN_MOD",
                target: "SELF",
                attribute: "Cooldown",
                value: 1,
                unit: "seconds",
                operation: "REDUCE",
                condition: "At the start of each fight",
                rawText: "At the start of each fight, reduce this item's Cooldown by 1 second for the fight",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 5, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 5);
      assertClose("damageDealt", result.totals.damageDealt, 500);
    },
  },
  {
    name: "ammo limits uses",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "ammo",
            name: "Ammo Weapon",
            tags: ["Weapon"],
            baseAmmo: 2,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 5, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 2);
      assertClose("damageDealt", result.totals.damageDealt, 200);
    },
  },
  {
    name: "reload restores ammo",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "reload",
            name: "Reload Weapon",
            tags: ["Weapon"],
            baseAmmo: 1,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
              effect({
                kind: "RELOAD",
                target: "SELF",
                rawText: "Reload this",
              }),
            ],
          }),
        ]),
        { durationSeconds: 3, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 3);
      assertClose("damageDealt", result.totals.damageDealt, 300);
    },
  },
  {
    name: "destroy stops future uses",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "destroy",
            name: "Destroy Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
              effect({
                kind: "DESTROY",
                target: "SELF",
                rawText: "Destroy this",
              }),
            ],
          }),
        ]),
        { durationSeconds: 5, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertEqual("itemUses", result.totals.itemUses, 1);
      assertClose("damageDealt", result.totals.damageDealt, 100);
      assertEqual("destroyed", result.finalState.items[0]?.isDestroyed, true);
    },
  },
  {
    name: "flying start and stop trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "flying-trigger",
            name: "Flying Trigger Item",
            tags: ["Vehicle"],
            effects: [
              effect({
                kind: "FLYING_START",
                target: "SELF",
                rawText: "This starts Flying",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 50,
                condition: "When this starts Flying",
                rawText: "When this starts Flying, deal 50 Damage",
              }),
              effect({
                kind: "FLYING_STOP",
                target: "SELF",
                condition: "When this starts Flying",
                rawText: "When this starts Flying, this stops Flying",
              }),
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: 25,
                condition: "When this stops Flying",
                rawText: "When this stops Flying, Shield 25",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 50);
      assertClose("shieldGained", result.totals.shieldGained, 25);
      assertEqual("isFlying", result.finalState.items[0]?.isFlying, false);
    },
  },
  {
    name: "basic item-used trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "trigger-a",
            name: "Trigger Source",
            tags: ["Tool"],
            effects: [
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: 10,
                rawText: "Shield 10",
              }),
            ],
          }),
          item({
            cardId: "trigger-b",
            name: "Triggered Weapon",
            tags: ["Weapon"],
            baseCooldownSeconds: 99,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 40,
                condition: "When you use an item",
                rawText: "When you use an item, deal 40 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("shieldGained", result.totals.shieldGained, 10);
      assertClose("damageDealt", result.totals.damageDealt, 40);
    },
  },

  {
    name: "formula percent of max health damage",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "percent-max-health",
            name: "Percent Max Health Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 20,
                unit: "percent",
                operation: "EQUAL_TO",
                formula: "Deal Damage equal to 20% of your Max Health",
                rawText: "Deal Damage equal to 20% of your Max Health",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, playerMaxHealth: 1000, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 200);
    },
  },
  {
    name: "formula shield equal to ammo",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "shield-ammo",
            name: "Ammo Shield Item",
            tags: ["Shield"],
            baseAmmo: 4,
            effects: [
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: null,
                operation: "EQUAL_TO",
                formula: "Shield equal to this item's Ammo",
                rawText: "Shield equal to this item's Ammo",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("shieldGained", result.totals.shieldGained, 3);
    },
  },
  {
    name: "formula burn equal to percent of shield",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "shield-burn",
            name: "Shield Burn Item",
            tags: ["Shield", "Burn"],
            effects: [
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: 100,
                rawText: "Shield 100",
              }),
              effect({
                kind: "BURN",
                target: "ENEMY",
                attribute: "Burn",
                value: 20,
                unit: "percent",
                operation: "EQUAL_TO",
                formula: "Burn equal to 20% of this item's Shield",
                rawText: "Burn equal to 20% of this item's Shield",
              }),
            ],
          }),
        ]),
        { durationSeconds: 1, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("shieldGained", result.totals.shieldGained, 100);
      assertClose("burnApplied", result.totals.burnApplied, 20);
    },
  },
  {
    name: "formula multicast for each adjacent food",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "food-left",
            name: "Food Left",
            tags: ["Food"],
            baseCooldownSeconds: 99,
            effects: [],
          }),
          item({
            cardId: "scaling-multicast",
            name: "Scaling Multicast",
            tags: ["Food", "Weapon"],
            effects: [
              effect({
                kind: "MULTICAST_MOD",
                target: "SELF",
                targetFilter: "Food",
                attribute: "Multicast",
                value: 1,
                operation: "GAIN",
                formula: "This has +1 Multicast for each adjacent Food.",
                rawText: "This has +1 Multicast for each adjacent Food.",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 50,
                rawText: "Deal 50 Damage",
              }),
            ],
          }),
          item({
            cardId: "food-right",
            name: "Food Right",
            tags: ["Food"],
            baseCooldownSeconds: 99,
            effects: [],
          }),
        ]),
        { durationSeconds: 2, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      const scaling = result.finalState.items.find((runtimeItem) => runtimeItem.name === "Scaling Multicast");
      if (!scaling) throw new Error("Scaling Multicast missing");
      assertClose("multicast", scaling.multicast, 3);
      assertClose("damageDealt", result.totals.damageDealt, 300);
    },
  },
  {
    name: "formula cooldown halved",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "half-cooldown",
            name: "Half Cooldown Weapon",
            tags: ["Weapon"],
            baseCooldownSeconds: 4,
            effects: [
              effect({
                kind: "COOLDOWN_MOD",
                target: "SELF",
                attribute: "Cooldown",
                value: 0.5,
                unit: "multiplier",
                operation: "HALVE",
                formula: "reduce this item's cooldown by half for the fight",
                rawText: "reduce this item's cooldown by half for the fight",
              }),
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 4, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      const itemState = result.finalState.items[0];
      assertClose("cooldownSeconds", itemState?.cooldownSeconds ?? 0, 2);
      assertClose("damageDealt", result.totals.damageDealt, 100);
    },
  },

  {
    name: "rage gain and enrage trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "rage",
            name: "Rage Item",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "RAGE",
                target: "PLAYER",
                attribute: "Rage",
                value: 60,
                operation: "GAIN",
                rawText: "Gain 60 Rage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 2, enemyMaxHealth: 5000, enrageThreshold: 100 }
      ),
    assert: (result) => {
      assertClose("rageGained", result.totals.rageGained, 120);
      assertClose("player rage", result.finalState.player.rage, 20);
      assertEqual("enragesTriggered", result.totals.enragesTriggered, 1);
      if (!result.events.some((event) => event.type === "ENRAGE_STARTED")) {
        throw new Error("Expected ENRAGE_STARTED event");
      }
    },
  },
  {
    name: "when you burn trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "burn-source",
            name: "Burn Source",
            tags: ["Burn"],
            effects: [
              effect({
                kind: "BURN",
                target: "ENEMY",
                attribute: "Burn",
                value: 10,
                rawText: "Burn 10",
              }),
            ],
          }),
          item({
            cardId: "burn-listener",
            name: "Burn Listener",
            tags: ["Shield"],
            effects: [
              effect({
                kind: "SHIELD",
                target: "PLAYER",
                attribute: "Shield",
                value: 20,
                condition: "When you Burn",
                rawText: "When you Burn, Shield 20",
              }),
            ],
          }),
        ]),
        { durationSeconds: 2, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("burnApplied", result.totals.burnApplied, 20);
      assertClose("shieldGained", result.totals.shieldGained, 40);
    },
  },
  {
    name: "when this is hasted trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "hasted-target",
            name: "Hasted Target",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 25,
                condition: "When this is Hasted",
                rawText: "When this is Hasted, Deal 25 Damage",
              }),
            ],
          }),
          item({
            cardId: "haste-source",
            name: "Haste Source",
            tags: ["Tool"],
            effects: [
              effect({
                kind: "HASTE",
                target: "LEFT_ITEM",
                attribute: "Haste",
                durationSeconds: 1,
                rawText: "Haste the item to the left of this for 1 second(s)",
              }),
            ],
          }),
        ]),
        { durationSeconds: 2, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      if (!result.events.some((event) => event.type === "HASTE_APPLIED")) {
        throw new Error("Expected HASTE_APPLIED event");
      }
      assertClose("damageDealt", result.totals.damageDealt, 50);
    },
  },
  {
    name: "when adjacent item used trigger",
    run: () =>
      simulateBattle(
        board([
          item({
            cardId: "adjacent-listener",
            name: "Adjacent Listener",
            tags: ["Tool"],
            baseCooldownSeconds: 99,
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 30,
                condition: "When you use an adjacent item",
                rawText: "When you use an adjacent item, Deal 30 Damage",
              }),
            ],
          }),
          item({
            cardId: "adjacent-user",
            name: "Adjacent User",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 10,
                rawText: "Deal 10 Damage",
              }),
            ],
          }),
        ]),
        { durationSeconds: 2, enemyMaxHealth: 5000 }
      ),
    assert: (result) => {
      assertClose("damageDealt", result.totals.damageDealt, 80);
    },
  },

  {
    name: "setup initial player and enemy state",
    run: () =>
      simulateBattleWithSetup({
        board: board([
          item({
            cardId: "setup-damage",
            name: "Setup Damage Item",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        configOverrides: {
          durationSeconds: 1,
          tickSeconds: 0.05,
        },
        initialPlayerState: {
          maxHealth: 1200,
          health: 900,
          shield: 50,
          gold: 7,
          scrap: 2,
        },
        initialEnemyState: {
          maxHealth: 2000,
          health: 1500,
          shield: 25,
        },
      }),
    assert: (result) => {
      assertClose("player maxHealth", result.finalState.player.maxHealth, 1200);
      assertClose("player health", result.finalState.player.health, 900);
      assertClose("player shield", result.finalState.player.shield, 50);
      assertClose("player gold", result.finalState.player.gold, 7);
      assertClose("player scrap", result.finalState.player.scrap, 2);
      assertClose("enemy maxHealth", result.finalState.enemy.maxHealth, 2000);
      assertClose("enemy health", result.finalState.enemy.health, 1425);
      assertClose("enemy shield", result.finalState.enemy.shield, 0);
    },
  },
  {
    name: "setup item override affects combat output",
    run: () =>
      simulateBattleWithSetup({
        board: board([
          item({
            cardId: "setup-weapon",
            name: "Setup Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        configOverrides: {
          durationSeconds: 2,
          enemyMaxHealth: 5000,
        },
        initialItemOverrides: [
          {
            slotIndex: 0,
            damageBonus: 50,
            critChance: 0,
          },
        ],
      }),
    assert: (result) => {
      assertClose("damage bonus", result.finalState.items[0].damageBonus, 50);
      assertClose("damageDealt", result.totals.damageDealt, 300);
    },
  },
  {
    name: "setup selected enchantment adds tag and stat override",
    run: () =>
      simulateBattleWithSetup({
        board: board([
          item({
            cardId: "enchant-target",
            name: "Enchant Target",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        configOverrides: {
          durationSeconds: 2,
          enemyMaxHealth: 5000,
        },
        selectedEnchantments: [
          {
            slotIndex: 0,
            enchantment: "Obsidian",
            itemOverrides: {
              damageBonus: 25,
            },
          },
        ],
      }),
    assert: (result) => {
      const target = result.finalState.items[0];
      if (!target.tags.includes("Enchanted") || !target.tags.includes("Obsidian")) {
        throw new Error(`Expected enchantment tags, got ${target.tags.join(",")}`);
      }
      assertClose("damage bonus", target.damageBonus, 25);
      assertClose("damageDealt", result.totals.damageDealt, 250);
    },
  },
  {
    name: "setup applied config effect toggles pre-fight bonus",
    run: () =>
      simulateBattleWithSetup({
        board: board([
          item({
            cardId: "config-source",
            name: "Config Source",
            tags: ["Tool"],
            baseCooldownSeconds: null,
            effects: [],
          }),
          item({
            cardId: "config-weapon",
            name: "Config Weapon",
            tags: ["Weapon"],
            effects: [
              effect({
                kind: "DAMAGE",
                target: "ENEMY",
                attribute: "Damage",
                value: 100,
                rawText: "Deal 100 Damage",
              }),
            ],
          }),
        ]),
        configOverrides: {
          durationSeconds: 2,
          enemyMaxHealth: 5000,
        },
        appliedConfigEffects: [
          {
            sourceSlotIndex: 0,
            label: "Sold bonus",
            effect: effect({
              kind: "DAMAGE",
              target: "YOUR_WEAPONS",
              targetFilter: "Weapon",
              attribute: "Damage",
              value: 20,
              operation: "GAIN",
              condition: "When you sell this",
              isCombatOnly: false,
              rawText: "When you sell this, your Weapons gain +20 Damage.",
            }),
          },
        ],
      }),
    assert: (result) => {
      const weapon = result.finalState.items.find((runtimeItem) => runtimeItem.name === "Config Weapon");
      if (!weapon) throw new Error("Config Weapon missing");
      assertClose("weapon damage bonus", weapon.damageBonus, 20);
      assertClose("damageDealt", result.totals.damageDealt, 240);
    },
  },

];

let passed = 0;

for (const test of tests) {
  const result = test.run();
  test.assert(result);
  passed += 1;
  console.log(`PASS ${test.name} | DPS ${result.dps}`);
}

console.log(`\n${passed}/${tests.length} smoke tests passed.`);

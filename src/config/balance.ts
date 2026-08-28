// balance.ts — every tunable number in one place.
// Feel-based feedback ("hits feel floaty", "militia too weak") is fixed here first.

/** The player's warlord. */
export const HERO = {
  hp: 130,
  speed: 165,           // pixels per second
  radius: 13,           // collision circle
  attackCooldown: 0.5,  // seconds between auto-attacks
  regenDelay: 4,        // seconds without taking damage before HP trickles back
  regenPerSec: 4,       // slow recovery rewards pulling back to breathe
};

/** Weapon tiers. Index 0 = tier 1. Bigger tier = more damage AND a visibly bigger, wider strike. */
export const WEAPONS = [
  { name: 'Rusty Sword',   damage: 10, reach: 54, arcDeg: 80,  knockback: 170, hitStop: 45, shake: 0.003, cost: 0,   bladeLen: 12, tint: 0xffffff },
  { name: 'Iron Sword',    damage: 16, reach: 68, arcDeg: 120, knockback: 230, hitStop: 60, shake: 0.005, cost: 80,  bladeLen: 18, tint: 0xfff2a8 },
  { name: 'Warlord Blade', damage: 28, reach: 86, arcDeg: 180, knockback: 320, hitStop: 80, shake: 0.008, cost: 200, bladeLen: 26, tint: 0xffb347 },
];

/** The two abilities. */
export const ABILITIES = {
  horn:   { cooldown: 8, rallyTime: 1.2, boostTime: 3.0, boostMult: 1.35 },
  charge: { cooldown: 5, duration: 0.2, speed: 820, damage: 8, knockback: 380 },
};

/** Your troops. Death is permanent. */
export const TROOP = {
  hp: 45,
  speed: 150,
  damage: 7,
  cooldown: 0.8,
  reach: 10,          // edge-to-edge distance needed to hit
  radius: 11,
  engageRadius: 110,  // how far a troop will wander from its slot to pick a fight
  leash: 230,         // farther than this from the hero -> troop breaks off and returns
  cost: 35,
  max: 6,
  starting: 3,
};

/** Village defenders (base stats for Raid 1; later raids multiply them). */
export const ENEMIES = {
  militia: { hp: 28,  speed: 108, damage: 6,  cooldown: 1.0, windup: 0.30, reach: 10, radius: 11, aggro: 240, gold: [4, 7] as const },
  archer:  { hp: 20,  speed: 95,  damage: 8,  cooldown: 2.0, windup: 0.40, reach: 0,  radius: 10, aggro: 330, gold: [10, 14] as const,
             minDist: 150, maxDist: 260, arrowSpeed: 270, arrowLife: 1.6 },
  captain: { hp: 110, speed: 72,  damage: 22, cooldown: 1.6, windup: 0.55, reach: 24, radius: 15, aggro: 240, gold: [30, 40] as const, knockback: 260 },
};

/** How much harder each raid gets. */
export function raidConfig(raidNumber: number) {
  const k = Math.max(0, raidNumber - 1);
  return {
    militia: 8 + 2 * k,
    archers: 2 + Math.floor(k / 2),
    captains: 1 + Math.floor(k / 3),
    hpMult: 1 + 0.30 * k,
    dmgMult: 1 + 0.15 * k,
    goldMult: 1 + 0.15 * k,
  };
}

/** Surround behaviour: how militia ring the hero. */
export const SURROUND = {
  reassignEvery: 0.4,   // seconds between slot re-assignments
  slotPadding: 4,       // extra gap so a militia standing on its slot is within reach
  alertRadius: 160,     // when one defender wakes, friends within this radius wake too
};

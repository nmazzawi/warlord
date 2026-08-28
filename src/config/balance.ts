// balance.ts — every tunable number in one place.
// Feel-based feedback ("hits feel floaty", "militia too weak") is fixed here first.

/** The player's warlord. */
export const HERO = {
  hp: 130,
  speed: 165,           // pixels per second
  radius: 13,           // collision circle
  attackCooldown: 0.5,  // seconds between auto-attacks
  swingSlow: 0.18,      // seconds the hero is slowed after a swing — fighting while retreating costs you
  swingSlowMult: 0.4,
  regenDelay: 4,        // seconds without taking damage before HP trickles back
  regenPerSec: 4,       // slow recovery rewards pulling back to breathe
};

/** Sword tiers. Index 0 = tier 1. Bigger tier = more damage AND a visibly bigger, wider strike. */
export const WEAPONS = [
  // knockback is kept modest on tier 1 so a shove doesn't cancel every militia swing — being hit still hurts.
  // shake is in screen pixels (converted for zoom/device inside Juice), hitStop in milliseconds.
  { name: 'Rusty Sword',   damage: 10, reach: 54, arcDeg: 80,  knockback: 130, hitStop: 45, shake: 2,   cost: 0,   bladeLen: 12, tint: 0xffffff },
  { name: 'Iron Sword',    damage: 16, reach: 68, arcDeg: 120, knockback: 190, hitStop: 60, shake: 3.5, cost: 80,  bladeLen: 18, tint: 0xfff2a8 },
  { name: 'Warlord Blade', damage: 28, reach: 86, arcDeg: 180, knockback: 280, hitStop: 80, shake: 5,   cost: 200, bladeLen: 26, tint: 0xffb347 },
];

/** Forge gear beyond swords. Defense knocks points off every hit you take (never below 35% of the hit). */
export const EQUIPMENT = {
  armor:  { name: 'Leather Armor', cost: 60, defense: 2, desc: 'Defense +2. Every hit you take does 2 less.' },
  shield: { name: 'Round Shield',  cost: 50, defense: 2, desc: 'Defense +2. Stacks with armor.' },
  bow:    { name: 'Hunting Bow',   cost: 70, damage: 9, range: 230, cooldown: 0.7, arrowSpeed: 380, hitStop: 25, shake: 1.5,
            desc: 'Alternate weapon: you shoot the nearest enemy from range. Lighter hits — keep your distance.' },
};
export const DEFENSE_MIN_FRACTION = 0.35;

/** Stables. Mounted = faster and a bigger silhouette. */
export const HORSES = {
  courser:  { name: 'Courser',  cost: 120, speedMult: 1.45, defense: 0, hp: 0,  scale: 1.25, desc: 'Fast and light. Outrun anything, kite with the bow.' },
  destrier: { name: 'Destrier', cost: 180, speedMult: 1.2,  defense: 3, hp: 30, scale: 1.4,  desc: 'Armored warhorse. Defense +3, HP +30, still quicker than on foot.' },
};

/** The two abilities. */
export const ABILITIES = {
  horn:   { cooldown: 8, rallyTime: 1.2, boostTime: 3.0, boostMult: 1.35 },
  charge: { cooldown: 5, duration: 0.2, speed: 820, damage: 8, knockback: 380 },
};

/** Your troops. Death is permanent. */
export const TROOP = {
  hp: 55,
  speed: 150,
  damage: 8,
  cooldown: 0.8,
  reach: 10,          // edge-to-edge distance needed to hit
  radius: 11,
  engageRadius: 110,  // how far a troop will wander from its slot to pick a fight
  leash: 230,         // farther than this from the hero -> troop breaks off and returns
  cost: 35,
  max: 6,
  starting: 3,
};

/** Defenders (base stats; villages and patrols multiply them). */
export const ENEMIES = {
  // militia are individually weak but must live long enough to pile up around you in the open
  // militia are a touch slower than the hero, but the hero slows down when swinging, so running away while
  // fighting doesn't work — you have to pick your ground.
  militia: { hp: 40,  speed: 128, damage: 7,  cooldown: 0.9, windup: 0.35, reach: 10, radius: 11, aggro: 240, gold: [4, 7] as const },
  // archers stay close enough to be on screen (the camera shows ~520 world px across the short axis)
  archer:  { hp: 20,  speed: 100, damage: 8,  cooldown: 2.0, windup: 0.40, reach: 0,  radius: 10, aggro: 280, gold: [10, 14] as const,
             minDist: 130, maxDist: 220, arrowSpeed: 270, arrowLife: 1.6 },
  // the captain's spear out-reaches your tier-1 sword: you must step out of the (long, obvious) wind-up
  captain: { hp: 110, speed: 88,  damage: 22, cooldown: 1.6, windup: 0.55, reach: 38, radius: 15, aggro: 240, gold: [30, 40] as const, knockback: 260 },
};

/** Village strength by tier (index = tier - 1). */
export const VILLAGE_TIERS = [
  { militia: 8,  archers: 2, captains: 1, statMult: 1.0,  goldMult: 1.0 },
  { militia: 10, archers: 2, captains: 1, statMult: 1.2,  goldMult: 1.25 },
  { militia: 12, archers: 3, captains: 2, statMult: 1.45, goldMult: 1.5 },
  { militia: 14, archers: 4, captains: 2, statMult: 1.7,  goldMult: 1.8 },
];

/** A raided village lies ruined for a while, then rebuilds a little tougher (and a little richer). */
export const RERAID = { recoverDays: 8, militiaPerRaid: 2, statPerRaid: 0.15, goldPerRaid: 0.1 };

/** Infamy: how the world reacts to you. */
export const INFAMY = {
  tiers: [{ name: 'Nobody', min: 0 }, { name: 'Bandit', min: 10 }, { name: 'Raider', min: 30 }],
  perRaidBase: 6,          // infamy for raiding a village...
  perRaidPerTier: 2,       // ...plus this per village tier
  perPatrol: 2,            // for cutting down a road patrol
  interceptChance: [0, 0.25, 0.45], // chance a patrol stops you on a road, by tier
  patrolCooldownDays: 3,   // at least this many days between patrols
  fortifyDays: [0, 4, 3],  // days per fortification step for unraided villages, by tier (0 = never)
  fortifyMax: 6,           // steps (each step = +1 militia)
  palisadeAt: 2,           // steps at which a palisade goes up
  archerAt: 4,             // steps at which an extra archer arrives
  bountyPerInfamy: 12,     // gold on your head per infamy point (shown on the map; hunters come later)
};

/** Road patrols by infamy tier (index 0 = never). */
export const PATROLS = [
  null,
  { militia: 5, archers: 1, captains: 0, statMult: 1.1, goldMult: 0.8 },
  { militia: 8, archers: 2, captains: 1, statMult: 1.4, goldMult: 1.0 },
];

/** Overworld travel. */
export const TRAVEL = { pxPerDay: 130, tokenSpeed: 170 };

/** Surround behaviour: how militia ring the hero. */
export const SURROUND = {
  reassignEvery: 0.4,   // seconds between slot re-assignments
  slotPadding: 4,       // extra gap so a militia standing on its slot is within reach
  alertRadius: 160,     // when one defender wakes, friends within this radius wake too
};

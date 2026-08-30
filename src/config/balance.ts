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
  // tier 4 is never sold: the garrison captain of Kingsport drops it
  { name: 'Kingsport Halberd', damage: 34, reach: 100, arcDeg: 200, knockback: 320, hitStop: 90, shake: 6, cost: 0, bladeLen: 32, tint: 0x9fd8ff },
];
export const HALBERD_TIER = 4;

/** Forge gear beyond swords. Defense shaves a share off every hit: def / (def + 12) — 4 ≈ 25%, 7 ≈ 37%, 11 ≈ 48%. */
export const EQUIPMENT = {
  leather: { name: 'Leather Armor', cost: 60,  defense: 2, slot: 'armor' as const,  desc: 'Defense +2.' },
  plate:   { name: 'Steel Plate',   cost: 150, defense: 4, slot: 'armor' as const,  desc: 'Defense +4. Replaces leather.' },
  round:   { name: 'Round Shield',  cost: 50,  defense: 2, slot: 'shield' as const, desc: 'Defense +2. Stacks with armor.' },
  kite:    { name: 'Kite Shield',   cost: 120, defense: 3, slot: 'shield' as const, desc: 'Defense +3. Replaces the round shield.' },
  // the support/siege weapon: out-ranges wall archers, softens the approach while troops hold the line
  bow:     { name: 'Hunting Bow',   cost: 70,  damage: 12, range: 300, cooldown: 0.65, arrowSpeed: 400, hitStop: 25, shake: 1.5,
             desc: 'Shoots the nearest enemy from range — further than any archer. You must stand (nearly) still to shoot.' },
};
export const DEFENSE_SOFTCAP = 12;
/** The steppe's answer to the bow: fires at a slow ride (you may keep moving at up to this fraction of speed). */
export const COMPOSITE_BOW = { name: 'Composite Bow', cost: 220, damage: 13, range: 300, cooldown: 0.6, arrowSpeed: 420, hitStop: 25, shake: 1.5, moveFraction: 0.65,
  desc: 'Horn and sinew. Shoots while you ride at a walk-and-a-half — the closest thing to the horse archers\' trick.' };
/** Arrows loosed by your side carry on through the first target at this much of their damage. */
export const PIERCE = { damageMult: 0.6, maxHits: 3 };
/** The ranged rule: bows fire only when (nearly) stopped; a horse slows to a walk to shoot. */
export const RANGED = { walkFraction: 0.35 };

/** Stables. Mounted = faster and a bigger silhouette. */
export const HORSES = {
  courser:  { name: 'Courser',  cost: 120, speedMult: 1.35, defense: 0, hp: 0,  scale: 1.25, desc: 'Fast and light. Outrun anything on the road.' },
  destrier: { name: 'Destrier', cost: 180, speedMult: 1.2,  defense: 3, hp: 30, scale: 1.4,  desc: 'Armored warhorse. Defense +3, HP +30, still quicker than on foot.' },
};

/** The two abilities. */
export const ABILITIES = {
  horn:   { cooldown: 8, rallyTime: 1.2, boostTime: 3.0, boostMult: 1.35 },
  charge: { cooldown: 5, duration: 0.2, speed: 820, damage: 8, knockback: 380 },
};

/** Your troops. Death is permanent. Per-kind stats (HP, damage, price) are in TROOP_KINDS. */
export const TROOP = {
  speed: 150,
  cooldown: 0.8,
  reach: 10,          // edge-to-edge distance needed to hit
  radius: 11,
  engageRadius: 110,  // how far a troop will wander from its slot to pick a fight
  leash: 230,         // farther than this from the hero -> troop breaks off and returns
  max: 6,               // the floor; the real cap is capByTier, read through GameState.troopCap
  /** How many will follow you, by the highest tier ANY country has put on you. */
  capByTier: [6, 10, 16, 24, 32, 40],
  starting: 3,
};
/** Where you recruit decides who you get: camp raiders, village levies, Kingsport's town guard. */
export const TROOP_KINDS = {
  raider: { label: 'Raider',     hp: 55, damage: 8,  cost: 35, tint: 0xffffff, desc: 'Your own kind. Steady.' },
  levy:   { label: 'Levy',       hp: 45, damage: 7,  cost: 25, tint: 0xc8ffb0, desc: 'Cheap village lads with pitchforks.' },
  guard:  { label: 'Town guard', hp: 75, damage: 10, cost: 60, tint: 0x9fd8ff, desc: 'Drilled, armored, expensive.' },
  rider:  { label: 'Steppe rider', hp: 50, damage: 7, cost: 90, tint: 0xffe0a0, desc: 'Mounted archer. Keeps its distance and shoots; fast, fragile, pricey.' },
};
/** What comes off a body. Only the men who were carrying something: captains, the garrison captain,
 *  and an empire's own elites. Everything here can be sold at any market that will have you. */
export const LOOT = {
  chance: 0.35,
  value: [40, 90] as const,
  names: ['Blade', 'Helm', 'Mail', 'Bracers', 'Shield', 'Buckle', 'Warhorn', 'Signet', 'Cloakpin', 'Greaves'],
};

/** What the nine visible troop abilities are worth. Each is one number so a player can feel it. */
export const TROOP_ABILITY = {
  frenzyMax: 0.6,        // a berserker at death's door hits 60% harder
  backstab: 1.8,         // a man fighting somebody else takes nearly double
  inspire: 0.25,         // everyone near a standard-bearer
  inspireRadius: 150,
  shieldTurns: 0.4,      // turned while the shield is up...
  openMs: 420,           // ...and it is down for this long after his own blow
  javelinRange: 170, javelinShare: 0.9,
  trampleRadius: 46, trampleShare: 0.6,
  duelBias: 0.55,        // a duellist scores the toughest man on the field this much better
};

/** Steppe riders in your warband: mounted, ranged. */
export const RIDER = { speed: 200, range: 220, cooldown: 1.2, keepDistance: 150, arrowSpeed: 380, scale: 1.15, leash: 340 };
/** Armies eat. Each unit carries its OWN wage (see Civs.ts); this is what a man costs when nothing
 *  else says otherwise, and it is what the four original kinds are paid. */
export const UPKEEP = { wage: 2, graceDays: 2, startingGold: 40 };
/** Daily tribute from an occupied settlement (villages by tier; the town flat). */
export const TRIBUTE = { villageBase: 4, villagePerTier: 1, town: 15 };
/** Conquest choices. */
export const CONQUEST = {
  // sacking pays this many times the raid's own loot ON TOP of it (3x total) — a big NOW against tribute, shops and re-raids
  sackLootMult: 2, sackVillageFloor: 120, sackTownFloor: 500,
  sackVillageInfamy: 8, // added ON TOP of the raid's infamy — always a spike
  sackTownInfamy: 25,
  garrison: 2,
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
  // spears out-reach EVERY sword (54/68/86): the red ring is a real dodge moment — step out or take 22
  captain: { hp: 110, speed: 88,  damage: 22, cooldown: 1.6, windup: 0.55, reach: 92, radius: 15, aggro: 240, gold: [30, 40] as const, knockback: 260 },
  // Kingsport's town guard: a tier above militia
  guard:   { hp: 60,  speed: 122, damage: 9,  cooldown: 0.9, windup: 0.35, reach: 12, radius: 12, aggro: 260, gold: [12, 16] as const },
  // the garrison captain: a mini-boss with a ring telegraph, drops the halberd
  boss:    { hp: 320, speed: 96,  damage: 28, cooldown: 1.3, windup: 0.5,  reach: 100, radius: 17, aggro: 400, gold: [110, 130] as const, knockback: 300 },
  // the steppe: horse archers fire AT FULL GALLOP (the only ones who do); they kite — keep distance, shoot, retreat
  horsearcher: { hp: 34, speed: 190, damage: 8, cooldown: 1.5, windup: 0.15, reach: 0, radius: 12, aggro: 340, gold: [12, 16] as const,
                 minDist: 190, maxDist: 280, arrowSpeed: 300, arrowLife: 1.3 },
  rider:       { hp: 55, speed: 178, damage: 9, cooldown: 0.9, windup: 0.3,  reach: 14, radius: 12, aggro: 300, gold: [8, 12] as const },
  noyan:       { hp: 170, speed: 150, damage: 24, cooldown: 1.4, windup: 0.5, reach: 60, radius: 16, aggro: 320, gold: [55, 70] as const, knockback: 280 },
  // ---- the empires' elites. One style per realm for now; each realm's own roster comes with its milestone.
  // shieldman: locks his shield and walks at you. Half of every blow is turned WHILE THE SHIELD IS UP —
  // he is only properly open in the moment he swings, which is the whole fight against a shield wall.
  shieldman: { hp: 95,  speed: 116, damage: 13, cooldown: 1.0, windup: 0.40, reach: 14, radius: 13, aggro: 300, gold: [26, 34] as const },
  // axeman: slow, enormous, two-handed. The wind-up is long and obvious; standing in it is a mistake.
  axeman:    { hp: 130, speed: 100, damage: 27, cooldown: 1.5, windup: 0.58, reach: 44, radius: 14, aggro: 280, gold: [30, 40] as const, knockback: 320 },
  // spearman: out-reaches every sword, and the ranks close over his body — kill him and another steps up.
  // reach 96 clears every sword in the game (54 / 68 / 86) and the captain's own spear — stepping out
  // of it is the only defence, which is what "out-reaches a sword" has to MEAN in play
  spearman:  { hp: 100, speed: 106, damage: 19, cooldown: 1.3, windup: 0.50, reach: 96, radius: 13, aggro: 290, gold: [28, 36] as const, knockback: 230 },
};
/** How much of a blow a shieldman turns while his shield is up (he is open only as he strikes). */
export const SHIELD_TURNS = 0.55;
/** ---------------------------------------------------------------- foreign realms at war
 * An empire is not a village with more men in it. Every realm keeps ordinary militia, archers and
 * captains PLUS one elite of its own, and the further up its ladder you go the more of everything
 * there is and the harder each one hits. Nothing here forbids the fight: these are just the numbers
 * standing in the square, and the settlement panel tells you them before you commit.
 */
export type EliteStyle = 'shieldman' | 'axeman' | 'spearman';
/** What an empire keeps in each kind of place, before its own strength is applied. */
export const FOREIGN_GARRISON = {
  // statMult starts ABOVE the hardest village at home (tier 4 is 1.7), because the softest realm on
  // the board still multiplies it down. goldMult deliberately climbs slower than the danger does:
  // a capital must be the richest thing you can take and never the sensible thing to farm.
  village: { militia: 14, archers: 4,  captains: 2, elites: 3,  statMult: 1.9, goldMult: 2.2 },
  town:    { militia: 20, archers: 6,  captains: 3, elites: 5,  statMult: 2.2, goldMult: 3.0 },
  city:    { militia: 25, archers: 8,  captains: 4, elites: 8,  statMult: 2.5, goldMult: 4.0 },
  capital: { militia: 30, archers: 10, captains: 5, elites: 11, statMult: 3.0, goldMult: 5.5 },
};
/**
 * How thin a realm's grip is out at its edge, by rank. A throne is held with everything the country
 * has; a village on the frontier is held by whoever lives in it. This is what makes every realm grade
 * from a place a new warband can take to a place that will kill it.
 */
export const FRONTIER_THIN: Record<string, number> = { village: 0.72, town: 0.6, city: 0.34, capital: 0,
  /** Not a discount but the value itself: a border hamlet keeps about a fifth of what a throne keeps. */
  fringe: 0.2 };

/** And how hard the realm itself is. Kush is a kingdom; Rome is Rome. */
export const REALM_POWER: Record<string, number> = {
  kush: 0.78, rus: 0.86, greece: 0.94, egypt: 1.0, india: 1.06, arabia: 1.1, persia: 1.16, china: 1.22, rome: 1.28,
};
/** No battle may put more bodies on the field than this — a phone has to draw all of them. */
export const FOREIGN_MAX_DEFENDERS = 58;
/** Raiding abroad: what it does to that realm's opinion of you, and what its places are worth. */
export const FOREIGN = {
  // a village is worth 16 because 15 is where a realm starts hunting: touch ANYTHING of theirs and
  // their riders are out. That is the whole bargain of this milestone — the lock is consequences.
  infamy: { village: 16, town: 28, city: 38, capital: 60 },
  tribute: { village: 8, town: 18, city: 26, capital: 45 },
  /** Burning it, or sitting in it, angers a country more than robbing it and walking away. */
  sackMult: 1.6, occupyMult: 1.3,
  /** A place you already stripped is poorer and angrier the next time you come back. */
  reraidStat: 0.12, reraidGold: 0.08,
  /** How many of a spear elite's dead the ranks will close over, per battle. */
  reformsPerBattle: { village: 2, town: 3, city: 5, capital: 8 },
};

/** Roaming steppe camps and the riders who hunt camp-raiders. */
export const STEPPE = {
  camp: { horsearchers: 5, riders: 4, noyans: 1, statMult: 1.0, goldMult: 1.0 },
  scatterDays: 10,      // a raided camp scatters for this long, then re-forms elsewhere
  huntDays: 12,         // after raiding a camp, riders hunt you on the steppe for this long
  huntChance: 0.5,      // per road stretch while hunted
  patrol: { horsearchers: 6, riders: 2, noyans: 0, statMult: 1.0, goldMult: 0.8 },
  campInfamy: 8,
  pxPerDay: 45,         // horse country: roads pass faster
};
/** The siege of Kingsport. */
// the gate is a phase: ~20-30 s for a fresh warband (~50 dps) under arrow fire — bring a bow, use the rocks, or eat it
export const SIEGE = { gateHp: 1000, wallArchers: 4, guards: 8, escort: 3, unlockTier: 1, gateGuardRadius: 240 };

/** Village strength by tier (index = tier - 1). */
export const VILLAGE_TIERS = [
  { militia: 8,  archers: 2, captains: 1, statMult: 1.0,  goldMult: 1.0 },
  { militia: 10, archers: 2, captains: 1, statMult: 1.2,  goldMult: 1.25 },
  { militia: 12, archers: 3, captains: 2, statMult: 1.45, goldMult: 1.5 },
  { militia: 14, archers: 4, captains: 2, statMult: 1.7,  goldMult: 1.8 },
];

/** A raided village lies ruined for a while, then rebuilds a little tougher — but poorer: its wealth is plundered and recovers over ~15 days. */
export const RERAID = { recoverDays: 8, militiaPerRaid: 2, statPerRaid: 0.15, goldPerRaid: 0.1, wealthDrop: 0.7, wealthMin: 0.1, wealthRecoverDays: 15 };

/** Infamy: how the world reacts to you. */
export const INFAMY = {
  // Six rungs, because legend IS command: the same ladder that decides how badly a country wants you
  // dead decides how many men will follow you. The cap is in TROOP.capByTier, index for index.
  tiers: [
    { name: 'Nobody', min: 0, desc: 'No one has heard of you yet.' },
    { name: 'Bandit', min: 15, desc: 'Riders are out looking. Villages you have not raided hire guards and raise palisades.' },
    { name: 'Raider', min: 45, desc: 'Whole countries have your name. Their parties hunt you inside their borders.' },
    { name: 'Warlord', min: 110, desc: 'Men come to you unasked. Kings write to each other about you.' },
    { name: 'Conqueror', min: 220, desc: 'You are a power, not a problem. Garrisons are raised against you by name.' },
    { name: 'World Threat', min: 400, desc: 'Every throne on the chart has heard it, and none of them sleeps well.' },
  ],
  perRaidBase: 5,          // infamy for raiding a village...
  perRaidPerTier: 2,       // ...plus this per village tier
  perPatrol: 2,            // for cutting down a road patrol
  interceptChance: [0, 0.25, 0.30, 0.34, 0.38, 0.42], // how badly a country wants you, by tier
  patrolCooldownDays: 3,   // at least this many days between patrols
  fortifyDays: [0, 4, 3, 3, 2, 2],  // days per fortification step for unraided villages, by tier (0 = never)
  fortifyMax: 4,           // steps (each step = +1 militia)
  palisadeAt: 2,           // steps at which a palisade goes up
  archerAt: 4,             // steps at which an extra archer arrives
  bountyPerInfamy: 12,     // gold on your head per infamy point (shown on the map; hunters come later)
};

/** Road patrols by infamy tier (index 0 = never). */
export const PATROLS = [
  null,
  { militia: 5, archers: 1, captains: 0, statMult: 1.1, goldMult: 0.8 },
  { militia: 6, archers: 2, captains: 1, statMult: 1.3, goldMult: 1.0 },
  { militia: 9, archers: 3, captains: 1, statMult: 1.6, goldMult: 1.3 },
  { militia: 12, archers: 4, captains: 2, statMult: 1.9, goldMult: 1.7 },
  { militia: 16, archers: 6, captains: 3, statMult: 2.3, goldMult: 2.2 },
];

/**
 * What a garrison is MADE of, by how well the place is held. A hamlet is whoever lives there with a
 * spear; a throne is that country's whole army with its champion in front of it. The weights multiply
 * the rank's counts, so the mix changes as well as the size.
 */
export const GARRISON_MIX: Array<{ militia: number; archers: number; captains: number; elites: number; champion: boolean }> = [
  { militia: 0, archers: 0, captains: 0, elites: 0, champion: false },       // unused (0 stars = a ruin)
  { militia: 1.0, archers: 0.35, captains: 0, elites: 0, champion: false },  // 1: farmers with spears
  { militia: 1.0, archers: 0.7, captains: 0.5, elites: 0.35, champion: false },
  { militia: 0.95, archers: 1.0, captains: 1.0, elites: 0.8, champion: false },
  { militia: 0.8, archers: 1.1, captains: 1.2, elites: 1.15, champion: true },
  { militia: 0.7, archers: 1.2, captains: 1.4, elites: 1.4, champion: true },  // 5: everything, and a name
];

/** Arming the whole warband, three tiers, at any forge that will serve you. */
export const WARBAND_GEAR = [
  { name: 'as they came', attack: 0, defense: 0, cost: 0 },
  { name: 'Hardened', attack: 2, defense: 1, cost: 55 },
  { name: 'Ironed', attack: 4, defense: 2, cost: 130 },
  { name: 'Harnessed', attack: 7, defense: 4, cost: 260 },
];

/** What you pay them, and what that buys. */
export const PAY = {
  half: { mult: 0.5, damage: 0.88, label: 'HALF', note: 'They eat half and they know it. Some will not be there in the morning.' },
  full: { mult: 1, damage: 1, label: 'FULL', note: 'The wage they were promised. They stay while it is paid.' },
  double: { mult: 2, damage: 1.1, label: 'DOUBLE', note: 'Nobody deserts a purse like that, and they fight like it.' },
};

/** How a hunt is paced, so being wanted is a weather system and not a metronome. */
export const HUNT = {
  /** Days of quiet in a territory after you put one of its parties down. */
  graceDays: 5,
  /** Only a country that grades you Raider or worse bothers to send anyone. */
  fromTier: 2,
  /** One party at a time. Two only once the whole chart is awake. */
  maxParties: 1, maxPartiesAtWorldThreat: 2,
};

/** Overworld travel (the chart is compressed: 1 world px ≈ 6.7 old px). */
export const TRAVEL = { pxPerDay: 19.5, tokenSpeed: 26 };

/** Surround behaviour: how militia ring the hero. */
export const SURROUND = {
  reassignEvery: 0.4,   // seconds between slot re-assignments
  slotPadding: 4,       // extra gap so a militia standing on its slot is within reach
  alertRadius: 160,     // when one defender wakes, friends within this radius wake too
};

// GameState.ts — the whole run: gold, day, infamy, gear, horse, your named troops, where you are on
// the map, what state each settlement is in, who garrisons what, and the daily ledger (wages in,
// tribute out). Saved to browser storage (single slot).
import { CONQUEST, DEFEAT, FOREIGN, FOREIGN_GARRISON, FOREIGN_MAX_DEFENDERS, FRONTIER_THIN, GARRISON_MIX, HUNT, PAY, REALM_POWER, WARBAND_GEAR, DEFENSE_SOFTCAP, EQUIPMENT, HERO, HORSES, INFAMY, PATROLS, RERAID, SIEGE, STEPPE, TRIBUTE, TROOP, UPKEEP, VILLAGE_TIERS } from '../config/balance';
import { nameAt } from '../utils/names';
import { frontier, NODES, nodeById, territoryOf, type MapNode, type Territory } from '../world/WorldMap';
import { componentNear, nearestOnLandmass, routeToPlace } from '../world/Terrain';
import { CROWN_TITLE, ELITE_TINT, REALM_SHORT, visitOf } from '../world/Realms';
import { REGIONS } from '../world/WorldChart';
import { campPoint, civOf } from '../world/Civs';
import { unitDef } from '../world/Units';
import type { FormationKind } from '../systems/Formation';
import type { PlaceKind } from '../world/AtlasData';
import type { Hunter } from '../world/Hunters';
import { advanceHunters, nearestTerritory } from '../world/Hunters';

/** Any unit id: the four the game began with, or any culture's own. */
export type TroopKind = string;
export interface TroopRecord { id: number; name: string; kind: TroopKind; }
export interface FallenRecord { name: string; raid: number; where: string; }
export type WeaponKind = 'sword' | 'bow' | 'halberd' | 'composite';
export type ArmorKind = 'none' | 'leather' | 'plate';
export type ShieldKind = 'none' | 'round' | 'kite';
export type HorseKind = 'none' | 'courser' | 'destrier';
export interface Owned { leather: boolean; plate: boolean; round: boolean; kite: boolean; bow: boolean; halberd: boolean; courser: boolean; destrier: boolean; composite: boolean;
  /** A hull of your own: passage stops costing anything, anywhere, for good. */
  ship: boolean; }
export interface SettlementState { timesRaided: number; lastRaidDay: number | null; occupied: boolean; sacked: boolean; wealth: number; }
export type Conquest = 'sack' | 'occupy' | 'leave';

/** What a beaten warband is told when it wakes up. */
export interface DefeatReport {
  fallen: string[]; goldLost: number; goldLeft: number; days: number;
  wokeAt: string; survivors: number; events: DayEvent[];
}
export interface DayEvent { kind: 'unpaid' | 'desert'; text: string; }
/** Something taken off a body, worth what somebody will pay for it. */
export interface LootItem { id: number; name: string; value: number; from: string; }
/** A job off a notice board. Two kinds for now: carry something somewhere, or kill somebody. */
export interface Quest {
  id: number; kind: 'deliver' | 'hunt'; text: string; to?: string; realm?: string; reward: number; from: string;
  /** The march the board quoted when the work was offered. */
  days?: number;
  /** Day the job expires, for timed work. Absent means it keeps. */
  by?: number;
}

export type Access = 'camp' | 'occupied' | 'visit' | 'closed' | 'sacked' | 'trade' | 'foreign';
/** A won battle whose sack/occupy choice has not been made yet (survives a reload). */
export interface PendingVictory { goldEarned: number; deadTroopIds: number[]; battle: BattleOutcome; fallen: string[]; }

/** Everything the map and the raid need to know about a village right now. */
export interface VillageInfo {
  tier: number; timesRaided: number; ruined: boolean; daysToRecover: number; occupied: boolean; sacked: boolean; wealth: number;
  steps: number; palisade: boolean;
  militia: number; archers: number; captains: number; statMult: number; goldMult: number; total: number;
}

export interface BattleOutcome { kind: 'village' | 'patrol' | 'siege' | 'camp' | 'steppePatrol' | 'foreign' | 'foreignPatrol';
  villageId?: string; campId?: string; tier?: number; name: string; realm?: string; rank?: PlaceKind; }

const SAVE_VERSION = 3;
const SAVE_KEY = `warlord.save.v${SAVE_VERSION}`;

interface SaveData {
  version: number; gold: number; day: number; infamy: number; weaponTier: number; equippedWeapon: WeaponKind; horse: HorseKind;
  armor: ArmorKind; shield: ShieldKind; owned: Owned; troops: TroopRecord[]; fallen: FallenRecord[]; deserted: string[];
  nextId: number; nameCursor: number; raidsDone: number;
  location: string; patrolPending: boolean; patrolFrom?: Territory; formation?: FormationKind;
  pos?: { x: number; y: number }; hunters?: Hunter[];
  settlements: Record<string, SettlementState>; garrisons: Record<string, TroopRecord[]>;
  fortifyStepsDone: number; fortifyCarry: number; unpaidDays: number; seenMapHint: boolean;
  rumorsHeard: string[]; pendingVictory: PendingVictory | null;
  steppeInfamy: number; campScattered: Record<string, number>; huntedUntil: number; civ?: string;
  loot?: LootItem[]; quests?: Quest[]; voyage?: { toId: string; daysLeft: number } | null; huntQuiet?: Record<string, number>; ruled?: string[];
  gearTier?: number; payRate?: 'half' | 'full' | 'double';
  realmInfamy?: Record<string, number>;
}

class GameStateStore {
  gold = 0;
  day = 1;
  infamy = 0;
  weaponTier = 1;          // 1..3 bought at forges; the halberd is tier 4, equipped separately
  equippedWeapon: WeaponKind = 'sword';
  horse: HorseKind = 'none';
  armor: ArmorKind = 'none';
  shield: ShieldKind = 'none';
  owned: Owned = { leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false, ship: false };
  troops: TroopRecord[] = [];
  fallen: FallenRecord[] = [];
  deserted: string[] = [];
  raidsDone = 0;
  location = 'camp';
  /** Where the warband actually stands. `location` is the place you are AT, or '' out in the field. */
  pos: { x: number; y: number } = { ...nodeById('camp') };
  /** Hunter parties on the map: they know your face and they are looking for you. */
  hunters: Hunter[] = [];
  patrolPending = false;
  /** Whose riders are standing over you — kept so a reload offers the same fight, not a local one. */
  patrolFrom: Territory = 'homeland';
  /** The day each country's hunt goes quiet until, after you put one of its parties down. */
  huntQuiet: Record<string, number> = {};
  /** The countries whose crown you wear. */
  ruled: string[] = [];
  /** How well the whole warband is armed: 0 as they came, up to 3. */
  gearTier = 0;
  /** What you pay them. */
  payRate: 'half' | 'full' | 'double' = 'full';
  settlements: Record<string, SettlementState> = {};
  garrisons: Record<string, TroopRecord[]> = {};
  fortifyStepsDone = 0;
  fortifyCarry = 0;
  unpaidDays = 0;
  seenMapHint = false;
  rumorsHeard: string[] = [];
  pendingVictory: PendingVictory | null = null;
  /** the steppe keeps its own opinion of you; homeland infamy and bounty are untouched by it */
  steppeInfamy = 0;
  /** Which of the fifteen starts this run is. Everything else about "home" follows from it. */
  civ = 'outlaw';
  /** Gear stripped off the men you killed, waiting for a market that will take it. */
  loot: LootItem[] = [];
  /** Work you have taken off a notice board. */
  quests: Quest[] = [];
  /** How the warband stands when a fight begins. Chosen once per battle, remembered between them. */
  formation: FormationKind = 'line';
  /** What each foreign realm you have walked into thinks of you. A realm you have never entered is
   *  not in here at all; the day you cross its border it starts at nothing, like everywhere else did. */
  realmInfamy: Record<string, number> = {};
  campScattered: Record<string, number> = {};
  huntedUntil = -1;
  private nextId = 1;
  private nameCursor = 0;
  /** Only a run that was started or loaded on purpose may be written to storage (the title screen must never clobber a save). */
  private persistable = false;

  constructor() { this.reset(); }

  /** Fresh run: no gold, rusty sword, three recruits, standing in camp on day 1. */
  reset() {
    this.gold = UPKEEP.startingGold; this.day = 1; this.infamy = 0; this.weaponTier = 1; this.equippedWeapon = 'sword'; this.horse = 'none';
    this.armor = 'none'; this.shield = 'none';
    this.owned = { leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false, ship: false };
    this.voyage = null;
    this.steppeInfamy = 0; this.realmInfamy = {}; this.campScattered = {}; this.loot = []; this.quests = []; this.huntQuiet = {}; this.ruled = []; this.gearTier = 0; this.payRate = 'full'; this.huntedUntil = -1;
    this.troops = []; this.fallen = []; this.deserted = []; this.raidsDone = 0; this.location = 'camp';
    this.patrolPending = false; this.patrolFrom = 'homeland'; this.pos = { x: nodeById('camp').x, y: nodeById('camp').y }; this.hunters = []; this.settlements = {}; this.garrisons = {}; this.fortifyStepsDone = 0; this.fortifyCarry = 0;
    this.unpaidDays = 0; this.seenMapHint = false; this.rumorsHeard = []; this.pendingVictory = null;
    this.nextId = 1; this.nameCursor = 0;
    // a bare reset is the game as it always was; newRun() sets the real start straight after
    this.setCiv('outlaw');
    for (let i = 0; i < TROOP.starting; i++) this.recruit('raider');
  }

  /** Start a brand-new warband on purpose (erases the old save), as one of the fifteen. */
  newRun(civ = 'outlaw') {
    this.reset();
    this.setCiv(civ);
    // your camp stands on your own ground, and the three who ride out are your own people
    this.pos = { x: nodeById('camp').x, y: nodeById('camp').y };
    const def = civOf(this.civ);
    this.equippedWeapon = def.weapon === 'sword' ? 'sword' : def.weapon;
    if (def.weapon === 'bow') this.owned.bow = true;
    if (def.weapon === 'composite') this.owned.composite = true;
    this.troops = [];
    this.nextId = 1; this.nameCursor = 0;
    for (let i = 0; i < TROOP.starting; i++) this.recruit(def.troops[Math.min(i, def.troops.length - 1)].id);
    this.wipe();
    this.persistable = true;
    this.save();
  }

  recruit(kind: TroopKind): TroopRecord {
    const t = { id: this.nextId++, name: nameAt(this.nameCursor++), kind };
    this.troops.push(t);
    return t;
  }

  // ------------------------------------------------------------ hero stats from gear
  get defense() {
    let d = 0;
    if (this.armor !== 'none') d += EQUIPMENT[this.armor].defense;
    if (this.shield !== 'none') d += EQUIPMENT[this.shield].defense;
    if (this.horse !== 'none') d += HORSES[this.horse].defense;
    return d;
  }
  get maxHp() { return HERO.hp + (this.horse !== 'none' ? HORSES[this.horse].hp : 0); }
  get speedMult() { return this.horse === 'none' ? 1 : HORSES[this.horse].speedMult; }
  get heroScale() { return this.horse === 'none' ? 1 : HORSES[this.horse].scale; }
  get weaponKind(): WeaponKind {
    if (this.equippedWeapon === 'bow' && this.owned.bow) return 'bow';
    if (this.equippedWeapon === 'composite' && this.owned.composite) return 'composite';
    if (this.equippedWeapon === 'halberd' && this.owned.halberd) return 'halberd';
    return 'sword';
  }
  get usesBow() { const k = this.weaponKind; return k === 'bow' || k === 'composite'; }
  /** Damage after defense: a share is shaved off, more with more defense, never all of it. */
  applyDefense(amount: number) {
    const d = this.defense;
    return Math.max(1, Math.round(amount * (1 - d / (d + DEFENSE_SOFTCAP))));
  }

  // ------------------------------------------------------------ infamy
  get infamyTier() { let t = 0; INFAMY.tiers.forEach((tier, i) => { if (this.infamy >= tier.min) t = i; }); return t; }
  get infamyTierName() { return INFAMY.tiers[this.infamyTier].name; }
  get infamyTierDesc() { return INFAMY.tiers[this.infamyTier].desc; }
  get infamyNextMin(): number | null { return INFAMY.tiers[this.infamyTier + 1]?.min ?? null; }
  get bounty() { return this.infamy * INFAMY.bountyPerInfamy; }
  addInfamy(n: number) { this.infamy += n; }
  get patrolChance() { return INFAMY.interceptChance[this.infamyTier] ?? 0; }
  patrolConfig() { return PATROLS[this.infamyTier]; }
  get siegeUnlocked() { return this.infamyTier >= SIEGE.unlockTier; }

  // ------------------------------------------------------------ legend is command
  /** The worst any country thinks of you. This is the one number the whole ladder hangs on. */
  get highestTier() {
    let t = this.infamyTier;
    t = Math.max(t, this.tierOf(this.steppeInfamy));
    for (const v of Object.values(this.realmInfamy)) t = Math.max(t, this.tierOf(v));
    return t;
  }
  get highestTierName() { return INFAMY.tiers[this.highestTier].name; }
  /** How many men will follow you today. */
  get troopCap() { return TROOP.capByTier[Math.min(this.highestTier, TROOP.capByTier.length - 1)] ?? TROOP.max; }
  /** What the next rung is worth, and what it costs to reach — null once you are the worst there is. */
  nextCommand() {
    const t = this.highestTier;
    if (t >= INFAMY.tiers.length - 1) return null;
    const next = INFAMY.tiers[t + 1];
    // the score that matters is whichever country is closest to promoting you
    let best = this.infamy;
    best = Math.max(best, this.steppeInfamy);
    for (const v of Object.values(this.realmInfamy)) best = Math.max(best, v);
    return { name: next.name, at: next.min, have: best, cap: TROOP.capByTier[t + 1] ?? TROOP.max };
  }

  // ------------------------------------------------------------ territories
  get territory(): Territory { return this.location ? territoryOf(this.location) : nearestTerritory(this.pos.x, this.pos.y); }
  /** The country that is yours. For the outlaw that is the nameless Borderland; for everyone else it
   *  is the realm they were born in, and it behaves exactly as the Borderland always has. */
  get home(): Territory { return civOf(this.civ).home; }
  /** The steppe is a territory of its own on the chart but the Mongols' country all the same. */
  isHome(t: Territory) {
    const h = this.home;
    if (t === h) return true;
    return (h === 'steppe' && t === 'mongolia') || (h === 'mongolia' && t === 'steppe');
  }
  /** Choose a start: this moves your camp onto your own ground and hands you your own country. */
  setCiv(id: string) {
    this.civ = civOf(id).id;
    const camp = nodeById('camp');
    const [cx, cy] = campPoint(this.civ);
    camp.x = Math.round(cx); camp.y = Math.round(cy);
    camp.territory = this.home;
    camp.name = civOf(this.civ).campName || 'Bandit Camp';
  }
  /** Infamy as the territory you are standing in sees it. Your homeland and the steppe keep the two
   *  old meters; every foreign realm keeps its own, and starts you at nothing. */
  territoryInfamy(t: Territory = this.territory): number {
    if (this.isHome(t)) return this.infamy;
    if (t === 'steppe') return this.steppeInfamy;
    return this.realmInfamy[t] ?? 0;
  }
  /** The realm's name for the meter — blank at home, because your own country needs no naming. */
  territoryName(t: Territory = this.territory) {
    if (this.isHome(t)) return '';
    return REALM_SHORT[t] || (t === 'homeland' ? 'THE BORDERLAND' : t.toUpperCase());
  }
  /** Have we set foot in this realm before? Opening its meter is what marks the crossing. */
  noteRealm(t: Territory = this.territory): string | null {
    if (t === 'homeland' || t === 'steppe' || this.realmInfamy[t] !== undefined) return null;
    this.realmInfamy[t] = 0;
    return visitOf(t)?.enter ?? null;
  }
  tierOf(value: number) { let t = 0; INFAMY.tiers.forEach((tier, i) => { if (value >= tier.min) t = i; }); return t; }
  get steppeTier() { return this.tierOf(this.steppeInfamy); }
  /** The tier the ground you are standing on grades you at. */
  tierIn(t: Territory = this.territory) { return this.tierOf(this.territoryInfamy(t)); }
  get hunted() { return this.day < this.huntedUntil; }

  // ------------------------------------------------------------ the ledger
  /** Every man is paid his own wage — a samurai is not a levy, on the field or in the ledger. */
  get wagesPerDay() {
    const base = this.troops.reduce((n, t) => n + unitDef(t.kind ?? 'raider').wage, 0);
    return Math.round(base * PAY[this.payRate].mult);
  }
  /** What the whole warband carries, on top of what each man came with. */
  get gear() { return WARBAND_GEAR[Math.min(this.gearTier, WARBAND_GEAR.length - 1)]; }
  /** Arming everyone costs by the head: a big warband is a big bill. */
  gearCost(toTier = this.gearTier + 1) {
    const step = WARBAND_GEAR[Math.min(toTier, WARBAND_GEAR.length - 1)];
    return Math.round(step.cost * Math.max(3, this.troops.length) * 0.55);
  }
  /** How hard they swing today, all things considered. */
  get moraleDamage() { return PAY[this.payRate].damage; }
  get tributePerDay() {
    let t = 0;
    for (const n of NODES) {
      if (!this.settlements[n.id]?.occupied) continue;
      // a foreign city pays what a foreign city is worth; your own villages pay what they always did
      t += n.kind === 'foreign' ? FOREIGN.tribute[n.rank ?? 'town']
        : n.kind === 'town' ? TRIBUTE.town : TRIBUTE.villageBase + TRIBUTE.villagePerTier * (n.tier ?? 1);
    }
    return t;
  }
  get netPerDay() { return this.tributePerDay - this.wagesPerDay; }

  /**
   * Time passes: tribute comes in, wages go out, unraided villages fortify. If the men can't be
   * paid there is one day of grumbling, then they desert one by one. Returns what happened.
   */
  /** A day (or several) of hunting: every party out looking for you moves. Returns the one that
   *  reaches you, if any — there is no dodging that fight. */
  runHunters(days: number) {
    const here = this.territory;
    const res = advanceHunters(this.hunters, this.pos, days, {
      tier: this.tierIn(), hunted: this.hunted,
      territory: here, mounted: !!this.horse, rnd: Math.random,
      // a country you have just bled goes quiet for a few days, and one you RULE never sends anyone
      quiet: this.day < (this.huntQuiet[here] ?? -1) || this.rules(here),
    });
    this.hunters = res.hunters;
    if (res.caught) this.hunters = this.hunters.filter(h => h.id !== res.caught!.id);
    return res.caught;
  }

  advanceDays(n: number): DayEvent[] {
    const events: DayEvent[] = [];
    for (let i = 0; i < n; i++) {
      this.day += 1;
      this.bankFortification();
      for (const s of Object.values(this.settlements)) s.wealth = Math.min(1, (s.wealth ?? 1) + 1 / RERAID.wealthRecoverDays);
      this.gold += this.tributePerDay;
      const wages = this.wagesPerDay;
      if (this.gold >= wages) {
        this.gold -= wages;
        this.unpaidDays = 0;
        // paid, but paid HALF: a man who is short every day starts looking at the road
        if (this.payRate === 'half' && this.troops.length > 1 && Math.random() < 0.06) {
          const [gone] = this.troops.splice(Math.floor(Math.random() * this.troops.length), 1);
          this.deserted.push(gone.name);
          events.push({ kind: 'desert', text: `Day ${this.day}: ${gone.name} walked. Half wages buy half a warband.` });
        }
      } else {
        this.gold = 0;
        this.unpaidDays += 1;
        if (this.unpaidDays <= UPKEEP.graceDays) {
          events.push({ kind: 'unpaid', text: `Day ${this.day}: the men were not paid. They grumble — pay them tomorrow or they walk.` });
        } else if (this.troops.length > 0 && this.payRate !== 'double') {
          const idx = Math.floor(Math.random() * this.troops.length);
          const [gone] = this.troops.splice(idx, 1);
          this.deserted.push(gone.name);
          events.push({ kind: 'desert', text: `Day ${this.day}: ${gone.name} deserted — unpaid for ${this.unpaidDays} days.` });
        }
      }
    }
    return events;
  }
  /** One day of fortification progress at the current tier's pace (progress is banked, never recomputed). */
  private bankFortification() {
    const per = INFAMY.fortifyDays[this.infamyTier] ?? 0;
    if (!per || this.fortifyStepsDone >= INFAMY.fortifyMax) return;
    this.fortifyCarry += 1;
    if (this.fortifyCarry >= per) { this.fortifyCarry = 0; this.fortifyStepsDone += 1; }
  }
  fortifySteps() { return Math.min(INFAMY.fortifyMax, this.fortifyStepsDone); }

  get dateLabel() {
    const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor((this.day - 1) / 30) % 4];
    const year = 1 + Math.floor((this.day - 1) / 120);
    return `Day ${this.day}  ·  ${season}, Year ${year}`;
  }

  // ------------------------------------------------------------ settlements
  settlement(id: string): SettlementState {
    if (!this.settlements[id]) this.settlements[id] = { timesRaided: 0, lastRaidDay: null, occupied: false, sacked: false, wealth: 1 };
    if (this.settlements[id].wealth === undefined) this.settlements[id].wealth = 1;
    return this.settlements[id];
  }
  /** Can you shop here? Only your camp and places you occupy. */
  controls(id: string) { return id === 'camp' || !!this.settlements[id]?.occupied; }
  /**
   * How a settlement receives you: your own places fully; unconquered places as a paying customer —
   * unless you have raided them yourself, or your name has reached Raider (then every gate shuts).
   */
  access(id: string): Access {
    if (id === 'camp') return 'camp';
    const node = nodeById(id);
    if (node.kind === 'trade') return 'trade';
    if (node.kind === 'foreign') {
      const s2 = this.settlement(id);
      if (s2.occupied) return 'occupied';
      if (s2.sacked) return 'sacked';
      // your own country is not a country you visit: its gates are open and its prices are its prices
      if (this.rules(node.territory)) return s2.occupied ? 'occupied' : 'visit';
      if (this.isHome(node.territory)) return s2.timesRaided > 0 ? 'closed' : 'visit';
      // a country that has had a warband in it does not sell you a sword the following week
      if ((this.realmInfamy[node.territory] ?? 0) > 0) return 'closed';
      return 'foreign';
    }
    const s = this.settlement(id);
    if (s.occupied) return 'occupied';
    if (s.sacked) return 'sacked';
    if (s.timesRaided > 0 || this.infamyTier >= 2) return 'closed';
    return 'visit';
  }
  /** Why the gates are shut (for the map panel). */
  closedReason(id: string) {
    const s = this.settlement(id);
    const node = nodeById(id);
    if (node.kind === 'foreign') {
      return s.timesRaided > 0
        ? 'You put their people to the sword. Every gate in this country is barred to you.'
        : 'You have made war in this country. Their gates are barred to you, and their riders are looking.';
    }
    if (s.timesRaided > 0) return 'They know your face here — you raided them. The gates stay shut unless you take the place.';
    return `Word of a ${this.infamyTierName} travels faster than you do. No gate in the land opens to you now.`;
  }
  get controlledIds() { return ['camp', ...NODES.filter(n => this.settlements[n.id]?.occupied).map(n => n.id)]; }

  villageInfo(id: string): VillageInfo {
    const node = nodeById(id);
    const tier = node.tier ?? 1;
    const base = VILLAGE_TIERS[tier - 1];
    const vs = this.settlement(id);
    const steps = vs.timesRaided === 0 ? this.fortifySteps() : 0;
    const sinceRaid = vs.lastRaidDay === null ? Infinity : this.day - vs.lastRaidDay;
    const ruined = vs.sacked || sinceRaid < RERAID.recoverDays;
    const militia = base.militia + steps + vs.timesRaided * RERAID.militiaPerRaid;
    const archers = base.archers + (steps >= INFAMY.archerAt ? 1 : 0);
    const captains = base.captains;
    return {
      tier, timesRaided: vs.timesRaided, ruined, daysToRecover: vs.sacked ? Infinity : ruined ? RERAID.recoverDays - sinceRaid : 0,
      occupied: vs.occupied, sacked: vs.sacked, wealth: vs.wealth,
      steps, palisade: steps >= INFAMY.palisadeAt,
      militia, archers, captains,
      statMult: base.statMult + vs.timesRaided * RERAID.statPerRaid,
      goldMult: (base.goldMult + vs.timesRaided * RERAID.goldPerRaid) * vs.wealth,
      total: militia + archers + captains,
    };
  }

  // ------------------------------------------------------------ the empires' garrisons
  /**
   * What is standing in a foreign settlement's square. Nothing about this gates the fight: the panel
   * prints these numbers so the choice you make is an informed one. A place's rank sets the size of
   * the garrison and the realm's own strength scales all of it — a Kushite village and the walls of
   * Roma are the two ends of the same table.
   */
  foreignInfo(id: string) {
    const n = nodeById(id);
    const realm = n.territory;
    const rank: PlaceKind = n.rank ?? 'town';
    const base = FOREIGN_GARRISON[rank];
    const power = REALM_POWER[realm] ?? 1;
    const v = visitOf(realm);
    const vs = this.settlement(id);
    // The further from its own throne, the thinner the country's grip on it — and a border hamlet is
    // the thinnest thing there is by definition, whatever the geometry says. This is what makes a
    // first raid possible for every start, in its own country, without leaving it.
    const thin = n.fringe ? FRONTIER_THIN.fringe : 1 - frontier(n) * (FRONTIER_THIN[rank] ?? 0);
    const up = (x: number) => Math.max(1, Math.round(x * power * thin));
    let militia = up(base.militia);
    let archers = up(base.archers), captains = up(base.captains), elites = up(base.elites);
    // A phone has to draw every one of them, so past the cap the rank and file are trimmed and the
    // men who matter never are. The strength of the ones sent home is not thrown away — it goes into
    // the ones still standing, so Rome stays harder than China even when both field the same 58.
    // What is standing there depends on how well the place is held, not only how many. A hamlet is
    // whoever lives in it; a throne is the country's army with its champion in front.
    const grade = Math.max(1, Math.min(5, Math.round(
      (rank === 'capital' ? 5 : rank === 'city' ? 4 : rank === 'town' ? 3 : n.fringe ? 1 : 2) * (0.5 + thin * 0.55))));
    const mix = GARRISON_MIX[grade];
    militia = Math.max(1, Math.round(militia * mix.militia));
    archers = Math.round(archers * mix.archers);
    captains = Math.round(captains * mix.captains);
    elites = Math.round(elites * mix.elites);
    // A place the atlas bothered to name keeps a man or two of the country's own, however far out it
    // is. Only the border hamlets — nobody's idea of a garrison — field none.
    if (!n.fringe) elites = Math.max(1, elites);
    const raw = militia + archers + captains + elites + (mix.champion ? 1 : 0);
    const over = raw - FOREIGN_MAX_DEFENDERS;
    let crowd = 1;
    if (over > 0) {
      militia = Math.max(4, militia - over);
      crowd = 1 + ((raw - (militia + archers + captains + elites)) / raw) * 0.6;
    }
    const style = v?.army.style ?? 'shieldman';
    return {
      realm, rank, militia, archers, captains, elites,
      grade, champion: mix.champion,
      total: militia + archers + captains + elites + (mix.champion ? 1 : 0),
      // come back a second time and they are ready for you, and there is less left to take
      // frontier men are the same men, just fewer of them and less well kept
      statMult: base.statMult * power * crowd * (0.6 + thin * 0.4) * (1 + vs.timesRaided * FOREIGN.reraidStat),
      goldMult: base.goldMult * power * (vs.wealth ?? 1) * (1 + vs.timesRaided * FOREIGN.reraidGold),
      timesRaided: vs.timesRaided,
      wealth: vs.wealth ?? 1,
      /** rank as the old village-tier number, for the loot and conquest maths */
      tierish: rank === 'capital' ? 4 : rank === 'city' ? 3 : rank === 'town' ? 2 : 1,
      eliteKind: style,
      eliteName: v?.army.eliteName ?? 'Guardsman',
      elitePlural: v?.army.elitePlural ?? 'guardsmen',
      eliteNote: v?.army.eliteNote ?? '',
      tint: ELITE_TINT[realm] ?? 0xd0d0d0,
      reforms: style === 'spearman' ? FOREIGN.reformsPerBattle[rank] : 0,
    };
  }

  /**
   * A realm's riders, once its meter says you are worth chasing. This reads the RAW score rather than
   * the tier, because the tiers stop at 45 and a country whose throne you burned should not send the
   * same eight men it sent after a village.
   */
  foreignPatrol(realm: string) {
    const v = visitOf(realm);
    const power = REALM_POWER[realm] ?? 1;
    const heat = Math.min(4, this.territoryInfamy(realm) / 30);
    const style = v?.army.style ?? 'shieldman';
    const name = REALM_SHORT[realm] ?? realm.toUpperCase();
    return {
      name: `${name} patrol`, title: 'THEIR RIDERS HAVE YOU',
      hint: 'They have been on your trail since you drew steel in this country.',
      militia: Math.round((4 + heat * 3) * power), archers: Math.round((1 + heat) * power),
      captains: heat >= 2 ? Math.round(heat / 2) : 0, elites: Math.max(1, Math.round(heat * power)),
      statMult: 1.4 + heat * 0.25, goldMult: 1.4,
      eliteKind: style, eliteName: v?.army.eliteName ?? 'Guardsman', elitePlural: v?.army.elitePlural ?? 'guardsmen',
      tint: ELITE_TINT[realm] ?? 0xd0d0d0,
    };
  }

  /** Strip a body. Only the men who were carrying something worth carrying. */
  takeLoot(name: string, value: number, from: string) {
    this.loot.push({ id: this.nextId++, name, value, from });
  }
  /** Sell it. Anything you own can go, at any market that will have you. */
  sellLoot(id: number, markup: number) {
    const i = this.loot.findIndex(l => l.id === id);
    if (i < 0) return 0;
    const [item] = this.loot.splice(i, 1);
    // a market buys low and sells high; a stranger's market buys lower still
    const paid = Math.max(1, Math.round((item.value * 0.6) / Math.max(1, markup * 0.75)));
    this.gold += paid;
    return paid;
  }
  /** Take a job. Arriving, or killing, is what finishes it. */
  takeQuest(q: Omit<Quest, 'id'>) { this.quests.push({ ...q, id: this.nextId++ }); }

  /**
   * A save says two things about where you are: the id of the place you are standing in, and the raw
   * coordinates you are standing on. Those agreed when the save was written — and then the atlas was
   * eased apart, and the town moved out from under the man standing in it. He is now a day's march
   * outside a place he believes he is inside: no gate to enter, no parcel to hand over, no panel that
   * knows him. The id is the thing he meant, so the coordinates give way to it.
   *
   * Only ever while you are standing SOMEWHERE. A warband saved on the open road named no place, and
   * nothing drags it to one.
   */
  private standWhereYouSaid() {
    if (this.voyage) return;                       // at sea you are nowhere by design
    if (!this.location) return;
    let n: MapNode | null = null;
    try { n = nodeById(this.location); } catch { return; }
    const off = Math.hypot(n.x - this.pos.x, n.y - this.pos.y);
    if (off <= 8 || off > 400) return;             // already there, or far enough that it is not drift
    this.pos = { x: n.x, y: n.y };
  }

  /**
   * A warband standing where no road can leave is not a decision anybody made — it is a save written
   * by an older map. Rome's camp used to land on a six-cell islet off Italy, and a run continued from
   * one of those saves can march nowhere at all: every tap answers "there is water in the way",
   * because it is true in every direction. Carry them to the nearest shore that has places on it.
   */
  rescueStranded(): string | null {
    // ground that actually holds a country: three or more named places standing on it. A lone islet
    // that a capital's dot happens to snap onto does not count as somewhere you can live.
    const tally = new Map<number, number>();
    for (const n of NODES) {
      if (!n.name) continue;
      const c = componentNear(n.x, n.y);
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    // Two different questions, and they want two different answers. Ground with ANY named place on it
    // is somewhere you may STAND — Iceland holds exactly one, and once a ship can put you there, a
    // stricter rule would carry you off it on your next reload. But ground you are CARRIED to when you
    // were on a rock has to be a country you can leave on foot, or the rescue just maroons you again.
    const peopled = (c: number) => (tally.get(c) ?? 0) >= 1;
    const acountry = (c: number) => (tally.get(c) ?? 0) >= 3;
    this.rescuedTo = null;
    // and a warband in the middle of the ocean is not stranded, it is travelling
    if (this.voyage) return null;
    // the same shore-snap a march gets: standing at Roma means standing at its quay, which is drawn
    // on the water and is a perfectly good place to be. Only ground with no country on it is a rock.
    if (peopled(componentNear(this.pos.x, this.pos.y))) return null;
    let best: MapNode | null = null, bestD = Infinity, bestComp = 0;
    for (const n of NODES) {
      const c = componentNear(n.x, n.y);
      if (!n.name || !acountry(c)) continue;
      const d = Math.hypot(n.x - this.pos.x, n.y - this.pos.y);
      if (d < bestD) { bestD = d; best = n; bestComp = c; }
    }
    if (!best) return null;
    // and put them on GROUND, not on the dot: the atlas draws Ostia and Roma a hair out to sea, and a
    // warband standing on a sea cell can no more leave it than it could leave the islet
    const stand = nearestOnLandmass(best.x, best.y, bestComp) ?? [best.x, best.y];
    this.pos = { x: Math.round(stand[0]), y: Math.round(stand[1]) };
    this.location = best.id;
    this.rescuedTo = best.name;
    return best.name;
  }

  /** Set when a stranded save was carried ashore on load, so the map can say so once. */
  rescuedTo: string | null = null;
  /** Realms whose crown was granted on load because the terms were already met. Said once, then cleared. */
  crowned: string[] = [];
  /** Where the warband is sailing, while it is at sea. A crossing survives a reload like anything else. */
  voyage: { toId: string; daysLeft: number } | null = null;

  /** The settlements an active job points at — these stay on the chart at every zoom. */
  questTargets(): string[] {
    return this.quests.filter(q => q.kind === 'deliver' && q.to).map(q => q.to as string);
  }

  /**
   * A job whose destination cannot be reached is not a job, it is a dead end in the save file. Older
   * boards named any place within nine hundred units, islands and all; those are re-pointed at the
   * nearest settlement that can actually be walked to, keeping the parcel and the pay.
   */
  repairQuests(): number {
    let fixed = 0;
    for (const q of this.quests) {
      if (q.kind !== 'deliver' || !q.to) continue;
      let node: MapNode | null = null;
      try { node = nodeById(q.to); } catch { node = null; }
      // A courier's job is a march, so a job is broken when nobody could have walked it FROM THE BOARD
      // THAT OFFERED IT. That is a fact about the job, not about you: a parcel for Ashford is still a
      // parcel for Ashford while you are standing in Japan, and re-pointing it there would be theft.
      const board = NODES.find(n => n.name === q.from);
      const start: [number, number] = board ? [board.x, board.y] : [this.pos.x, this.pos.y];
      const walk = node ? routeToPlace(start, [node.x, node.y]) : null;
      if (node && walk) { if (q.days == null) q.days = Math.max(1, Math.round(walk.days)); continue; }
      const land = componentNear(this.pos.x, this.pos.y);
      const alt = NODES
        .filter(n => !!n.name && n.kind !== 'cross' && n.kind !== 'waypoint' && n.kind !== 'camp'
          && (!land || componentNear(n.x, n.y) === land))
        .map(n => ({ n, d: Math.hypot(n.x - this.pos.x, n.y - this.pos.y) }))
        .sort((a, b) => a.d - b.d)
        .map(x => x.n)
        .find(n => !!routeToPlace([this.pos.x, this.pos.y], [n.x, n.y]));
      if (!alt) continue;
      const was = node?.name ?? 'somewhere off the map';
      q.text = q.text.replace(new RegExp(`to ${was}$`), `to ${alt.name}`);
      if (!q.text.includes(alt.name)) q.text = `${q.text.replace(/ to .*$/, '')} to ${alt.name}`;
      q.to = alt.id;
      q.days = Math.max(1, Math.round(routeToPlace([this.pos.x, this.pos.y], [alt.x, alt.y])!.days));
      fixed++;
    }
    return fixed;
  }
  /** Anything finished by standing where you are standing now. */
  settleQuests(where: string): Quest[] {
    const done = this.quests.filter(q => q.kind === 'deliver' && q.to === where);
    if (!done.length) return [];
    this.quests = this.quests.filter(q => !done.includes(q));
    for (const q of done) this.gold += q.reward;
    return done;
  }
  /** And anything finished by winning a fight against this realm's men. */
  settleHunt(realm: Territory): Quest[] {
    const done = this.quests.filter(q => q.kind === 'hunt' && q.realm === realm);
    if (!done.length) return [];
    this.quests = this.quests.filter(q => !done.includes(q));
    for (const q of done) this.gold += q.reward;
    return done;
  }

  /** A party you put down is gone for good, and its country stops looking for a few days. */
  huntQuieted(territory: Territory) { this.huntQuiet[territory] = this.day + HUNT.graceDays; }
  /** Do you wear this country's crown? */
  rules(territory: Territory) {
    return this.ruled.includes(territory) || (territory === 'mongolia' && this.ruled.includes('steppe'))
      || (territory === 'steppe' && this.ruled.includes('mongolia'));
  }
  /** What they call you. The grandest crown you wear, in that country's own word for it. */
  get title() {
    if (!this.ruled.length) return '';
    const best = [...this.ruled].sort((a, b) => this.realmWeight(b) - this.realmWeight(a))[0];
    const word = CROWN_TITLE[best] ?? 'King';
    const of = best === 'homeland' ? 'the Borderland' : (REGIONS.find(r => r.id === best || (best === 'steppe' && r.id === 'mongolia'))?.name ?? best);
    return this.ruled.length > 1 ? `${word} of ${of}, and ${this.ruled.length - 1} more` : `${word} of ${of}`;
  }
  private realmWeight(realm: string) { return NODES.filter(n => n.territory === realm).length; }

  /**
   * Have you taken enough of a country to BE it? The throne and every great city — after that the
   * villages send fealty rather than making you walk to each of them, which is the difference between
   * a conquest and a mopping-up chore.
   */
  /**
   * A crown is a CONDITION, not a moment. Holding a throne and all its great cities is what makes a
   * realm yours — but this used to be examined only at the instant a battle ended, so a warband that
   * met the terms any other way, or met them in a build that asked something different, held the
   * whole country and was still called a raider in it forever. Every realm is re-examined on load and
   * after every victory, so the chart can never disagree with the map about who rules what.
   */
  settleCrowns(): string[] {
    const won: string[] = [];
    for (const realm of new Set(NODES.map(n => n.territory))) {
      if (this.checkFealty(realm)) won.push(REGIONS.find(r => r.id === realm)?.name ?? realm);
    }
    return won;
  }

  checkFealty(realm: Territory): boolean {
    if (!realm || realm === 'steppe' || this.rules(realm)) return false;
    const held = (n: MapNode) => { const st = this.settlements[n.id]; return !!(st && (st.occupied || st.sacked)); };
    const crowns = NODES.filter(n => n.territory === realm && (n.rank === 'capital' || n.rank === 'city'));
    if (crowns.length < 2 || !crowns.every(held)) return false;
    // the rest bends the knee
    for (const n of NODES.filter(x => x.territory === realm)) {
      const st = this.settlement(n.id);
      if (!st.sacked) { st.occupied = true; st.timesRaided = 0; }
    }
    this.ruled.push(realm);
    // a crown clears the score: the country stops hunting the man who now rules it
    this.realmInfamy[realm] = 0;
    if (realm === this.home) this.infamy = Math.min(this.infamy, INFAMY.tiers[1].min - 1);
    delete this.huntQuiet[realm];
    this.hunters = this.hunters.filter(h => h.kind !== realm);
    // and every other throne on the chart hears about it
    for (const other of new Set(NODES.map(n => n.territory))) {
      if (other === realm || this.rules(other) || other === this.home) continue;
      const tier = this.tierOf(this.territoryInfamy(other));
      const next = INFAMY.tiers[Math.min(tier + 1, INFAMY.tiers.length - 1)].min;
      if (this.territoryInfamy(other) < next) this.addInfamyIn(other, next - this.territoryInfamy(other));
    }
    return true;
  }

  /** Add to whichever meter is keeping score in this country. */
  addInfamyIn(territory: Territory, n: number) {
    if (this.isHome(territory)) this.infamy += n;
    else if (territory === 'steppe') this.steppeInfamy += n;
    else this.realmInfamy[territory] = (this.realmInfamy[territory] ?? 0) + n;
  }

  /**
   * How well a place is held, in stars, so the map can be read at a glance. It is not a separate
   * opinion: it is the garrison the panel prints, multiplied by how hard each of those men is — the
   * one number that makes a Kushite village and the walls of Roma comparable at a glance.
   */
  protection(id: string): number {
    const n = nodeById(id);
    if (n.kind === 'camp') return 0;
    let force: number;
    if (n.kind === 'foreign') { const i = this.foreignInfo(id); force = i.total * i.statMult; }
    else if (n.kind === 'town') force = (SIEGE.wallArchers + SIEGE.guards + SIEGE.escort) * 1.6 + 14;
    else if (n.kind === 'village') { const v = this.villageInfo(id); force = v.total * v.statMult; }
    else return 0;
    const st = this.settlement(id);
    if (st.sacked) return 0;
    if (st.occupied) return 1;
    return force < 18 ? 1 : force < 42 ? 2 : force < 95 ? 3 : force < 165 ? 4 : 5;
  }
  /** The rating as it is written on the chart and in the panels. */
  stars(id: string) { const n = this.protection(id); return n ? `${'\u2605'.repeat(n)}${'\u2606'.repeat(5 - n)}` : ''; }

  // ------------------------------------------------------------ defeat

  /**
   * A lost fight, and it stays lost. The men who fell are dead, the victors go through your purse,
   * and you are carried off the field alive but useless for the better part of a week. There is no
   * replaying it — which is the whole point of having gone in the first place.
   */
  commitDefeat(deadTroopIds: number[], battle: BattleOutcome): DefeatReport {
    for (const id of deadTroopIds) {
      const t = this.troops.find(x => x.id === id);
      if (t) this.fallen.push({ name: t.name, raid: this.raidsDone + 1, where: battle.name });
    }
    const lost = this.troops.filter(t => deadTroopIds.includes(t.id)).map(t => t.name);
    this.troops = this.troops.filter(t => !deadTroopIds.includes(t.id));
    // they take half of what you carry, and leave you enough to get up the road
    const before = this.gold;
    const kept = Math.max(DEFEAT.floorGold, Math.round(before * (1 - DEFEAT.plunderShare)));
    const taken = Math.max(0, before - Math.min(before, kept));
    this.gold = Math.max(0, before - taken);
    // out cold for a few days. The days still pass — tribute from what you hold keeps coming in, so
    // a man with land can recover from this and a man with none has to be careful.
    const days = DEFEAT.restDays[0] + Math.floor(Math.random() * (DEFEAT.restDays[1] - DEFEAT.restDays[0] + 1));
    const events = this.advanceDays(days);
    const where = this.nearestRefuge();
    this.pos = { x: where.x, y: where.y };
    this.patrolPending = false;
    this.pendingVictory = null;
    this.raidsDone += 1;
    this.save();
    return { fallen: lost, goldLost: taken, goldLeft: this.gold, days, wokeAt: where.name, survivors: this.troops.length, events };
  }

  /**
   * Where a beaten man wakes: his own camp, or the nearest place he holds. Whoever carried him off
   * the field took him somewhere that would have him.
   */
  nearestRefuge(): { id: string; name: string; x: number; y: number } {
    // Whoever carried you off the field carried you somewhere on THIS shore. Losing a fight in Japan
    // must not post you home to the Borderland — that is a free crossing, and the sea is not free.
    const shore = componentNear(this.pos.x, this.pos.y);
    const held = NODES.filter(n => n.id === 'camp' || this.settlements[n.id]?.occupied);
    const onThisShore = held.filter(n => !shore || componentNear(n.x, n.y) === shore);
    const mine = onThisShore.length ? onThisShore : held;
    const home = mine.find(n => n.id === 'camp') ?? mine[0];
    if (!mine.length) return { id: 'camp', name: 'your camp', x: this.pos.x, y: this.pos.y };
    let best = home, bestD = Infinity;
    for (const n of mine) {
      const d = Math.hypot(n.x - this.pos.x, n.y - this.pos.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return { id: best.id, name: best.name, x: best.x, y: best.y };
  }

  /** Victory: bank the loot, bury the dead, and apply the conquest choice. Returns a short summary line. */
  commitVictory(goldEarned: number, deadTroopIds: number[], battle: BattleOutcome, choice: Conquest): string {
    this.gold += goldEarned;
    for (const id of deadTroopIds) {
      const t = this.troops.find(x => x.id === id);
      if (t) this.fallen.push({ name: t.name, raid: this.raidsDone + 1, where: battle.name });
    }
    this.troops = this.troops.filter(t => !deadTroopIds.includes(t.id));
    this.raidsDone += 1;
    let summary = `+${goldEarned} gold`;
    if (battle.kind === 'patrol') {
      this.addInfamy(INFAMY.perPatrol);
      this.settleHunt(this.home);
      this.huntQuieted(this.patrolFrom);
      this.patrolPending = false;
    } else if (battle.kind === 'steppePatrol') {
      this.steppeInfamy += INFAMY.perPatrol;
      this.huntQuieted('steppe');
      this.patrolPending = false;
      summary = `Riders routed: +${goldEarned} gold. The steppe remembers.`;
    } else if (battle.kind === 'camp' && battle.campId) {
      // a roaming camp: loot it, it scatters, and the other camps' riders come hunting
      this.campScattered[battle.campId] = this.day + STEPPE.scatterDays;
      this.huntedUntil = this.day + STEPPE.huntDays;
      this.steppeInfamy += STEPPE.campInfamy;
      summary = `${battle.name} plundered: +${goldEarned} gold. Its riders scatter — and the other camps ride to hunt you for ${STEPPE.huntDays} days.`;
    } else if (battle.kind === 'foreignPatrol') {
      if (battle.realm) {
        this.addInfamyIn(battle.realm, INFAMY.perPatrol);
        this.huntQuieted(battle.realm);
        const paid = this.settleHunt(battle.realm);
        if (paid.length) summary = `${summary}. Word of it is worth ${paid.reduce((n, q) => n + q.reward, 0)} gold to whoever posted it.`;
      }
      this.patrolPending = false;
      summary = `Their riders are down: +${goldEarned} gold. The country will send more.`;
    } else if (battle.villageId) {
      const id = battle.villageId;
      const node = nodeById(id);
      const foreign = node.kind === 'foreign';
      const realm: Territory = foreign ? node.territory : 'homeland';
      // a place abroad answers to ITS OWN country's memory, not to your homeland's
      const spike = foreign ? FOREIGN.infamy[node.rank ?? 'town'] : 0;
      const town = node.kind === 'town' || (foreign && (node.rank === 'city' || node.rank === 'capital'));
      const vs = this.settlement(id);
      if (battle.kind === 'siege') { this.owned.halberd = true; this.equippedWeapon = 'halberd'; }
      if (choice === 'sack') {
        const extra = this.sackBonus(goldEarned, town);
        this.gold += extra;
        vs.sacked = true; vs.occupied = false;
        delete this.garrisons[id];
        if (foreign) this.addInfamyIn(realm, Math.round(spike * FOREIGN.sackMult));
        else this.addInfamyIn('homeland', town ? CONQUEST.sackTownInfamy : INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1) + CONQUEST.sackVillageInfamy);
        summary = foreign
          ? `Sacked ${node.name}: +${goldEarned + extra} gold. ${REALM_SHORT[realm] ?? 'The realm'} will not forget which name did this.`
          : `Sacked ${node.name}: +${goldEarned + extra} gold. It burns; nothing will ever come from it again.`;
      } else if (choice === 'occupy') {
        vs.occupied = true; vs.sacked = false;
        const garrison = this.troops.slice(0, CONQUEST.garrison);
        this.troops = this.troops.slice(garrison.length);
        this.garrisons[id] = garrison;
        if (foreign) this.addInfamyIn(realm, Math.round(spike * FOREIGN.occupyMult));
        else this.addInfamyIn('homeland', INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1));
        summary = `Occupied ${node.name}: +${goldEarned} gold now, tribute every day. ${garrison.map(g => g.name).join(' and ') || 'Nobody'} stay${garrison.length === 1 ? 's' : ''} as the garrison.`;
      } else {
        vs.timesRaided += 1;
        vs.lastRaidDay = this.day;
        // plundered — recovers over ~15 days. Abroad this applies at EVERY rank: a great city you
        // strip has to be poorer next time, or the richest places on the board are a free income.
        if (!town || foreign) vs.wealth = Math.max(RERAID.wealthMin, vs.wealth - RERAID.wealthDrop);
        if (foreign) this.addInfamyIn(realm, spike);
        else this.addInfamyIn('homeland', INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1));
        summary = foreign
          ? `${node.name} is stripped: +${goldEarned} gold. Word of it is already on the road ahead of you.`
          : `Raided ${node.name}: +${goldEarned} gold. It lies ruined for ${RERAID.recoverDays} days, and poorer for longer.`;
      }
    }
    // did that take enough of a country to BE it?
    if (battle.villageId) {
      const realm = nodeById(battle.villageId).territory;
      if (this.checkFealty(realm)) {
        summary = `${summary}  ${realm === this.home ? 'Your own country' : (REGIONS.find(r => r.id === realm)?.name ?? 'The realm')} is yours. They call you ${this.title}.`;
      }
    }
    this.pendingVictory = null;
    this.save();
    return summary;
  }

  /** Troops still standing after a battle (the dead are only removed when the outcome is committed). */
  survivors(deadTroopIds: number[]) { return this.troops.filter(t => !deadTroopIds.includes(t.id)); }
  /** What sacking a place pays on top of the raid's loot. */
  sackBonus(goldEarned: number, town: boolean) {
    return Math.max(town ? CONQUEST.sackTownFloor : CONQUEST.sackVillageFloor, Math.round(goldEarned * CONQUEST.sackLootMult));
  }
  /** Occupying needs at least one survivor to hold the place (up to two stay). */
  canOccupyWith(deadTroopIds: number[]) { return this.survivors(deadTroopIds).length >= 1; }

  // ------------------------------------------------------------ save / load (browser storage, one slot)
  toJSON(): SaveData {
    return {
      version: SAVE_VERSION, gold: this.gold, day: this.day, infamy: this.infamy, weaponTier: this.weaponTier,
      equippedWeapon: this.equippedWeapon, horse: this.horse, armor: this.armor, shield: this.shield, owned: { ...this.owned },
      troops: this.troops.map(t => ({ ...t })), fallen: this.fallen.map(f => ({ ...f })), deserted: [...this.deserted],
      nextId: this.nextId, nameCursor: this.nameCursor, raidsDone: this.raidsDone,
      location: this.location,
      patrolPending: this.patrolPending, patrolFrom: this.patrolFrom, pos: { ...this.pos }, hunters: this.hunters.map(h => ({ ...h })),
      settlements: JSON.parse(JSON.stringify(this.settlements)), garrisons: JSON.parse(JSON.stringify(this.garrisons)),
      fortifyStepsDone: this.fortifyStepsDone, fortifyCarry: this.fortifyCarry,
      unpaidDays: this.unpaidDays, seenMapHint: this.seenMapHint,
      rumorsHeard: [...this.rumorsHeard], pendingVictory: this.pendingVictory ? JSON.parse(JSON.stringify(this.pendingVictory)) : null,
      civ: this.civ, formation: this.formation, voyage: this.voyage ? { ...this.voyage } : null, loot: this.loot.map(l => ({ ...l })), quests: this.quests.map(q => ({ ...q })), steppeInfamy: this.steppeInfamy, realmInfamy: { ...this.realmInfamy }, campScattered: { ...this.campScattered }, huntedUntil: this.huntedUntil,
    };
  }
  fromJSON(d: SaveData) {
    this.gold = d.gold; this.day = d.day; this.infamy = d.infamy; this.weaponTier = d.weaponTier;
    this.equippedWeapon = d.equippedWeapon; this.horse = d.horse; this.armor = d.armor ?? 'none'; this.shield = d.shield ?? 'none';
    this.owned = Object.assign({ leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false, ship: false }, d.owned);
    this.troops = d.troops.map(t => ({ ...t, kind: t.kind ?? 'raider' })); this.fallen = (d.fallen ?? []).map(f => ({ ...f })); this.deserted = [...(d.deserted ?? [])];
    this.nextId = d.nextId; this.nameCursor = d.nameCursor; this.raidsDone = d.raidsDone;
    this.location = d.location;
    // a save from before free movement only knows which place you were standing at; start you there
    const at = d.location && NODES.some(n => n.id === d.location) ? nodeById(d.location) : nodeById('camp');
    this.pos = d.pos ? { ...d.pos } : { x: at.x, y: at.y };
    this.hunters = (d.hunters ?? []).map(h => ({ ...h }));
    this.patrolPending = d.patrolPending ?? false;
    this.patrolFrom = d.patrolFrom ?? (this.location ? territoryOf(this.location) : 'homeland');
    this.settlements = JSON.parse(JSON.stringify(d.settlements ?? {})); this.garrisons = JSON.parse(JSON.stringify(d.garrisons ?? {}));
    this.fortifyStepsDone = d.fortifyStepsDone ?? 0; this.fortifyCarry = d.fortifyCarry ?? 0;
    this.unpaidDays = d.unpaidDays ?? 0; this.seenMapHint = d.seenMapHint ?? false;
    this.rumorsHeard = [...(d.rumorsHeard ?? [])]; this.pendingVictory = d.pendingVictory ? JSON.parse(JSON.stringify(d.pendingVictory)) : null;
    // a save written before there was a choice is the Borderland Outlaw, which is what it was playing
    this.setCiv(d.civ ?? 'outlaw');
    this.formation = d.formation ?? 'line';
    this.loot = (d.loot ?? []).map(l => ({ ...l }));
    this.voyage = d.voyage ? { ...d.voyage } : null;
    this.standWhereYouSaid();
    this.quests = (d.quests ?? []).map(q => ({ ...q }));
    // order matters: get the warband onto ground it can march from BEFORE the jobs are re-pointed,
    // because a job is repaired relative to where you are standing
    this.rescueStranded();
    this.repairQuests();
    this.huntQuiet = { ...(d.huntQuiet ?? {}) };
    this.ruled = [...(d.ruled ?? [])];
    this.gearTier = d.gearTier ?? 0;
    this.payRate = d.payRate ?? 'full';
    this.steppeInfamy = d.steppeInfamy ?? 0; this.realmInfamy = { ...(d.realmInfamy ?? {}) }; this.campScattered = { ...(d.campScattered ?? {}) }; this.huntedUntil = d.huntedUntil ?? -1;
    this.owned.composite = this.owned.composite ?? false;
    // LAST, once every field is back: a country you already hold is a country you already rule,
    // whenever and however you took it. Earlier than this and the load overwrites the crown.
    this.crowned = this.settleCrowns();
  }
  /** Parse and sanity-check the stored save without touching the live state. */
  private peek(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (!d || d.version !== SAVE_VERSION || !Array.isArray(d.troops) || typeof d.gold !== 'number' || typeof d.location !== 'string' || !d.owned) return null;
      return d;
    } catch { return null; }
  }
  save() {
    if (!this.persistable) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); } catch { /* private mode etc. — play on without saving */ }
  }
  hasSave() { return this.peek() !== null; }
  load(): boolean {
    const d = this.peek();
    if (!d) return false;
    try { this.fromJSON(d); } catch { return false; }
    this.persistable = true;
    return true;
  }
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

export const GameState = new GameStateStore();

// GameState.ts — the whole run: gold, day, infamy, gear, horse, your named troops, where you are on
// the map, what state each settlement is in, who garrisons what, and the daily ledger (wages in,
// tribute out). Saved to browser storage (single slot).
import { CONQUEST, FOREIGN, FOREIGN_GARRISON, FOREIGN_MAX_DEFENDERS, REALM_POWER, DEFENSE_SOFTCAP, EQUIPMENT, HERO, HORSES, INFAMY, PATROLS, RERAID, SIEGE, STEPPE, TRIBUTE, TROOP, UPKEEP, VILLAGE_TIERS } from '../config/balance';
import { nameAt } from '../utils/names';
import { NODES, nodeById, territoryOf, type Territory } from '../world/WorldMap';
import { ELITE_TINT, REALM_SHORT, visitOf } from '../world/Realms';
import { campPoint, civOf } from '../world/Civs';
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
export interface Owned { leather: boolean; plate: boolean; round: boolean; kite: boolean; bow: boolean; halberd: boolean; courser: boolean; destrier: boolean; composite: boolean; }
export interface SettlementState { timesRaided: number; lastRaidDay: number | null; occupied: boolean; sacked: boolean; wealth: number; }
export type Conquest = 'sack' | 'occupy' | 'leave';
export interface DayEvent { kind: 'unpaid' | 'desert'; text: string; }
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
  location: string; patrolPending: boolean; patrolFrom?: Territory;
  pos?: { x: number; y: number }; hunters?: Hunter[];
  settlements: Record<string, SettlementState>; garrisons: Record<string, TroopRecord[]>;
  fortifyStepsDone: number; fortifyCarry: number; unpaidDays: number; seenMapHint: boolean;
  rumorsHeard: string[]; pendingVictory: PendingVictory | null;
  steppeInfamy: number; campScattered: Record<string, number>; huntedUntil: number; civ?: string;
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
  owned: Owned = { leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false };
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
  /** What each foreign realm you have walked into thinks of you. A realm you have never entered is
   *  not in here at all; the day you cross its border it starts at nothing, like everywhere else did. */
  realmInfamy: Record<string, number> = {};
  campScattered: Record<string, number> = {};
  huntedUntil = -1;
  private nextId = 1;
  private nameCursor = 0;
  private snapshot: SaveData | null = null;
  /** Only a run that was started or loaded on purpose may be written to storage (the title screen must never clobber a save). */
  private persistable = false;

  constructor() { this.reset(); }

  /** Fresh run: no gold, rusty sword, three recruits, standing in camp on day 1. */
  reset() {
    this.gold = UPKEEP.startingGold; this.day = 1; this.infamy = 0; this.weaponTier = 1; this.equippedWeapon = 'sword'; this.horse = 'none';
    this.armor = 'none'; this.shield = 'none';
    this.owned = { leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false };
    this.steppeInfamy = 0; this.realmInfamy = {}; this.campScattered = {}; this.huntedUntil = -1;
    this.troops = []; this.fallen = []; this.deserted = []; this.raidsDone = 0; this.location = 'camp';
    this.patrolPending = false; this.patrolFrom = 'homeland'; this.pos = { x: nodeById('camp').x, y: nodeById('camp').y }; this.hunters = []; this.settlements = {}; this.garrisons = {}; this.fortifyStepsDone = 0; this.fortifyCarry = 0;
    this.unpaidDays = 0; this.seenMapHint = false; this.rumorsHeard = []; this.pendingVictory = null;
    this.nextId = 1; this.nameCursor = 0; this.snapshot = null;
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
  get wagesPerDay() { return this.troops.length * UPKEEP.wage; }
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
    const res = advanceHunters(this.hunters, this.pos, days, {
      tier: this.tierIn(), hunted: this.hunted,
      territory: this.territory, mounted: !!this.horse, rnd: Math.random,
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
      } else {
        this.gold = 0;
        this.unpaidDays += 1;
        if (this.unpaidDays <= UPKEEP.graceDays) {
          events.push({ kind: 'unpaid', text: `Day ${this.day}: the men were not paid. They grumble — pay them tomorrow or they walk.` });
        } else if (this.troops.length > 0) {
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
    const up = (x: number) => Math.max(1, Math.round(x * power));
    let militia = up(base.militia);
    const archers = up(base.archers), captains = up(base.captains), elites = up(base.elites);
    // A phone has to draw every one of them, so past the cap the rank and file are trimmed and the
    // men who matter never are. The strength of the ones sent home is not thrown away — it goes into
    // the ones still standing, so Rome stays harder than China even when both field the same 58.
    const raw = militia + archers + captains + elites;
    const over = raw - FOREIGN_MAX_DEFENDERS;
    let crowd = 1;
    if (over > 0) {
      militia = Math.max(4, militia - over);
      crowd = 1 + ((raw - (militia + archers + captains + elites)) / raw) * 0.6;
    }
    const style = v?.army.style ?? 'shieldman';
    return {
      realm, rank, militia, archers, captains, elites,
      total: militia + archers + captains + elites,
      // come back a second time and they are ready for you, and there is less left to take
      statMult: base.statMult * power * crowd * (1 + vs.timesRaided * FOREIGN.reraidStat),
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

  // ------------------------------------------------------------ retry support
  takeSnapshot() { this.snapshot = this.toJSON(); }
  restoreSnapshot() { if (this.snapshot) this.fromJSON(this.snapshot); }

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
      this.patrolPending = false;
    } else if (battle.kind === 'steppePatrol') {
      this.steppeInfamy += INFAMY.perPatrol;
      this.patrolPending = false;
      summary = `Riders routed: +${goldEarned} gold. The steppe remembers.`;
    } else if (battle.kind === 'camp' && battle.campId) {
      // a roaming camp: loot it, it scatters, and the other camps' riders come hunting
      this.campScattered[battle.campId] = this.day + STEPPE.scatterDays;
      this.huntedUntil = this.day + STEPPE.huntDays;
      this.steppeInfamy += STEPPE.campInfamy;
      summary = `${battle.name} plundered: +${goldEarned} gold. Its riders scatter — and the other camps ride to hunt you for ${STEPPE.huntDays} days.`;
    } else if (battle.kind === 'foreignPatrol') {
      if (battle.realm) this.addInfamyIn(battle.realm, INFAMY.perPatrol);
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
    this.pendingVictory = null;
    this.snapshot = null;
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
      civ: this.civ, steppeInfamy: this.steppeInfamy, realmInfamy: { ...this.realmInfamy }, campScattered: { ...this.campScattered }, huntedUntil: this.huntedUntil,
    };
  }
  fromJSON(d: SaveData) {
    this.gold = d.gold; this.day = d.day; this.infamy = d.infamy; this.weaponTier = d.weaponTier;
    this.equippedWeapon = d.equippedWeapon; this.horse = d.horse; this.armor = d.armor ?? 'none'; this.shield = d.shield ?? 'none';
    this.owned = Object.assign({ leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false }, d.owned);
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
    this.steppeInfamy = d.steppeInfamy ?? 0; this.realmInfamy = { ...(d.realmInfamy ?? {}) }; this.campScattered = { ...(d.campScattered ?? {}) }; this.huntedUntil = d.huntedUntil ?? -1;
    this.owned.composite = this.owned.composite ?? false;
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
    this.snapshot = null;
    this.persistable = true;
    return true;
  }
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

export const GameState = new GameStateStore();

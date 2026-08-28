// GameState.ts — the whole run: gold, day, infamy, gear, horse, your named troops, where you are on
// the map, and what state each village is in. Saved to browser storage (single slot).
import { DEFENSE_MIN_FRACTION, EQUIPMENT, HERO, HORSES, INFAMY, PATROLS, RERAID, TROOP, VILLAGE_TIERS } from '../config/balance';
import { nameAt } from '../utils/names';
import { nodeById } from '../world/WorldMap';

export interface TroopRecord { id: number; name: string; }
export interface FallenRecord { name: string; raid: number; where: string; }
export type WeaponKind = 'sword' | 'bow';
export type HorseKind = 'none' | 'courser' | 'destrier';
export interface Owned { armor: boolean; shield: boolean; bow: boolean; courser: boolean; destrier: boolean; }
export interface VillageState { timesRaided: number; lastRaidDay: number | null; }
export interface TravelResume { from: string; to: string; }

/** Everything the map and the raid need to know about a village right now. */
export interface VillageInfo {
  tier: number; timesRaided: number; ruined: boolean; daysToRecover: number;
  steps: number; palisade: boolean;
  militia: number; archers: number; captains: number; statMult: number; goldMult: number; total: number;
}

export interface BattleOutcome { kind: 'village' | 'patrol'; villageId?: string; tier?: number; name: string; }

const SAVE_KEY = 'warlord.save.v2';
const SAVE_VERSION = 2;

interface SaveData {
  version: number; gold: number; day: number; infamy: number; weaponTier: number; equippedWeapon: WeaponKind; horse: HorseKind;
  owned: Owned; troops: TroopRecord[]; fallen: FallenRecord[]; nextId: number; nameCursor: number; raidsDone: number;
  location: string; pendingPath: string[]; resumeTravel: TravelResume | null;
  villages: Record<string, VillageState>; fortifyStart: number | null; lastPatrolDay: number;
}

class GameStateStore {
  gold = 0;
  day = 1;
  infamy = 0;
  weaponTier = 1;          // 1..3
  equippedWeapon: WeaponKind = 'sword';
  horse: HorseKind = 'none';
  owned: Owned = { armor: false, shield: false, bow: false, courser: false, destrier: false };
  troops: TroopRecord[] = [];
  fallen: FallenRecord[] = [];
  raidsDone = 0;
  location = 'camp';
  pendingPath: string[] = [];
  resumeTravel: TravelResume | null = null;
  villages: Record<string, VillageState> = {};
  fortifyStart: number | null = null;
  lastPatrolDay = -99;
  private nextId = 1;
  private nameCursor = 0;
  private snapshot: SaveData | null = null;

  constructor() { this.reset(); }

  /** Fresh run: no gold, rusty sword, three recruits, standing in camp on day 1. */
  reset() {
    this.gold = 0; this.day = 1; this.infamy = 0; this.weaponTier = 1; this.equippedWeapon = 'sword'; this.horse = 'none';
    this.owned = { armor: false, shield: false, bow: false, courser: false, destrier: false };
    this.troops = []; this.fallen = []; this.raidsDone = 0; this.location = 'camp'; this.pendingPath = []; this.resumeTravel = null;
    this.villages = {}; this.fortifyStart = null; this.lastPatrolDay = -99;
    this.nextId = 1; this.nameCursor = 0; this.snapshot = null;
    for (let i = 0; i < TROOP.starting; i++) this.recruit();
  }

  recruit(): TroopRecord {
    const t = { id: this.nextId++, name: nameAt(this.nameCursor++) };
    this.troops.push(t);
    return t;
  }

  // ------------------------------------------------------------ hero stats from gear
  get defense() {
    let d = 0;
    if (this.owned.armor) d += EQUIPMENT.armor.defense;
    if (this.owned.shield) d += EQUIPMENT.shield.defense;
    if (this.horse !== 'none') d += HORSES[this.horse].defense;
    return d;
  }
  get maxHp() { return HERO.hp + (this.horse !== 'none' ? HORSES[this.horse].hp : 0); }
  get speedMult() { return this.horse === 'none' ? 1 : HORSES[this.horse].speedMult; }
  get heroScale() { return this.horse === 'none' ? 1 : HORSES[this.horse].scale; }
  get weaponKind(): WeaponKind { return this.equippedWeapon === 'bow' && this.owned.bow ? 'bow' : 'sword'; }
  /** Damage after defense — never below a fraction of the hit, so big blows always hurt. */
  applyDefense(amount: number) {
    return Math.max(Math.ceil(amount * DEFENSE_MIN_FRACTION), amount - this.defense);
  }

  // ------------------------------------------------------------ infamy
  get infamyTier() { let t = 0; INFAMY.tiers.forEach((tier, i) => { if (this.infamy >= tier.min) t = i; }); return t; }
  get infamyTierName() { return INFAMY.tiers[this.infamyTier].name; }
  get infamyNextMin(): number | null { return INFAMY.tiers[this.infamyTier + 1]?.min ?? null; }
  get bounty() { return this.infamy * INFAMY.bountyPerInfamy; }
  addInfamy(n: number) {
    this.infamy += n;
    if (this.infamyTier >= 1 && this.fortifyStart === null) this.fortifyStart = this.day;
  }
  get patrolChance() { return INFAMY.interceptChance[this.infamyTier] ?? 0; }
  patrolConfig() { return PATROLS[this.infamyTier]; }

  // ------------------------------------------------------------ time
  advanceDays(n: number) { this.day += n; }
  get dateLabel() {
    const season = ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor((this.day - 1) / 30) % 4];
    const year = 1 + Math.floor((this.day - 1) / 120);
    return `Day ${this.day}  ·  ${season}, Year ${year}`;
  }

  // ------------------------------------------------------------ villages
  village(id: string): VillageState {
    if (!this.villages[id]) this.villages[id] = { timesRaided: 0, lastRaidDay: null };
    return this.villages[id];
  }
  /** How many fortification steps unraided villages have taken since the world started fearing you. */
  fortifySteps() {
    if (this.fortifyStart === null) return 0;
    const per = INFAMY.fortifyDays[this.infamyTier] ?? 0;
    if (!per) return 0;
    return Math.min(INFAMY.fortifyMax, Math.floor((this.day - this.fortifyStart) / per));
  }
  villageInfo(id: string): VillageInfo {
    const node = nodeById(id);
    const tier = node.tier ?? 1;
    const base = VILLAGE_TIERS[tier - 1];
    const vs = this.village(id);
    const steps = vs.timesRaided === 0 ? this.fortifySteps() : 0;
    const sinceRaid = vs.lastRaidDay === null ? Infinity : this.day - vs.lastRaidDay;
    const ruined = sinceRaid < RERAID.recoverDays;
    const militia = base.militia + steps + vs.timesRaided * RERAID.militiaPerRaid;
    const archers = base.archers + (steps >= INFAMY.archerAt ? 1 : 0);
    const captains = base.captains;
    return {
      tier, timesRaided: vs.timesRaided, ruined, daysToRecover: ruined ? RERAID.recoverDays - sinceRaid : 0,
      steps, palisade: steps >= INFAMY.palisadeAt,
      militia, archers, captains,
      statMult: base.statMult + vs.timesRaided * RERAID.statPerRaid,
      goldMult: base.goldMult + vs.timesRaided * RERAID.goldPerRaid,
      total: militia + archers + captains,
    };
  }

  // ------------------------------------------------------------ retry support
  takeSnapshot() { this.snapshot = this.toJSON(); }
  restoreSnapshot() { if (this.snapshot) this.fromJSON(this.snapshot); }

  /** Victory: bank the loot, bury the dead, mark the village, grow infamous. */
  commitVictory(goldEarned: number, deadTroopIds: number[], battle: BattleOutcome) {
    this.gold += goldEarned;
    for (const id of deadTroopIds) {
      const t = this.troops.find(x => x.id === id);
      if (t) this.fallen.push({ name: t.name, raid: this.raidsDone + 1, where: battle.name });
    }
    this.troops = this.troops.filter(t => !deadTroopIds.includes(t.id));
    this.raidsDone += 1;
    if (battle.kind === 'village' && battle.villageId) {
      const vs = this.village(battle.villageId);
      vs.timesRaided += 1;
      vs.lastRaidDay = this.day;
      this.addInfamy(INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1));
    } else {
      this.addInfamy(INFAMY.perPatrol);
    }
    this.snapshot = null;
    this.save();
  }

  // ------------------------------------------------------------ save / load (browser storage, one slot)
  toJSON(): SaveData {
    return {
      version: SAVE_VERSION, gold: this.gold, day: this.day, infamy: this.infamy, weaponTier: this.weaponTier,
      equippedWeapon: this.equippedWeapon, horse: this.horse, owned: { ...this.owned },
      troops: this.troops.map(t => ({ ...t })), fallen: this.fallen.map(f => ({ ...f })),
      nextId: this.nextId, nameCursor: this.nameCursor, raidsDone: this.raidsDone,
      location: this.location, pendingPath: [...this.pendingPath], resumeTravel: this.resumeTravel ? { ...this.resumeTravel } : null,
      villages: JSON.parse(JSON.stringify(this.villages)), fortifyStart: this.fortifyStart, lastPatrolDay: this.lastPatrolDay,
    };
  }
  fromJSON(d: SaveData) {
    this.gold = d.gold; this.day = d.day; this.infamy = d.infamy; this.weaponTier = d.weaponTier;
    this.equippedWeapon = d.equippedWeapon; this.horse = d.horse; this.owned = { ...d.owned };
    this.troops = d.troops.map(t => ({ ...t })); this.fallen = d.fallen.map(f => ({ ...f }));
    this.nextId = d.nextId; this.nameCursor = d.nameCursor; this.raidsDone = d.raidsDone;
    this.location = d.location; this.pendingPath = [...(d.pendingPath ?? [])]; this.resumeTravel = d.resumeTravel ? { ...d.resumeTravel } : null;
    this.villages = JSON.parse(JSON.stringify(d.villages ?? {})); this.fortifyStart = d.fortifyStart; this.lastPatrolDay = d.lastPatrolDay ?? -99;
  }
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); } catch { /* private mode etc. — play on without saving */ }
  }
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }
  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== SAVE_VERSION) return false;
      this.fromJSON(d);
      this.snapshot = null;
      return true;
    } catch { return false; }
  }
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

export const GameState = new GameStateStore();

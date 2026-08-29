// GameState.ts — the whole run: gold, day, infamy, gear, horse, your named troops, where you are on
// the map, what state each settlement is in, who garrisons what, and the daily ledger (wages in,
// tribute out). Saved to browser storage (single slot).
import { CONQUEST, DEFENSE_SOFTCAP, EQUIPMENT, HERO, HORSES, INFAMY, PATROLS, RERAID, SIEGE, STEPPE, TRIBUTE, TROOP, UPKEEP, VILLAGE_TIERS } from '../config/balance';
import { nameAt } from '../utils/names';
import { NODES, nodeById, territoryOf, type Territory } from '../world/WorldMap';

export type TroopKind = 'raider' | 'levy' | 'guard' | 'rider';
export interface TroopRecord { id: number; name: string; kind: TroopKind; }
export interface FallenRecord { name: string; raid: number; where: string; }
export type WeaponKind = 'sword' | 'bow' | 'halberd' | 'composite';
export type ArmorKind = 'none' | 'leather' | 'plate';
export type ShieldKind = 'none' | 'round' | 'kite';
export type HorseKind = 'none' | 'courser' | 'destrier';
export interface Owned { leather: boolean; plate: boolean; round: boolean; kite: boolean; bow: boolean; halberd: boolean; courser: boolean; destrier: boolean; composite: boolean; }
export interface SettlementState { timesRaided: number; lastRaidDay: number | null; occupied: boolean; sacked: boolean; wealth: number; }
export interface TravelResume { from: string; to: string; }
export type Conquest = 'sack' | 'occupy' | 'leave';
export interface DayEvent { kind: 'unpaid' | 'desert'; text: string; }
export type Access = 'camp' | 'occupied' | 'visit' | 'closed' | 'sacked' | 'trade';
/** A won battle whose sack/occupy choice has not been made yet (survives a reload). */
export interface PendingVictory { goldEarned: number; deadTroopIds: number[]; battle: BattleOutcome; fallen: string[]; }

/** Everything the map and the raid need to know about a village right now. */
export interface VillageInfo {
  tier: number; timesRaided: number; ruined: boolean; daysToRecover: number; occupied: boolean; sacked: boolean; wealth: number;
  steps: number; palisade: boolean;
  militia: number; archers: number; captains: number; statMult: number; goldMult: number; total: number;
}

export interface BattleOutcome { kind: 'village' | 'patrol' | 'siege' | 'camp' | 'steppePatrol'; villageId?: string; campId?: string; tier?: number; name: string; }

const SAVE_VERSION = 3;
const SAVE_KEY = `warlord.save.v${SAVE_VERSION}`;

interface SaveData {
  version: number; gold: number; day: number; infamy: number; weaponTier: number; equippedWeapon: WeaponKind; horse: HorseKind;
  armor: ArmorKind; shield: ShieldKind; owned: Owned; troops: TroopRecord[]; fallen: FallenRecord[]; deserted: string[];
  nextId: number; nameCursor: number; raidsDone: number;
  location: string; pendingPath: string[]; resumeTravel: TravelResume | null; patrolPending: boolean;
  settlements: Record<string, SettlementState>; garrisons: Record<string, TroopRecord[]>;
  fortifyStepsDone: number; fortifyCarry: number; lastPatrolDay: number; unpaidDays: number; seenMapHint: boolean;
  rumorsHeard: string[]; pendingVictory: PendingVictory | null;
  steppeInfamy: number; campScattered: Record<string, number>; huntedUntil: number; lastSteppePatrolDay: number;
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
  pendingPath: string[] = [];
  resumeTravel: TravelResume | null = null;
  patrolPending = false;
  settlements: Record<string, SettlementState> = {};
  garrisons: Record<string, TroopRecord[]> = {};
  fortifyStepsDone = 0;
  fortifyCarry = 0;
  lastPatrolDay = -99;
  unpaidDays = 0;
  seenMapHint = false;
  rumorsHeard: string[] = [];
  pendingVictory: PendingVictory | null = null;
  /** the steppe keeps its own opinion of you; homeland infamy and bounty are untouched by it */
  steppeInfamy = 0;
  campScattered: Record<string, number> = {};
  huntedUntil = -1;
  lastSteppePatrolDay = -99;
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
    this.steppeInfamy = 0; this.campScattered = {}; this.huntedUntil = -1; this.lastSteppePatrolDay = -99;
    this.troops = []; this.fallen = []; this.deserted = []; this.raidsDone = 0; this.location = 'camp'; this.pendingPath = []; this.resumeTravel = null;
    this.patrolPending = false; this.settlements = {}; this.garrisons = {}; this.fortifyStepsDone = 0; this.fortifyCarry = 0; this.lastPatrolDay = -99;
    this.unpaidDays = 0; this.seenMapHint = false; this.rumorsHeard = []; this.pendingVictory = null;
    this.nextId = 1; this.nameCursor = 0; this.snapshot = null;
    for (let i = 0; i < TROOP.starting; i++) this.recruit('raider');
  }

  /** Start a brand-new warband on purpose (erases the old save). */
  newRun() {
    this.reset();
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
  get territory(): Territory { return territoryOf(this.location); }
  /** Infamy as the territory you are standing in sees it. */
  territoryInfamy(t: Territory = this.territory) { return t === 'steppe' ? this.steppeInfamy : this.infamy; }
  tierOf(value: number) { let t = 0; INFAMY.tiers.forEach((tier, i) => { if (value >= tier.min) t = i; }); return t; }
  get steppeTier() { return this.tierOf(this.steppeInfamy); }
  get hunted() { return this.day < this.huntedUntil; }

  // ------------------------------------------------------------ the ledger
  get wagesPerDay() { return this.troops.length * UPKEEP.wage; }
  get tributePerDay() {
    let t = 0;
    for (const n of NODES) {
      if (!this.settlements[n.id]?.occupied) continue;
      t += n.kind === 'town' ? TRIBUTE.town : TRIBUTE.villageBase + TRIBUTE.villagePerTier * (n.tier ?? 1);
    }
    return t;
  }
  get netPerDay() { return this.tributePerDay - this.wagesPerDay; }

  /**
   * Time passes: tribute comes in, wages go out, unraided villages fortify. If the men can't be
   * paid there is one day of grumbling, then they desert one by one. Returns what happened.
   */
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
    if (nodeById(id).kind === 'trade') return 'trade';
    const s = this.settlement(id);
    if (s.occupied) return 'occupied';
    if (s.sacked) return 'sacked';
    if (s.timesRaided > 0 || this.infamyTier >= 2) return 'closed';
    return 'visit';
  }
  /** Why the gates are shut (for the map panel). */
  closedReason(id: string) {
    const s = this.settlement(id);
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
    } else if (battle.villageId) {
      const id = battle.villageId;
      const node = nodeById(id);
      const town = node.kind === 'town';
      const vs = this.settlement(id);
      if (battle.kind === 'siege') { this.owned.halberd = true; this.equippedWeapon = 'halberd'; }
      if (choice === 'sack') {
        const extra = this.sackBonus(goldEarned, town);
        this.gold += extra;
        vs.sacked = true; vs.occupied = false;
        delete this.garrisons[id];
        this.addInfamy(town ? CONQUEST.sackTownInfamy : INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1) + CONQUEST.sackVillageInfamy);
        summary = `Sacked ${node.name}: +${goldEarned + extra} gold. It burns; nothing will ever come from it again.`;
      } else if (choice === 'occupy') {
        vs.occupied = true; vs.sacked = false;
        const garrison = this.troops.slice(0, CONQUEST.garrison);
        this.troops = this.troops.slice(garrison.length);
        this.garrisons[id] = garrison;
        this.addInfamy(INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1));
        summary = `Occupied ${node.name}: +${goldEarned} gold now, tribute every day. ${garrison.map(g => g.name).join(' and ') || 'Nobody'} stay${garrison.length === 1 ? 's' : ''} as the garrison.`;
      } else {
        vs.timesRaided += 1;
        vs.lastRaidDay = this.day;
        if (!town) vs.wealth = Math.max(RERAID.wealthMin, vs.wealth - RERAID.wealthDrop); // plundered — recovers over ~15 days
        this.addInfamy(INFAMY.perRaidBase + INFAMY.perRaidPerTier * (battle.tier ?? 1));
        summary = `Raided ${node.name}: +${goldEarned} gold. It lies ruined for ${RERAID.recoverDays} days, and poorer for longer.`;
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
      location: this.location, pendingPath: [...this.pendingPath], resumeTravel: this.resumeTravel ? { ...this.resumeTravel } : null,
      patrolPending: this.patrolPending,
      settlements: JSON.parse(JSON.stringify(this.settlements)), garrisons: JSON.parse(JSON.stringify(this.garrisons)),
      fortifyStepsDone: this.fortifyStepsDone, fortifyCarry: this.fortifyCarry, lastPatrolDay: this.lastPatrolDay,
      unpaidDays: this.unpaidDays, seenMapHint: this.seenMapHint,
      rumorsHeard: [...this.rumorsHeard], pendingVictory: this.pendingVictory ? JSON.parse(JSON.stringify(this.pendingVictory)) : null,
      steppeInfamy: this.steppeInfamy, campScattered: { ...this.campScattered }, huntedUntil: this.huntedUntil, lastSteppePatrolDay: this.lastSteppePatrolDay,
    };
  }
  fromJSON(d: SaveData) {
    this.gold = d.gold; this.day = d.day; this.infamy = d.infamy; this.weaponTier = d.weaponTier;
    this.equippedWeapon = d.equippedWeapon; this.horse = d.horse; this.armor = d.armor ?? 'none'; this.shield = d.shield ?? 'none';
    this.owned = Object.assign({ leather: false, plate: false, round: false, kite: false, bow: false, halberd: false, courser: false, destrier: false, composite: false }, d.owned);
    this.troops = d.troops.map(t => ({ ...t, kind: t.kind ?? 'raider' })); this.fallen = (d.fallen ?? []).map(f => ({ ...f })); this.deserted = [...(d.deserted ?? [])];
    this.nextId = d.nextId; this.nameCursor = d.nameCursor; this.raidsDone = d.raidsDone;
    this.location = d.location; this.pendingPath = [...(d.pendingPath ?? [])]; this.resumeTravel = d.resumeTravel ? { ...d.resumeTravel } : null;
    this.patrolPending = d.patrolPending ?? false;
    this.settlements = JSON.parse(JSON.stringify(d.settlements ?? {})); this.garrisons = JSON.parse(JSON.stringify(d.garrisons ?? {}));
    this.fortifyStepsDone = d.fortifyStepsDone ?? 0; this.fortifyCarry = d.fortifyCarry ?? 0; this.lastPatrolDay = d.lastPatrolDay ?? -99;
    this.unpaidDays = d.unpaidDays ?? 0; this.seenMapHint = d.seenMapHint ?? false;
    this.rumorsHeard = [...(d.rumorsHeard ?? [])]; this.pendingVictory = d.pendingVictory ? JSON.parse(JSON.stringify(d.pendingVictory)) : null;
    this.steppeInfamy = d.steppeInfamy ?? 0; this.campScattered = { ...(d.campScattered ?? {}) }; this.huntedUntil = d.huntedUntil ?? -1; this.lastSteppePatrolDay = d.lastSteppePatrolDay ?? -99;
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

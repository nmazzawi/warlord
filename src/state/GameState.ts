// GameState.ts — what carries over between raids: gold, weapon tier, your named troops.
// Nothing here is saved to disk yet (Milestone 2 adds save/load).
import { TROOP } from '../config/balance';
import { nextName } from '../utils/names';

export interface TroopRecord { id: number; name: string; }
export interface FallenRecord { name: string; raid: number; }

interface Snapshot { gold: number; weaponTier: number; raidNumber: number; troops: TroopRecord[]; fallen: FallenRecord[]; }

class GameStateStore {
  gold = 0;
  weaponTier = 1;          // 1..3
  raidNumber = 1;
  troops: TroopRecord[] = [];
  fallen: FallenRecord[] = [];
  private nextId = 1;
  private snapshot: Snapshot | null = null;

  constructor() { this.reset(); }

  /** Fresh run: no gold, rusty sword, three recruits. */
  reset() {
    this.gold = 0;
    this.weaponTier = 1;
    this.raidNumber = 1;
    this.troops = [];
    this.fallen = [];
    for (let i = 0; i < TROOP.starting; i++) this.recruit();
  }

  recruit(): TroopRecord {
    const t = { id: this.nextId++, name: nextName() };
    this.troops.push(t);
    return t;
  }

  /** Called when a raid starts so a defeat can be retried from the same state. */
  takeSnapshot() {
    this.snapshot = {
      gold: this.gold, weaponTier: this.weaponTier, raidNumber: this.raidNumber,
      troops: this.troops.map(t => ({ ...t })), fallen: this.fallen.map(f => ({ ...f })),
    };
  }

  restoreSnapshot() {
    if (!this.snapshot) return;
    this.gold = this.snapshot.gold;
    this.weaponTier = this.snapshot.weaponTier;
    this.raidNumber = this.snapshot.raidNumber;
    this.troops = this.snapshot.troops.map(t => ({ ...t }));
    this.fallen = this.snapshot.fallen.map(f => ({ ...f }));
  }

  /** Victory: bank the loot, bury the dead, advance to the next raid. */
  commitVictory(goldEarned: number, deadTroopIds: number[]) {
    this.gold += goldEarned;
    for (const id of deadTroopIds) {
      const t = this.troops.find(x => x.id === id);
      if (t) this.fallen.push({ name: t.name, raid: this.raidNumber });
    }
    this.troops = this.troops.filter(t => !deadTroopIds.includes(t.id));
    this.raidNumber += 1;
    this.snapshot = null;
  }
}

export const GameState = new GameStateStore();

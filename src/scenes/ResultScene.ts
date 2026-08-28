// ResultScene.ts — the overlay after a battle. Victory over a village or the town ends in a choice:
// SACK it, OCCUPY it, or (villages) just take the loot and go. Defeat offers retry / retreat.
import Phaser from 'phaser';
import { CONQUEST, INFAMY, RERAID, TRIBUTE } from '../config/balance';
import { GameState, type Conquest } from '../state/GameState';
import { nodeById } from '../world/WorldMap';
import type { BattleConfig } from '../world/Battles';
import { dprOf, FONT, makeButton, uiUnit } from './ui';

export interface ResultData {
  outcome: 'victory' | 'defeat';
  goldEarned: number;
  fallen: string[];
  deadTroopIds: number[];
  battle: BattleConfig;
}

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;
  constructor() { super('Result'); }

  init(data: ResultData) { this.result = data; }

  create() {
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  private toMap(toast?: string) { this.scene.stop('Raid'); this.scene.start('Map', toast ? { toast } : undefined); }

  private finish(choice: Conquest) {
    const d = this.result;
    const summary = GameState.commitVictory(d.goldEarned, d.deadTroopIds, { kind: d.battle.kind, villageId: d.battle.villageId, tier: d.battle.tier, name: d.battle.name }, choice);
    this.toMap(summary);
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const d = this.result;
    const win = d.outcome === 'victory';
    const patrol = d.battle.kind === 'patrol';
    const siege = d.battle.kind === 'siege';
    this.add.rectangle(0, 0, w, h, 0x000000, 0.74).setOrigin(0);
    const cx = w / 2;
    const colW = Math.min(w * 0.92, 470 * u);
    let y = h * 0.08;
    const text = (str: string, size: number, color: string) => {
      const t = this.add.text(cx, y, str, { fontFamily: FONT, fontSize: `${Math.round(size * u)}px`, color, fontStyle: 'bold',
        align: 'center', wordWrap: { width: colW } }).setOrigin(0.5, 0);
      y += t.height + 8 * u;
      return t;
    };
    text(win ? (patrol ? 'PATROL ROUTED' : siege ? 'KINGSPORT FALLS' : 'VILLAGE TAKEN') : 'YOU FELL', 34, win ? '#f5c542' : '#e0453a');
    text(d.battle.name, 13, '#d9c9a8');
    if (win) {
      text(`Loot: +${d.goldEarned} gold`, 20, '#f5c542');
      text(d.fallen.length ? `Fallen: ${d.fallen.join(', ')}  —  they will not return.` : 'No losses. The warband marches on.',
        13, d.fallen.length ? '#ff9a8a' : '#c8f0c8');
      if (siege) text('The garrison captain\'s HALBERD is yours — equipped. Switch weapons at any forge.', 13, '#9fd8ff');
      y += 6 * u;
      if (patrol) {
        text(`Infamy +${INFAMY.perPatrol}. ${GameState.infamyTierDesc}`, 12, '#e0b0b0');
        y += 10 * u;
        makeButton(this, cx, y + 28 * u, { width: Math.min(w * 0.8, 320 * u), height: 56 * u, label: 'BACK TO THE MAP', color: 0x3f7a3f, onPress: () => this.finish('leave') });
        return;
      }
      // --- the conquest choice
      const node = nodeById(d.battle.villageId ?? 'ashford');
      const town = node.kind === 'town';
      const tier = d.battle.tier ?? 1;
      const sackGold = town ? CONQUEST.sackTownGold : CONQUEST.sackVillageGold + CONQUEST.sackVillagePerTier * tier;
      const sackInf = town ? CONQUEST.sackTownInfamy : CONQUEST.sackVillageInfamy;
      const tribute = town ? TRIBUTE.town : TRIBUTE.villageBase + TRIBUTE.villagePerTier * tier;
      const raidInf = INFAMY.perRaidBase + INFAMY.perRaidPerTier * tier;
      text(`What do you do with ${node.name}?`, 15, '#fff8e7');
      const bw = colW, bh = 58 * u;
      const opt = (label: string, sub: string, color: number, enabled: boolean, onPress: () => void) => {
        makeButton(this, cx, y + bh / 2, { width: bw, height: bh, label, sub, color, enabled, fontSize: Math.round(17 * u), onPress });
        y += bh + 10 * u;
      };
      opt('SACK', `+${sackGold} gold now · burns for good · infamy +${sackInf}`, 0xa0341f, true, () => this.finish('sack'));
      opt('OCCUPY', GameState.canOccupy
        ? `+${tribute} gold every day · ${CONQUEST.garrison} troops stay as garrison · its shops open to you · infamy +${raidInf}`
        : `needs ${CONQUEST.garrison} troops to garrison (you have ${GameState.troops.length})`, 0x2f6b8a, GameState.canOccupy, () => this.finish('occupy'));
      if (!town) opt('LEAVE', `take the loot and go · ruined for ${RERAID.recoverDays} days · infamy +${raidInf}`, 0x555555, true, () => this.finish('leave'));
    } else {
      text(patrol
        ? 'The patrol ran you down. Your warband regroups as it was before the fight.'
        : 'The attack is lost. Loot from it is gone, but your warband regroups as it was before.', 13, '#d9c9a8');
      y += 10 * u;
      makeButton(this, cx, y + 28 * u, {
        width: Math.min(w * 0.8, 320 * u), height: 56 * u, label: patrol ? 'FIGHT AGAIN' : 'TRY AGAIN', color: 0xa0341f,
        onPress: () => { GameState.restoreSnapshot(); this.scene.stop('Raid'); this.scene.start('Raid', d.battle); },
      });
      y += 72 * u;
      makeButton(this, cx, y + 22 * u, {
        width: Math.min(w * 0.6, 240 * u), height: 44 * u, label: patrol ? 'Fall back the way you came' : 'Retreat to the map', color: 0x555555,
        onPress: () => {
          GameState.restoreSnapshot();
          if (patrol && GameState.resumeTravel) { GameState.location = GameState.resumeTravel.from; }
          GameState.resumeTravel = null; GameState.pendingPath = []; GameState.patrolPending = false;
          GameState.save();
          this.toMap();
        },
      });
    }
  }
}

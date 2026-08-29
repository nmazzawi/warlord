// ResultScene.ts — the overlay after a battle. Victory over a village or the town ends in a choice:
// SACK it, OCCUPY it, or just take the loot and go. Defeat offers retry / retreat.
import Phaser from 'phaser';
import { CONQUEST, INFAMY, RERAID, TRIBUTE } from '../config/balance';
import { GameState, type Conquest } from '../state/GameState';
import { nodeById } from '../world/WorldMap';
import type { BattleConfig } from '../world/Battles';
import { CSS, displayStyle, dprOf, makeButton, panel, uiStyle, uiUnit } from './ui';

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
    this.add.rectangle(0, 0, w, h, 0x000000, 0.66).setOrigin(0);
    const cx = w / 2;
    const pw = Math.min(w * 0.94, 480 * u);
    const colW = pw - 40 * u;
    // measure first, then draw the plate behind
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 0;
    const text = (str: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap = 8) => {
      const t = this.add.text(cx, y, str, { ...style, wordWrap: { width: colW }, align: 'center' }).setOrigin(0.5, 0).setDepth(2);
      items.push(t);
      y += t.height + gap * u;
      return t;
    };
    y = 24 * u;
    text(win ? (patrol ? 'PATROL ROUTED' : siege ? 'KINGSPORT FALLS' : 'VILLAGE TAKEN') : 'YOU FELL', displayStyle(30 * u, win ? CSS.emberDeep : CSS.danger, false), 2);
    text(d.battle.name, uiStyle(13 * u, CSS.inkSoft, { bold: false }), 10);
    if (win) {
      text(`Loot: +${d.goldEarned} gold`, uiStyle(20 * u, CSS.emberDeep), 6);
      text(d.fallen.length ? `Fallen: ${d.fallen.join(', ')}  —  they will not return.` : 'No losses. The warband marches on.', uiStyle(12 * u, d.fallen.length ? CSS.danger : CSS.ink, { bold: false }), 6);
      if (siege) text("The garrison captain's HALBERD is yours — equipped. Switch weapons at any forge.", uiStyle(12 * u, CSS.ink, { bold: false }), 6);
      if (patrol) {
        text(`Infamy +${INFAMY.perPatrol}. ${GameState.infamyTierDesc}`, uiStyle(11 * u, CSS.inkSoft, { bold: false }), 14);
        const b = makeButton(this, cx, y + 27 * u, { width: Math.min(colW, 320 * u), height: 54 * u, label: 'BACK TO THE MAP', tone: 'success', onPress: () => this.finish('leave') });
        items.push(b); y += 54 * u + 24 * u;
      } else {
        const node = nodeById(d.battle.villageId ?? 'ashford');
        const town = node.kind === 'town';
        const tier = d.battle.tier ?? 1;
        const sackGold = town ? CONQUEST.sackTownGold : CONQUEST.sackVillageGold + CONQUEST.sackVillagePerTier * tier;
        const raidInf = INFAMY.perRaidBase + INFAMY.perRaidPerTier * tier;
        const sackInf = town ? CONQUEST.sackTownInfamy : raidInf + CONQUEST.sackVillageInfamy;
        const tribute = town ? TRIBUTE.town : TRIBUTE.villageBase + TRIBUTE.villagePerTier * tier;
        const survivors = GameState.survivors(d.deadTroopIds).length;
        const garrison = Math.min(CONQUEST.garrison, survivors);
        text(`What do you do with ${node.name}?`, uiStyle(14 * u, CSS.ink), 10);
        const bh = 56 * u;
        const opt = (label: string, sub: string, tone: 'danger' | 'primary' | 'ghost', enabled: boolean, onPress: () => void) => {
          items.push(makeButton(this, cx, y + bh / 2, { width: colW, height: bh, label, sub, tone, enabled, fontSize: Math.round(16 * u), onPress }));
          y += bh + 9 * u;
        };
        opt('SACK', `+${sackGold} gold now · burns for good · infamy +${sackInf}`, 'danger', true, () => this.finish('sack'));
        opt('OCCUPY', survivors >= 1
          ? `+${tribute} gold/day · ${garrison} troop${garrison === 1 ? '' : 's'} stay${garrison === 1 ? 's' : ''} as garrison · its shops open to you · infamy +${raidInf}`
          : 'no one left to hold it — you need at least one troop', 'primary', survivors >= 1, () => this.finish('occupy'));
        opt('LEAVE', town ? `take the loot and go · the garrison regroups · infamy +${raidInf}` : `take the loot and go · ruined for ${RERAID.recoverDays} days · infamy +${raidInf}`, 'ghost', true, () => this.finish('leave'));
        y += 8 * u;
      }
    } else {
      text(patrol
        ? 'The patrol ran you down. Your warband regroups as it was before the fight.'
        : 'The attack is lost. Loot from it is gone, but your warband regroups as it was before.', uiStyle(12 * u, CSS.ink, { bold: false }), 14);
      items.push(makeButton(this, cx, y + 27 * u, {
        width: Math.min(colW, 320 * u), height: 54 * u, label: patrol ? 'FIGHT AGAIN' : 'TRY AGAIN', tone: 'danger',
        onPress: () => { GameState.restoreSnapshot(); this.scene.stop('Raid'); this.scene.start('Raid', d.battle); },
      }));
      y += 54 * u + 12 * u;
      items.push(makeButton(this, cx, y + 22 * u, {
        width: Math.min(colW, 260 * u), height: 44 * u, label: patrol ? 'Fall back the way you came' : 'Retreat to the map', tone: 'ghost',
        onPress: () => {
          GameState.restoreSnapshot();
          if (patrol && GameState.resumeTravel) { GameState.location = GameState.resumeTravel.from; }
          GameState.resumeTravel = null; GameState.pendingPath = []; GameState.patrolPending = false;
          GameState.save();
          this.toMap();
        },
      }));
      y += 44 * u + 24 * u;
    }
    // the plate, then shift everything so the whole thing sits centred vertically
    const ph = y;
    const py = Math.max(8 * u, (h - ph) / 2);
    panel(this, cx - pw / 2, py, pw, ph).setDepth(1);
    for (const o of items) (o as unknown as Phaser.GameObjects.Components.Transform).y += py;
    for (const o of items) if (o.type === 'Container') (o as Phaser.GameObjects.Container).setDepth(3);
  }
}

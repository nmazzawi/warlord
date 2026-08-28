// ResultScene.ts — the overlay after a raid: victory summary, or defeat with retry.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { FONT, makeButton, uiUnit } from './ui';

export interface ResultData {
  outcome: 'victory' | 'defeat';
  goldEarned: number;
  fallen: string[];
  raidNumber: number;
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

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h);
    const d = this.result;
    const win = d.outcome === 'victory';
    this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0);
    const cx = w / 2;
    let y = h * 0.14;
    const text = (str: string, size: number, color: string) => {
      const t = this.add.text(cx, y, str, { fontFamily: FONT, fontSize: `${Math.round(size * u)}px`, color, fontStyle: 'bold',
        align: 'center', wordWrap: { width: Math.min(w * 0.9, 440 * u) } }).setOrigin(0.5, 0);
      y += t.height + 10 * u;
      return t;
    };
    text(win ? 'VILLAGE RAIDED' : 'YOU FELL', 36, win ? '#f5c542' : '#e0453a');
    text(`Raid ${d.raidNumber}`, 14, '#d9c9a8');
    y += 8 * u;
    if (win) {
      text(`Gold earned: +${d.goldEarned}`, 24, '#f5c542');
      text(d.fallen.length ? `Fallen: ${d.fallen.join(', ')}  —  they will not return.` : 'No losses. The warband marches on.',
        14, d.fallen.length ? '#ff9a8a' : '#c8f0c8');
      y += 16 * u;
      makeButton(this, cx, y + 30 * u, {
        width: Math.min(w * 0.8, 320 * u), height: 60 * u, label: 'RETURN TO CAMP', color: 0x3f7a3f,
        onPress: () => { this.scene.stop('Raid'); this.scene.start('Camp'); },
      });
    } else {
      text('The raid is lost. Loot from this raid is gone, but your warband regroups as it was before.', 14, '#d9c9a8');
      y += 16 * u;
      makeButton(this, cx, y + 30 * u, {
        width: Math.min(w * 0.8, 320 * u), height: 60 * u, label: 'RETRY RAID', color: 0xa0341f,
        onPress: () => { GameState.restoreSnapshot(); this.scene.stop('Raid'); this.scene.start('Raid'); },
      });
      y += 76 * u;
      makeButton(this, cx, y + 22 * u, {
        width: Math.min(w * 0.6, 240 * u), height: 44 * u, label: 'Back to camp', color: 0x555555,
        onPress: () => { GameState.restoreSnapshot(); this.scene.stop('Raid'); this.scene.start('Camp'); },
      });
    }
  }
}

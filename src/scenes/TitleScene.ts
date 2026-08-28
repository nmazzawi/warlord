// TitleScene.ts — Continue or start a new warband.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { dprOf, FONT, makeButton, uiUnit } from './ui';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setBackgroundColor('#1a1410');
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const cx = w / 2;
    const colW = Math.min(w * 0.9, 380 * u);
    let y = h * 0.16;
    const text = (str: string, size: number, color: string) => {
      const t = this.add.text(cx, y, str, { fontFamily: FONT, fontSize: `${Math.round(size * u)}px`, color, fontStyle: 'bold', align: 'center', wordWrap: { width: colW } }).setOrigin(0.5, 0);
      y += t.height + 8 * u;
      return t;
    };
    text('WARLORD', 46, '#f5c542');
    text('Rise from lone bandit to world conqueror.', 14, '#d9c9a8');
    y += 24 * u;
    const hasSave = GameState.hasSave();
    if (hasSave) {
      makeButton(this, cx, y + 32 * u, {
        width: colW, height: 64 * u, label: 'CONTINUE', sub: 'pick up where you left off', color: 0x3f7a3f, fontSize: Math.round(24 * u),
        onPress: () => { if (GameState.load()) this.scene.start('Map'); },
      });
      y += 64 * u + 16 * u;
    }
    makeButton(this, cx, y + 28 * u, {
      width: colW, height: 56 * u, label: 'NEW WARBAND', sub: hasSave ? 'erases the current save' : 'start from nothing', color: hasSave ? 0x8a5a2b : 0xa0341f,
      fontSize: Math.round(20 * u),
      onPress: () => { GameState.newRun(); this.scene.start('Settlement', { id: 'camp' }); },
    });
    y += 56 * u + 30 * u;
    text('In battle: drag anywhere / WASD to move  ·  Q = War Horn  ·  E = Charge\nYou attack automatically. Fight in the alleys, not in the open.', 11, '#a89a80');
  }
}

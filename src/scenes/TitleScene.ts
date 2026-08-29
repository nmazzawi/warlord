// TitleScene.ts — Continue or start a new warband.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { CSS, displayStyle, dprOf, ironBackdrop, makeButton, panel, uiStyle, uiUnit } from './ui';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    ironBackdrop(this, w, h);
    const cx = w / 2;
    const pw = Math.min(w * 0.9, 400 * u);
    const hasSave = GameState.hasSave();
    const ph = (hasSave ? 330 : 260) * u;
    const py = Math.max(20 * u, h * 0.5 - ph / 2 - 20 * u);
    panel(this, cx - pw / 2, py, pw, ph);
    let y = py + 26 * u;
    const title = this.add.text(cx, y, 'WARLORD', displayStyle(44 * u, CSS.emberDeep, false)).setOrigin(0.5, 0);
    y += title.height + 2 * u;
    const sub = this.add.text(cx, y, 'Rise from lone bandit to world conqueror.', uiStyle(13 * u, CSS.inkSoft, { bold: false, wrap: pw - 40 * u })).setOrigin(0.5, 0);
    y += sub.height + 22 * u;
    const bw = pw - 48 * u;
    if (hasSave) {
      makeButton(this, cx, y + 30 * u, {
        width: bw, height: 60 * u, label: 'CONTINUE', sub: 'pick up where you left off', tone: 'success', fontSize: Math.round(22 * u),
        onPress: () => { if (GameState.load()) this.scene.start('Map'); },
      });
      y += 60 * u + 14 * u;
    }
    makeButton(this, cx, y + 27 * u, {
      width: bw, height: 54 * u, label: 'NEW WARBAND', sub: hasSave ? 'erases the current save' : 'start from nothing', tone: hasSave ? 'neutral' : 'primary',
      fontSize: Math.round(19 * u),
      onPress: () => { GameState.newRun(); this.scene.start('Settlement', { id: 'camp' }); },
    });
    this.add.text(cx, py + ph + 18 * u, 'In battle: drag anywhere / WASD to move  ·  Q War Horn  ·  E Charge\nYou attack automatically. Fight in the alleys, not in the open.',
      uiStyle(11 * u, CSS.muted, { bold: false, wrap: w * 0.9 })).setOrigin(0.5, 0);
  }
}

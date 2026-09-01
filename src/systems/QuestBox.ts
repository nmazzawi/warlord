// QuestBox.ts — the jobs you are carrying, in the corner under the ledger. Collapsed it is one line
// you can ignore; opened it is the whole list, and every row is a button: tap once to be shown where
// the work is, tap again to be offered the march to it. It has to stay small, because on a phone the
// corner it lives in is also the map.
import Phaser from 'phaser';
import { GameState, type Quest } from '../state/GameState';
import { CSS, FONT, PAL } from '../scenes/ui';

export interface QuestBoxHandlers {
  /** Show me where this is: pan, zoom, pulse the marker. */
  onFind(q: Quest): void;
  /** Plot the march there, with the usual preview and day cost to confirm. */
  onRoute(q: Quest): void;
}

interface Row { bg: Phaser.GameObjects.Rectangle; title: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; quest: Quest; }

export class QuestBox {
  private plate: Phaser.GameObjects.Rectangle;
  private edge: Phaser.GameObjects.Rectangle;
  private header: Phaser.GameObjects.Text;
  private chevron: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Rectangle;
  private rows: Row[] = [];
  private open = false;
  /** The one the player has tapped once: the second tap on it offers the road. */
  private armed: number | null = null;
  private u = 1;
  private x = 0; private y = 0; private wMax = 240;

  /** Called when the box grows or shrinks, so whatever sits under it can move. */
  onResize?: () => void;

  constructor(private scene: Phaser.Scene, private handlers: QuestBoxHandlers, private depth = 26) {
    this.plate = scene.add.rectangle(0, 0, 10, 10, PAL.iron, 0.9).setOrigin(0).setDepth(depth);
    this.edge = scene.add.rectangle(0, 0, 10, 2, PAL.gold, 0.55).setOrigin(0).setDepth(depth + 1);
    this.header = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: CSS.goldHi, fontStyle: 'bold' }).setDepth(depth + 2);
    this.chevron = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: CSS.steel, fontStyle: 'bold' }).setDepth(depth + 2);
    this.hit = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.001).setOrigin(0).setDepth(depth + 3).setInteractive({ useHandCursor: true });
    this.hit.on('pointerup', () => { this.open = !this.open; this.armed = null; this.refresh(); this.onResize?.(); });
  }

  /** Where the box hangs and how big a unit is. Called from the HUD's own layout. */
  place(x: number, y: number, u: number, maxWidth: number) {
    this.x = x; this.y = y; this.u = u; this.wMax = maxWidth;
    this.refresh();
  }

  /** True while the box is covering this point, so the map does not take the same tap as a march. */
  contains(px: number, py: number) {
    if (!this.plate.visible) return false;
    return px >= this.plate.x && px <= this.plate.x + this.plate.width
      && py >= this.plate.y && py <= this.plate.y + this.plate.height;
  }

  get height() { return this.plate.visible ? this.plate.height : 0; }

  refresh() {
    const u = this.u;
    const qs = GameState.quests;
    for (const r of this.rows) { r.bg.destroy(); r.title.destroy(); r.sub.destroy(); }
    this.rows = [];
    if (!qs.length) {
      for (const o of [this.plate, this.edge, this.header, this.chevron, this.hit]) o.setVisible(false);
      return;
    }
    for (const o of [this.plate, this.edge, this.header, this.chevron, this.hit]) o.setVisible(true);
    const w = Math.min(this.wMax, 250 * u);
    const padX = 8 * u, headH = 20 * u;
    this.header.setPosition(this.x + padX, this.y + 5 * u).setFontSize(Math.round(11 * u))
      .setText(`Quests · ${qs.length}`);
    this.chevron.setPosition(this.x + w - padX - 8 * u, this.y + 5 * u).setFontSize(Math.round(11 * u))
      .setText(this.open ? '▾' : '▸');
    let y = this.y + headH;
    if (this.open) {
      for (const q of qs) {
        const rowH = 30 * u;
        const bg = this.scene.add.rectangle(this.x + 3 * u, y, w - 6 * u, rowH - 2 * u,
          this.armed === q.id ? PAL.goldDeep : PAL.ironEdge, this.armed === q.id ? 0.55 : 0.5)
          .setOrigin(0).setDepth(this.depth + 1).setInteractive({ useHandCursor: true });
        const title = this.scene.add.text(this.x + padX, y + 3 * u, this.titleOf(q),
          { fontFamily: FONT, fontSize: `${Math.round(10 * u)}px`, color: CSS.cream, fontStyle: 'bold' }).setDepth(this.depth + 2);
        const sub = this.scene.add.text(this.x + padX, y + 15 * u, this.subOf(q),
          { fontFamily: FONT, fontSize: `${Math.round(9 * u)}px`, color: this.armed === q.id ? CSS.goldHi : CSS.steel }).setDepth(this.depth + 2);
        title.setCrop(0, 0, w - padX * 2, 20 * u);
        sub.setCrop(0, 0, w - padX * 2, 20 * u);
        // one tap shows you where it is; the second offers the road, so nothing marches by accident
        bg.on('pointerup', () => {
          if (this.armed === q.id) { this.handlers.onRoute(q); this.armed = null; }
          else { this.armed = q.id; this.handlers.onFind(q); }
          this.refresh();
        });
        this.rows.push({ bg, title, sub, quest: q });
        y += rowH;
      }
    }
    const h = (this.open ? y - this.y : headH) + 4 * u;
    this.plate.setPosition(this.x, this.y).setSize(w, h);
    this.edge.setPosition(this.x, this.y + h - 2).setSize(w, 2);
    this.hit.setPosition(this.x, this.y).setSize(w, headH);
  }

  private titleOf(q: Quest) {
    if (q.kind === 'hunt') return 'Hunt their patrol';
    const to = q.text.match(/ to (.+)$/);
    return to ? `Deliver to ${to[1]}` : 'Delivery';
  }

  private subOf(q: Quest) {
    const bits: string[] = [];
    if (q.kind === 'deliver') bits.push(q.days ? `${q.days}d out` : 'on the road');
    else bits.push('on their next party');
    bits.push(`${q.reward}g`);
    if (q.by != null) {
      const left = q.by - GameState.day;
      bits.push(left > 0 ? `${left}d left` : 'overdue');
    }
    return bits.join(' · ');
  }

  destroy() {
    for (const r of this.rows) { r.bg.destroy(); r.title.destroy(); r.sub.destroy(); }
    for (const o of [this.plate, this.edge, this.header, this.chevron, this.hit]) o.destroy();
  }
}

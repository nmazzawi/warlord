// SettlementScene.ts — a settlement as one illustrated screen: tap a building (Forge, Barracks,
// Stables, Inn) and its panel pops up. Your own places sell freely; an unconquered place you VISIT
// sells less at a markup, won't recruit for you, and its inn sells a rumor. No walking here.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { mulberry32 } from '../utils/rng';
import { nodeById } from '../world/WorldMap';
import { stockFor } from '../world/Stock';
import { nextRumor } from '../world/Rumors';
import { CSS, displayStyle, dprOf, drawPanel, makeButton, PAL, uiStyle, uiUnit } from './ui';

export type BuildingId = 'forge' | 'barracks' | 'stables' | 'inn';
interface Card { id: BuildingId; label: string; tex: string; sub: string; locked?: string; }

export class SettlementScene extends Phaser.Scene {
  private id = 'camp';
  private visiting = false;
  constructor() { super('Settlement'); }

  init(data: { id?: string; visit?: boolean }) {
    this.id = data?.id ?? 'camp';
    this.visiting = !!data?.visit;
  }

  create() {
    this.build();
    this.scale.on('resize', this.build, this);
    this.input.keyboard?.on('keydown-M', () => this.leave());
    this.input.keyboard?.on('keydown-ESC', () => this.leave());
    this.events.once('shutdown', () => { this.scale.off('resize', this.build, this); this.scene.stop('Shop'); });
  }

  private leave() {
    GameState.save();
    this.scene.start('Map');
  }

  private open(building: BuildingId) {
    Sound.door();
    this.scene.launch('Shop', {
      settlementId: this.id, building, visiting: this.visiting,
      onClose: () => { this.scene.stop('Shop'); this.scene.resume(); this.build(); },
    });
    this.scene.pause();
  }

  /** Bakes a backdrop per settlement kind: camp, village, or town. */
  private backdrop(kind: 'camp' | 'village' | 'town', w: number, h: number) {
    const key = `settlement_bg_${kind}_${w}x${h}`;
    if (this.textures.exists(key)) return key;
    const rnd = mulberry32(kind === 'camp' ? 7 : kind === 'village' ? 8 : 9);
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const base = kind === 'town' ? 0x45464c : PAL.earth;
    g.fillStyle(base, 1).fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 60;
      g.fillStyle(kind === 'town' ? (rnd() > 0.5 ? 0x3c3d43 : 0x53545c) : (rnd() > 0.5 ? PAL.earthDeep : PAL.earthHi), 0.45).fillCircle(x, y, r);
    }
    if (kind === 'town') {
      g.fillStyle(PAL.steel, 1).fillRect(0, h * 0.24, w, 22);
      g.fillStyle(0x9a9ca6, 1);
      for (let x = 0; x < w; x += 40) g.fillRect(x, h * 0.24 - 10, 20, 12);
    } else {
      g.fillStyle(PAL.dirt, 1).fillEllipse(w / 2, h * 0.64, w * 0.9, h * 0.5);
      g.fillStyle(PAL.dirtDeep, 0.5);
      for (let i = 0; i < 40; i++) g.fillCircle(w / 2 + (rnd() - 0.5) * w * 0.8, h * 0.64 + (rnd() - 0.5) * h * 0.4, 1.5 + rnd() * 2);
    }
    g.fillStyle(0x000000, 0.35).fillRect(0, 0, w, h * 0.16);
    g.generateTexture(key, w, h);
    g.destroy();
    return key;
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const isCamp = this.id === 'camp';
    const node = isCamp ? null : nodeById(this.id);
    const kind: 'camp' | 'village' | 'town' = isCamp ? 'camp' : node!.kind === 'town' ? 'town' : 'village';
    this.add.image(0, 0, this.backdrop(kind, Math.ceil(w), Math.ceil(h))).setOrigin(0);

    // title block
    const name = isCamp ? 'BANDIT CAMP' : node!.name.toUpperCase();
    const garrison = (GameState.garrisons[this.id] ?? []).map(t => t.name).join(', ');
    const tribute = isCamp ? 0 : node!.kind === 'town' ? 15 : 4 + (node!.tier ?? 1);
    const sub = isCamp ? 'Home. Your forge, barracks and stables.'
      : this.visiting ? 'Visiting as a customer  ·  prices +50%  ·  the locals watch you'
      : `Occupied  ·  tribute +${tribute}/day  ·  garrison: ${garrison || 'none'}`;
    this.add.text(w / 2, 12 * u, name, displayStyle(28 * u, CSS.goldHi)).setOrigin(0.5, 0);
    this.add.text(w / 2, 48 * u, sub, uiStyle(12 * u, CSS.cream, { bold: false, stroke: true, wrap: w * 0.9 })).setOrigin(0.5, 0);
    this.add.text(w / 2, 70 * u, `${GameState.dateLabel}   ·   ⬤ ${GameState.gold} gold   ·   troops ${GameState.troops.length}`, uiStyle(12 * u, CSS.gold, { stroke: true })).setOrigin(0.5, 0);

    // the buildings: big tap targets, a row (landscape) or a column (portrait)
    const stock = stockFor(this.id, this.visiting);
    const cards: Card[] = [
      { id: 'forge', label: 'FORGE', tex: TEX.forge, sub: `${stock.forge.swordMaxTier > 1 ? `swords to tier ${stock.forge.swordMaxTier}` : 'no swords'}${stock.forge.items.includes('plate') ? ', plate' : stock.forge.items.includes('leather') ? ', armor' : ''}${stock.forge.items.includes('bow') ? ', bow' : ''}${this.visiting ? ' · +50%' : ''}` },
    ];
    if (stock.barracks) cards.push({ id: 'barracks', label: 'BARRACKS', tex: TEX.barracks, sub: stock.barracks.kind === 'guard' ? 'recruit town guards' : stock.barracks.kind === 'levy' ? 'recruit levies' : 'recruit raiders' });
    else if (!isCamp) cards.push({ id: 'barracks', label: 'BARRACKS', tex: TEX.barracks, sub: '', locked: "the locals won't fight for you" });
    if (stock.stables.length) cards.push({ id: 'stables', label: 'STABLES', tex: TEX.stables, sub: stock.stables.join(', ') + (this.visiting ? ' · +50%' : '') });
    if (stock.inn) cards.push({ id: 'inn', label: 'INN', tex: TEX.inn, sub: nextRumor(this.id) ? 'buy a rumor — news of the world' : 'you have heard all they know' });
    const portrait = h > w * 1.1;
    const n = cards.length;
    const cw = Math.min(portrait ? w * 0.88 : (w - 40 * u) / n - 14 * u, 300 * u);
    const ch = portrait ? Math.min(140 * u, (h - 200 * u - 90 * u) / n - 10 * u) : Math.min(230 * u, h - 200 * u);
    const top = 100 * u;
    cards.forEach((card, i) => {
      const x = portrait ? w / 2 : w / 2 + (i - (n - 1) / 2) * (cw + 14 * u);
      const y = portrait ? top + i * (ch + 10 * u) + ch / 2 : top + ch / 2;
      this.card(x, y, cw, ch, card, u, portrait);
    });

    // bottom row: leave (and at home, wait a day)
    const by = h - 38 * u;
    const bw = Math.min(w * 0.42, 220 * u);
    makeButton(this, isCamp ? w / 2 - bw / 2 - 8 * u : w / 2, by, { width: bw, height: 48 * u, label: 'TO THE MAP', tone: 'neutral', fontSize: Math.round(15 * u), onPress: () => this.leave() });
    if (isCamp) {
      makeButton(this, w / 2 + bw / 2 + 8 * u, by, { width: bw, height: 48 * u, label: 'WAIT A DAY', sub: `wages ${GameState.wagesPerDay}, tribute +${GameState.tributePerDay}`, tone: 'ghost', fontSize: Math.round(13 * u),
        onPress: () => {
          const events = GameState.advanceDays(1);
          GameState.save();
          Sound.click();
          this.build();
          if (events.length) this.time.delayedCall(50, () => this.toast(events.map(e => e.text)));
        } });
    }
  }

  private toast(lines: string[]) {
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const t = this.add.text(w / 2, h * 0.5, lines.join('\n'), uiStyle(14 * u, CSS.dangerHi, { stroke: true, wrap: w * 0.9 })).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 600, onComplete: () => t.destroy() });
  }

  /** One tappable building card — a parchment plate with a vignette. */
  private card(x: number, y: number, cw: number, ch: number, card: Card, u: number, portrait: boolean) {
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    drawPanel(bg, -cw / 2, -ch / 2, cw, ch, { radius: 12 });
    const img = this.add.image(portrait ? -cw / 2 + 24 * u + 56 * u : 0, portrait ? 0 : -ch * 0.14, card.tex);
    const fit = Math.min((portrait ? 112 * u : cw - 36 * u) / img.width, (portrait ? ch - 28 * u : ch * 0.48) / img.height);
    img.setScale(fit);
    if (card.locked) img.setTint(0x777777);
    const lx = portrait ? -cw / 2 + 150 * u : 0, ly = portrait ? -12 * u : ch * 0.2;
    const label = this.add.text(lx, ly, card.label, displayStyle(18 * u, card.locked ? CSS.inkSoft : CSS.ink, false)).setOrigin(portrait ? 0 : 0.5, 0.5);
    const subText = card.locked ? `locked — ${card.locked}` : card.sub;
    const sub = this.add.text(lx, ly + 20 * u, subText, uiStyle(10.5 * u, card.locked ? CSS.danger : CSS.inkSoft, { bold: false, wrap: portrait ? cw - 165 * u : cw - 24 * u, align: portrait ? 'left' : 'center' })).setOrigin(portrait ? 0 : 0.5, 0);
    c.add([bg, img, label, sub]);
    // vignette life: smoke over the forge, a flicker in the inn window
    if (card.id === 'forge') {
      for (let i = 0; i < 3; i++) {
        const puff = this.add.circle(img.x + 36 * fit, img.y - 50 * fit, 6 * fit + i * 2, 0xd9d3c5, 0.35);
        c.add(puff);
        this.tweens.add({ targets: puff, y: puff.y - 60 * fit, x: puff.x + 14 * fit, alpha: 0, scale: 2.2, duration: 2600, delay: i * 800, repeat: -1, ease: 'Sine.Out' });
      }
      const glow = this.add.circle(img.x + 2 * fit, img.y + 32 * fit, 30 * fit, PAL.ember, 0.18);
      c.add(glow);
      this.tweens.add({ targets: glow, alpha: 0.06, scale: 1.2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    if (card.locked) { c.setAlpha(0.8); return c; }
    c.setSize(cw, ch);
    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, cw, ch), Phaser.Geom.Rectangle.Contains);
    let armed = -1;
    c.on('pointerdown', (p: Phaser.Input.Pointer) => { armed = p.id; c.setScale(0.96); });
    c.on('pointerup', (p: Phaser.Input.Pointer) => { c.setScale(1); if (armed === p.id) { armed = -1; this.open(card.id); } });
    c.on('pointerout', () => { c.setScale(1); armed = -1; });
    return c;
  }
}

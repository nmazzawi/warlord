// SettlementScene.ts — a settlement you control, as one illustrated screen: tap a building (Forge,
// Barracks, Stables) and its shop pops up. No walking here — steering is for battles only.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { mulberry32 } from '../utils/rng';
import { nodeById } from '../world/WorldMap';
import { stockFor } from '../world/Stock';
import { dprOf, FONT, makeButton, uiUnit } from './ui';

export type BuildingId = 'forge' | 'barracks' | 'stables';

export class SettlementScene extends Phaser.Scene {
  private id = 'camp';
  constructor() { super('Settlement'); }

  init(data: { id?: string }) { this.id = data?.id ?? 'camp'; }

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
      settlementId: this.id, building,
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
    const base = kind === 'town' ? 0x4a4a50 : 0x4f5e36;
    g.fillStyle(base, 1).fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 60;
      g.fillStyle(kind === 'town' ? (rnd() > 0.5 ? 0x3f3f45 : 0x585860) : (rnd() > 0.5 ? 0x46552f : 0x5b6b42), 0.45).fillCircle(x, y, r);
    }
    if (kind === 'town') {
      g.fillStyle(0x7d7f88, 1).fillRect(0, h * 0.22, w, 26);
      g.fillStyle(0x9a9ca6, 1);
      for (let x = 0; x < w; x += 40) g.fillRect(x, h * 0.22 - 10, 20, 12);
    } else {
      g.fillStyle(0x8a7048, 1).fillEllipse(w / 2, h * 0.62, w * 0.9, h * 0.5);
    }
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

    // title
    const name = isCamp ? 'BANDIT CAMP' : node!.name.toUpperCase();
    const st = isCamp ? null : GameState.settlement(this.id);
    const garrison = (GameState.garrisons[this.id] ?? []).map(t => t.name).join(', ');
    const sub = isCamp ? 'Home. Your forge, barracks and stables.'
      : `Occupied${st?.occupied ? '' : ' (?)'}  ·  tribute +${GameState.tributePerDay ? (node!.kind === 'town' ? 15 : 4 + (node!.tier ?? 1)) : 0}/day  ·  garrison: ${garrison || 'none'}`;
    this.add.text(w / 2, 14 * u, name, { fontFamily: FONT, fontSize: `${Math.round(26 * u)}px`, color: '#f5c542', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 0);
    this.add.text(w / 2, 48 * u, sub, { fontFamily: FONT, fontSize: `${Math.round(12 * u)}px`, color: '#e8dcc0', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: w * 0.9 } }).setOrigin(0.5, 0);
    this.add.text(w / 2, 72 * u, `${GameState.dateLabel}   ·   ⬤ ${GameState.gold} gold   ·   troops ${GameState.troops.length}`, { fontFamily: FONT, fontSize: `${Math.round(12 * u)}px`, color: '#f5c542', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0);

    // the buildings: big tap targets, laid out in a row (landscape) or a column (portrait)
    const stock = stockFor(this.id);
    const cards: Array<{ id: BuildingId; label: string; tex: string; sub: string }> = [
      { id: 'forge', label: 'FORGE', tex: TEX.forge, sub: `swords to tier ${stock.forge.swordMaxTier}${stock.forge.items.includes('plate') ? ', plate' : stock.forge.items.includes('leather') ? ', armor' : ''}${stock.forge.items.includes('bow') ? ', bow' : ''}` },
    ];
    if (stock.barracks) cards.push({ id: 'barracks', label: 'BARRACKS', tex: TEX.barracks, sub: stock.barracks.kind === 'guard' ? 'recruit town guards' : stock.barracks.kind === 'levy' ? 'recruit levies' : 'recruit raiders' });
    if (stock.stables.length) cards.push({ id: 'stables', label: 'STABLES', tex: TEX.stables, sub: stock.stables.map(s => s === 'courser' ? 'courser' : 'destrier').join(', ') });
    const portrait = h > w * 1.1;
    const cw = Math.min(portrait ? w * 0.86 : (w - 40 * u) / 3 - 16 * u, 300 * u);
    const ch = portrait ? Math.min(150 * u, (h - 200 * u - 90 * u) / cards.length - 12 * u) : Math.min(230 * u, h - 200 * u);
    const top = 104 * u;
    cards.forEach((card, i) => {
      const x = portrait ? w / 2 : w / 2 + (i - (cards.length - 1) / 2) * (cw + 16 * u);
      const y = portrait ? top + i * (ch + 12 * u) + ch / 2 : top + ch / 2;
      this.card(x, y, cw, ch, card, u, portrait);
    });

    // bottom row: leave (and at home, wait a day)
    const by = h - 40 * u;
    const bw = Math.min(w * 0.42, 220 * u);
    makeButton(this, isCamp ? w / 2 - bw / 2 - 8 * u : w / 2, by, { width: bw, height: 50 * u, label: 'TO THE MAP', color: 0x2f6b8a, fontSize: Math.round(15 * u), onPress: () => this.leave() });
    if (isCamp) {
      makeButton(this, w / 2 + bw / 2 + 8 * u, by, { width: bw, height: 50 * u, label: 'WAIT A DAY', sub: `wages ${GameState.wagesPerDay}, tribute +${GameState.tributePerDay}`, color: 0x555555, fontSize: Math.round(13 * u),
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
    const t = this.add.text(w / 2, h * 0.5, lines.join('\n'), { fontFamily: FONT, fontSize: `${Math.round(14 * u)}px`, color: '#ffb0a0', stroke: '#000', strokeThickness: 5, align: 'center', fontStyle: 'bold', wordWrap: { width: w * 0.9 } }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 600, onComplete: () => t.destroy() });
  }

  /** One tappable building card. */
  private card(x: number, y: number, cw: number, ch: number, card: { id: BuildingId; label: string; tex: string; sub: string }, u: number, portrait: boolean) {
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 4, cw, ch, 14);
    bg.fillStyle(0x2a2118, 0.92).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 14);
    bg.lineStyle(3, 0xf5deb3, 0.9).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 14);
    const img = this.add.image(portrait ? -cw / 2 + 24 * u + 60 * u : 0, portrait ? 0 : -ch * 0.12, card.tex);
    const fit = Math.min((portrait ? 120 * u : cw - 30 * u) / img.width, (portrait ? ch - 24 * u : ch * 0.5) / img.height);
    img.setScale(fit);
    const lx = portrait ? -cw / 2 + 160 * u : 0, ly = portrait ? -12 * u : ch * 0.22;
    const label = this.add.text(lx, ly, card.label, { fontFamily: FONT, fontSize: `${Math.round(20 * u)}px`, color: '#fff8e7', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(portrait ? 0 : 0.5, 0.5);
    const sub = this.add.text(lx, ly + 22 * u, card.sub, { fontFamily: FONT, fontSize: `${Math.round(11 * u)}px`, color: '#ffe9a8', wordWrap: { width: portrait ? cw - 175 * u : cw - 20 * u }, align: portrait ? 'left' : 'center' }).setOrigin(portrait ? 0 : 0.5, 0);
    c.add([bg, img, label, sub]);
    c.setSize(cw, ch);
    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, cw, ch), Phaser.Geom.Rectangle.Contains);
    let armed = -1;
    c.on('pointerdown', (p: Phaser.Input.Pointer) => { armed = p.id; c.setScale(0.96); });
    c.on('pointerup', (p: Phaser.Input.Pointer) => { c.setScale(1); if (armed === p.id) { armed = -1; this.open(card.id); } });
    c.on('pointerout', () => { c.setScale(1); armed = -1; });
    return c;
  }
}

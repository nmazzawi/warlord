// SettlementScene.ts — a settlement as one illustrated screen: tap a building (Forge, Barracks,
// Stables, Inn) and its panel pops up. Your own places sell freely; an unconquered place you VISIT
// sells less at a markup, won't recruit for you, and its inn sells a rumor. No walking here.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { nodeById } from '../world/WorldMap';
import { visitOf } from '../world/Realms';
import { unitDef } from '../world/Units';
import { FOREIGN } from '../config/balance';
import { stockFor } from '../world/Stock';
import { nextRumor } from '../world/Rumors';
import { CSS, displayStyle, dprOf, makeButton, uiStyle, uiUnit } from './ui';
import { archOf, type ArchSet } from '../systems/Architecture';
import { landmark, townScene } from '../systems/Town';
import { isCoastal } from '../world/Coast';

export type BuildingId = 'forge' | 'barracks' | 'stables' | 'inn' | 'market' | 'harbor';
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


  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const isCamp = this.id === 'camp';
    const node = isCamp ? null : nodeById(this.id);
    const trade = node?.kind === 'trade';
    // a city you TOOK is not a place you are a foreigner in any more — it is a possession
    const foreign = node?.kind === 'foreign' && this.visiting ? visitOf(node.territory) : null;

    // title block
    const name = isCamp ? 'BANDIT CAMP' : node!.name.toUpperCase();
    const garrison = (GameState.garrisons[this.id] ?? []).map(t => t.name).join(', ');
    const tribute = isCamp ? 0 : node!.kind === 'foreign' ? FOREIGN.tribute[node!.rank ?? 'town']
      : node!.kind === 'town' ? 15 : 4 + (node!.tier ?? 1);
    const stock = stockFor(this.id, this.visiting);
    const up = `+${Math.round((stock.markup - 1) * 100)}%`;
    const sub = isCamp ? 'Home. Your forge, barracks and stables.'
      : trade ? "Neutral ground. Khoja trades with anyone — steppe riders for hire, and the composite bow."
      : foreign ? `A foreigner here  ·  stranger's prices ${up}  ·  every eye in the street on you`
      : this.visiting ? `Visiting as a customer  ·  prices ${up}  ·  the locals watch you`
      : `Occupied  ·  tribute +${tribute}/day  ·  garrison: ${garrison || 'none'}`;
    this.add.text(w / 2, 12 * u, name, displayStyle(28 * u, CSS.goldHi)).setOrigin(0.5, 0);
    // the foreigner's line is long and wraps on a phone, so everything under it is placed from its
    // real height rather than from a number that assumed one line
    const subT = this.add.text(w / 2, 48 * u, sub, uiStyle(12 * u, CSS.cream, { bold: false, stroke: true, wrap: w * 0.9 })).setOrigin(0.5, 0);
    this.add.text(w / 2, subT.y + subT.height + 4 * u, `${GameState.dateLabel}   ·   ⬤ ${GameState.gold} gold   ·   troops ${GameState.troops.length}`, uiStyle(12 * u, CSS.gold, { stroke: true })).setOrigin(0.5, 0);

    // the buildings: big tap targets, a row (landscape) or a column (portrait)
    const cards: Card[] = [
      { id: 'forge', label: 'FORGE', tex: TEX.forge, sub: `${stock.forge.swordMaxTier > 1 ? `swords to tier ${stock.forge.swordMaxTier}` : 'no swords'}${stock.forge.items.includes('plate') ? ', plate' : stock.forge.items.includes('leather') ? ', armor' : ''}${stock.forge.items.includes('bow') ? ', bow' : ''}${stock.forge.items.includes('composite') ? ', composite bow' : ''}${this.visiting ? ` · ${up}` : ''}` },
    ];
    if (stock.barracks) cards.push({ id: 'barracks', label: 'BARRACKS', tex: TEX.barracks,
      sub: stock.barracks.kinds.length > 1 ? `${stock.barracks.kinds.length} kinds for hire` : `hire ${unitDef(stock.barracks.kinds[0]).label.toLowerCase()}s` });
    else if (!isCamp) cards.push({ id: 'barracks', label: 'BARRACKS', tex: TEX.barracks, sub: '', locked: foreign ? foreign.barracksLocked : "the locals won't fight for you" });
    if (stock.stables.length) cards.push({ id: 'stables', label: 'STABLES', tex: TEX.stables, sub: stock.stables.join(', ') + (this.visiting ? ` · ${up}` : '') });
    // the card's name stays one short word — a foreign inn's real name is long, and belongs on the
    // line underneath where there is room for it
    // a market stands in every settlement that trades at all: it buys what you stripped off the dead,
    // and its notice board has work on it
    if (stock.inn || isCamp) {
      const jobs = GameState.quests.length;
      // if what you are carrying is FOR here, the market card says so before you have to look
      const due = GameState.quests.filter(q => q.kind === 'deliver' && q.to === this.id).length;
      if (due) {
        cards.push({ id: 'market', label: 'MARKET', tex: TEX.inn,
          sub: `Quest: deliver here (${due} to hand over) · notice board` });
      } else
      cards.push({ id: 'market', label: 'MARKET', tex: TEX.inn,
        sub: GameState.loot.length ? `sell ${GameState.loot.length} piece${GameState.loot.length === 1 ? '' : 's'} · notice board${jobs ? ` (${jobs} taken)` : ''}`
          : `nothing to sell yet · notice board${jobs ? ` (${jobs} taken)` : ''}` });
    }
    if (isCoastal(this.id)) cards.push({ id: 'harbor', label: 'HARBOR', tex: TEX.inn, sub: 'boats, and nobody sailing them for you' });
    if (stock.inn) cards.push({ id: 'inn', label: 'INN', tex: TEX.inn,
      sub: nextRumor(this.id)
        ? (foreign ? `${foreign.inn.name} — buy a rumor of their own land` : 'buy a rumor — news of the world')
        : (foreign ? `${foreign.inn.name} — you have heard it all` : 'you have heard all they know') });
    // --- the town, from the hillside above it. The ground, the water, the paths and every roof too
    //     small to walk into are one baked picture; the buildings you can enter stand on top of it.
    const set = archOf(isCamp ? GameState.home : node!.territory);
    const rank = isCamp ? 'camp' : node!.rank ?? (node!.kind === 'town' ? 'city' : 'village');
    const grand = rank === 'capital' ? 1 : rank === 'city' ? 0.7 : rank === 'town' ? 0.45 : 0.2;
    const coastal = !isCamp && isCoastal(this.id);
    const n = cards.length;
    const scene = townScene(this, set, `${this.id}_${rank}`, Math.ceil(w), Math.ceil(h), grand, coastal, n);
    this.add.image(0, 0, scene.key).setOrigin(0).setDepth(-10);

    const plotW = Math.min((w * 1.5) / Math.max(n, 1), 170 * u);
    const plotH = Math.min(h * 0.26, plotW * 1.0);
    cards.forEach((card, i) => {
      const q = scene.plots[i] ?? { x: w / 2, y: h * 0.74, scale: 1 };
      // a building up the slope wears its name ABOVE it; the near rank wears it below. Otherwise a
      // far building's plate lies across the near building's roof and steals its taps.
      this.plot(q.x, q.y, plotW * q.scale, plotH * q.scale, card, set, u, i, q.scale < 0.95);
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

  /**
   * One building on the street: the mass, its name over the door, and what it is selling today. A
   * locked door still stands there — you can see the barracks and read why it will not open.
   */
  private plot(x: number, groundY: number, w: number, h: number, card: Card, set: ArchSet, u: number, seed: number, above = false) {
    const img = this.add.image(x, groundY, landmark(this, set, card.id, w, h, seed + 1)).setOrigin(0.5, 1);
    img.setDepth(Math.round(groundY));   // nearer buildings stand in front of further ones
    if (card.locked) img.setTint(0x8a8a8a).setAlpha(0.85);
    // a dark plate under the name so it reads off grass, sand or snow alike
    const plate = this.add.graphics().setDepth(Math.round(groundY) + 1);
    const label = this.add.text(x, 0, card.label,
      displayStyle(Math.round(Math.min(18, w * 0.12)), card.locked ? CSS.muted : CSS.goldHi)).setOrigin(0.5, 0);
    const sub = this.add.text(x, 0, card.locked ? `locked — ${card.locked}` : card.sub,
      uiStyle(Math.round(Math.min(10, w * 0.07)), card.locked ? CSS.dangerHi : CSS.cream,
        { bold: false, align: 'center', wrap: Math.max(96 * u, w * 0.95) })).setOrigin(0.5, 0);
    const top = groundY - h;
    const plateTop = above ? top - (label.height + sub.height + 12 * u) : groundY + 9 * u;
    label.setY(plateTop);
    sub.setY(plateTop + label.height + 1 * u);
    const pw = Math.max(label.width, sub.width) + 14 * u, ph = label.height + sub.height + 10 * u;
    plate.fillStyle(0x120d08, 0.62).fillRoundedRect(x - pw / 2, plateTop - 5 * u, pw, ph, 6 * u);
    label.setDepth(Math.round(groundY) + 2);
    sub.setDepth(Math.round(groundY) + 2);
    if (card.locked) return;
    // the whole plot is the target, name and all — a thumb should never have to find the door
    const y0 = Math.min(top, plateTop - 5 * u), y1 = Math.max(groundY, plateTop + ph);
    const hit = this.add.rectangle(x, (y0 + y1) / 2, Math.max(w, 96 * u), y1 - y0, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.setDepth(Math.round(groundY) + 3);
    let armed = -1;
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => { armed = p.id; img.setScale(0.97); });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => { img.setScale(1); if (armed === p.id) { armed = -1; this.open(card.id); } });
    hit.on('pointerout', () => { img.setScale(1); armed = -1; });
  }

  private toast(lines: string[]) {
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const t = this.add.text(w / 2, h * 0.5, lines.join('\n'), uiStyle(14 * u, CSS.dangerHi, { stroke: true, wrap: w * 0.9 })).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 600, onComplete: () => t.destroy() });
  }

}

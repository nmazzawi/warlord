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
import { archOf, backdrop, building, type ArchSet } from '../systems/Architecture';
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
      cards.push({ id: 'market', label: 'MARKET', tex: TEX.inn,
        sub: GameState.loot.length ? `sell ${GameState.loot.length} piece${GameState.loot.length === 1 ? '' : 's'} · notice board${jobs ? ` (${jobs} taken)` : ''}`
          : `nothing to sell yet · notice board${jobs ? ` (${jobs} taken)` : ''}` });
    }
    if (isCoastal(this.id)) cards.push({ id: 'harbor', label: 'HARBOR', tex: TEX.inn, sub: 'boats, and nobody sailing them for you' });
    if (stock.inn) cards.push({ id: 'inn', label: 'INN', tex: TEX.inn,
      sub: nextRumor(this.id)
        ? (foreign ? `${foreign.inn.name} — buy a rumor of their own land` : 'buy a rumor — news of the world')
        : (foreign ? `${foreign.inn.name} — you have heard it all` : 'you have heard all they know') });
    // --- the street. Buildings stand on the ground in a row you can walk your eye along, drawn in
    //     whatever this country builds with, and each one is its own tap target.
    const set = archOf(isCamp ? GameState.home : node!.territory);
    const rank = isCamp ? 'camp' : node!.rank ?? (node!.kind === 'town' ? 'city' : 'village');
    const grand = rank === 'capital' ? 1 : rank === 'city' ? 0.7 : rank === 'town' ? 0.45 : 0.2;
    this.add.image(0, 0, backdrop(this, set, `${this.id}_${rank}`, Math.ceil(w), Math.ceil(h), grand)).setOrigin(0).setDepth(-10);

    const n = cards.length;
    const road = h * 0.78;
    const slotW = Math.min(w / Math.max(n, 1), 260 * u);
    const plotW = slotW * 0.86;
    const plotH = Math.min(h * 0.42, plotW * 1.15);
    const x0 = w / 2 - (slotW * n) / 2 + slotW / 2;
    cards.forEach((card, i) => {
      const x = x0 + i * slotW;
      // the further along the street, the slightly smaller — enough to feel like a street
      const k = 1 - Math.abs(i - (n - 1) / 2) * 0.045;
      this.plot(x, road, plotW * k, plotH * k, card, set, u, i);
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
  private plot(x: number, groundY: number, w: number, h: number, card: Card, set: ArchSet, u: number, seed: number) {
    const img = this.add.image(x, groundY, building(this, set, card.id, w, h, seed + 1)).setOrigin(0.5, 1);
    if (card.locked) img.setTint(0x8a8a8a).setAlpha(0.85);
    // a dark plate under the name so it reads off grass, sand or snow alike
    const plate = this.add.graphics();
    const label = this.add.text(x, groundY + 9 * u, card.label,
      displayStyle(Math.round(Math.min(18, w * 0.12)), card.locked ? CSS.muted : CSS.goldHi)).setOrigin(0.5, 0);
    const sub = this.add.text(x, label.y + label.height + 1 * u, card.locked ? `locked — ${card.locked}` : card.sub,
      uiStyle(Math.round(Math.min(11.5, w * 0.08)), card.locked ? CSS.dangerHi : CSS.cream,
        { bold: false, align: 'center', wrap: w * 1.2 })).setOrigin(0.5, 0);
    const pw = Math.max(label.width, sub.width) + 14 * u, ph = label.height + sub.height + 10 * u;
    plate.fillStyle(0x120d08, 0.5).fillRoundedRect(x - pw / 2, label.y - 5 * u, pw, ph, 6 * u);
    plate.setDepth(-1);
    if (card.locked) return;
    // the whole plot is the target, sign and all — a thumb should never have to find the door
    const top = groundY - h;
    const hit = this.add.rectangle(x, (top + sub.y + sub.height) / 2, Math.max(w, 96 * u), (sub.y + sub.height) - top, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
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

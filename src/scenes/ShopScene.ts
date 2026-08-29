// ShopScene.ts — the inside of a building: the Forge (swords, armor, shields, bow, weapon choice), the
// Barracks (local recruits), the Stables (horses) or the Inn (a rumor). Stock and prices depend on the
// settlement and on whether you own the place or are merely visiting.
import Phaser from 'phaser';
import { GameState, type ArmorKind, type HorseKind, type ShieldKind, type WeaponKind } from '../state/GameState';
import { COMPOSITE_BOW, EQUIPMENT, HORSES, TROOP, TROOP_KINDS, WEAPONS } from '../config/balance';
import { Sound } from '../systems/Sound';
import { stockFor } from '../world/Stock';
import { nextRumor } from '../world/Rumors';
import { nodeById } from '../world/WorldMap';
import { visitOf } from '../world/Realms';
import type { BuildingId } from './SettlementScene';
import { CSS, displayStyle, dprOf, makeButton, panel, uiStyle, uiUnit } from './ui';

interface Row {
  name: string; desc: string;
  button: { label: string; sub?: string; enabled: boolean; tone?: 'primary' | 'success' | 'ghost' | 'neutral' | 'danger'; onPress: () => void } | null;
  choices?: Array<{ label: string; active: boolean; enabled: boolean; onPress: () => void }>;
}

const RUMOR_PRICE = 10;

export class ShopScene extends Phaser.Scene {
  private settlementId = 'camp';
  private building: BuildingId = 'forge';
  private visiting = false;
  private onClose!: () => void;
  private rumorShown: string | null = null;
  constructor() { super('Shop'); }

  init(data: { settlementId: string; building: BuildingId; visiting?: boolean; onClose: () => void }) {
    this.settlementId = data.settlementId;
    this.building = data.building;
    this.visiting = !!data.visiting;
    this.onClose = data.onClose;
    this.rumorShown = null;
  }

  create() {
    this.build();
    this.scale.on('resize', this.build, this);
    this.input.keyboard?.on('keydown-ESC', () => this.onClose());
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  private price(base: number) { return Math.ceil(base * stockFor(this.settlementId, this.visiting).markup); }

  private buy(cost: number, apply: () => void) {
    if (GameState.gold < cost) { Sound.deny(); return; }
    GameState.gold -= cost;
    apply();
    Sound.buy();
    GameState.save();
    this.build();
  }

  private rows(): { title: string; blurb: string; rows: Row[] } {
    const g = GameState;
    const stock = stockFor(this.settlementId, this.visiting);
    const foreign = this.settlementId !== 'camp' && nodeById(this.settlementId).kind === 'foreign'
      ? visitOf(nodeById(this.settlementId).territory) : null;
    const markup = stock.markup > 1
      ? `  ·  ${foreign ? "stranger's" : 'visitor'} prices (+${Math.round((stock.markup - 1) * 100)}%)` : '';
    if (this.building === 'forge') {
      const rows: Row[] = [];
      const tier = g.weaponTier;
      const next = tier < stock.forge.swordMaxTier ? WEAPONS[tier] : null;
      rows.push(next ? {
        name: `Sword: ${WEAPONS[tier - 1].name} → ${next.name}`, desc: `${next.damage} damage, ${next.arcDeg}° swing — a visibly bigger strike`,
        button: { label: `${this.price(next.cost)} gold`, enabled: g.gold >= this.price(next.cost), onPress: () => this.buy(this.price(next.cost), () => { g.weaponTier += 1; }) },
      } : { name: `Sword: ${WEAPONS[tier - 1].name}`, desc: tier >= 3 ? 'Fully upgraded.' : `This forge can't do better than tier ${stock.forge.swordMaxTier}. Your camp and Kingsport can.`, button: { label: tier >= 3 ? 'MAXED' : 'NOT HERE', enabled: false, onPress: () => {} } });
      const gear = (key: 'leather' | 'plate' | 'round' | 'kite', stocked: boolean) => {
        const item = EQUIPMENT[key];
        const owned = g.owned[key];
        if (!owned && !stocked) return;
        const worn = (item.slot === 'armor' ? g.armor : g.shield) === key;
        rows.push({
          name: item.name, desc: item.desc,
          button: worn ? { label: 'WORN', enabled: false, onPress: () => {} }
            : owned ? { label: 'WEAR', enabled: true, tone: 'success', onPress: () => { if (item.slot === 'armor') g.armor = key as ArmorKind; else g.shield = key as ShieldKind; Sound.click(); g.save(); this.build(); } }
            : { label: `${this.price(item.cost)} gold`, enabled: g.gold >= this.price(item.cost), onPress: () => this.buy(this.price(item.cost), () => { g.owned[key] = true; if (item.slot === 'armor') g.armor = key as ArmorKind; else g.shield = key as ShieldKind; }) },
        });
      };
      for (const key of ['leather', 'plate', 'round', 'kite'] as const) gear(key, stock.forge.items.includes(key));
      if (stock.forge.items.includes('bow') || g.owned.bow) {
        rows.push({
          name: EQUIPMENT.bow.name, desc: EQUIPMENT.bow.desc,
          button: g.owned.bow ? { label: 'OWNED', enabled: false, onPress: () => {} }
            : { label: `${this.price(EQUIPMENT.bow.cost)} gold`, enabled: g.gold >= this.price(EQUIPMENT.bow.cost), onPress: () => this.buy(this.price(EQUIPMENT.bow.cost), () => { g.owned.bow = true; g.equippedWeapon = 'bow'; }) },
        });
      }
      if (stock.forge.items.includes('composite') || g.owned.composite) {
        rows.push({
          name: COMPOSITE_BOW.name, desc: COMPOSITE_BOW.desc,
          button: g.owned.composite ? { label: 'OWNED', enabled: false, onPress: () => {} }
            : { label: `${this.price(COMPOSITE_BOW.cost)} gold`, enabled: g.gold >= this.price(COMPOSITE_BOW.cost), onPress: () => this.buy(this.price(COMPOSITE_BOW.cost), () => { g.owned.composite = true; g.equippedWeapon = 'composite'; }) },
        });
      }
      if (g.owned.bow || g.owned.halberd || g.owned.composite) {
        const pick = (k: WeaponKind, label: string) => ({ label, active: g.weaponKind === k, enabled: true, onPress: () => { g.equippedWeapon = k; Sound.click(); g.save(); this.build(); } });
        const choices = [pick('sword', 'Sword')];
        if (g.owned.bow) choices.push(pick('bow', 'Bow'));
        if (g.owned.composite) choices.push(pick('composite', 'Composite'));
        if (g.owned.halberd) choices.push(pick('halberd', 'Halberd'));
        rows.push({ name: 'Fight with', desc: 'The sword cleaves up close; bows shoot from range (stand still — the composite bow lets you keep a slow ride). Your arrows pierce.', button: null, choices });
      }
      const weaponName = g.weaponKind === 'bow' ? 'Hunting Bow' : g.weaponKind === 'composite' ? 'Composite Bow' : g.weaponKind === 'halberd' ? 'Kingsport Halberd' : WEAPONS[tier - 1].name;
      return { title: 'THE FORGE', blurb: `${foreign ? `${foreign.forge.note}\n` : ''}Defense ${g.defense}  ·  weapon: ${weaponName}${markup}`, rows };
    }
    if (this.building === 'barracks') {
      const kindKey = stock.barracks?.kind ?? 'raider';
      const k = TROOP_KINDS[kindKey];
      const full = g.troops.length >= TROOP.max;
      const rows: Row[] = [{
        name: full ? 'Warband is full' : `Recruit a ${k.label.toLowerCase()}`, desc: `${g.troops.length}/${TROOP.max} troops  ·  ${k.hp} HP, ${k.damage} damage  ·  ${k.desc}  ·  wages 2/day`,
        button: full ? { label: 'FULL', enabled: false, onPress: () => {} } : { label: `${k.cost} gold`, enabled: g.gold >= k.cost, onPress: () => this.buy(k.cost, () => { g.recruit(kindKey); }) },
      }];
      rows.push({ name: 'Your warband', desc: g.troops.map(t => `${t.name} (${TROOP_KINDS[t.kind ?? 'raider'].label})`).join(', ') || 'nobody — recruit before you raid', button: null });
      const garrisoned = Object.entries(g.garrisons).filter(([, list]) => list.length).map(([id, list]) => `${list.map(t => t.name).join(', ')} at ${id === 'kingsport' ? 'Kingsport' : id[0].toUpperCase() + id.slice(1)}`);
      if (garrisoned.length) rows.push({ name: 'Garrisons', desc: garrisoned.join('; '), button: null });
      if (g.fallen.length || g.deserted.length) rows.push({ name: 'Gone', desc: [...g.fallen.slice(-6).map(f => `${f.name} fell at ${f.where}`), ...g.deserted.slice(-4).map(n => `${n} deserted`)].join(', '), button: null });
      return { title: 'THE BARRACKS', blurb: 'Recruits follow you in formation and fight on their own. Every troop eats 2 gold a day on the road.', rows };
    }
    if (this.building === 'inn') {
      const rows: Row[] = [];
      const rumor = nextRumor(this.settlementId);
      if (this.rumorShown) rows.push({ name: 'The innkeeper leans in…', desc: this.rumorShown, button: null });
      else if (rumor) rows.push({ name: 'Buy a rumor', desc: foreign
        ? 'A drink for the man behind the counter, and a true word about his own country — what its soldiers do, what its roads are like, what it is afraid of.'
        : 'A drink for the innkeeper and a true word about the world — patrols, palisades, Kingsport.',
        button: { label: `${RUMOR_PRICE} gold`, enabled: g.gold >= RUMOR_PRICE, onPress: () => this.buy(RUMOR_PRICE, () => { g.rumorsHeard.push(`${this.settlementId}:${rumor.id}`); this.rumorShown = rumor.text; }) } });
      else rows.push({ name: 'Nothing new', desc: foreign
        ? 'You have had the whole of this country from its innkeepers. Another realm, another story.'
        : 'You have heard everything this inn knows. Try another.', button: null });
      const heard = g.rumorsHeard.length;
      return { title: (foreign ? foreign.inn.name : 'the inn').toUpperCase(), blurb: heard ? `${heard} rumor${heard === 1 ? '' : 's'} heard so far${markup}` : `Travellers talk here${markup}`, rows };
    }
    const rows: Row[] = [];
    for (const key of stock.stables) {
      if (key === 'none') continue;
      const hh = HORSES[key];
      rows.push({
        name: hh.name, desc: hh.desc,
        button: g.owned[key] ? { label: 'OWNED', enabled: false, onPress: () => {} }
          : { label: `${this.price(hh.cost)} gold`, enabled: g.gold >= this.price(hh.cost), onPress: () => this.buy(this.price(hh.cost), () => { g.owned[key] = true; g.horse = key; }) },
      });
    }
    if (!rows.length) rows.push({ name: 'Empty stalls', desc: 'Nothing for sale here.', button: null });
    const ride = (k: HorseKind, label: string) => ({ label, active: g.horse === k, enabled: k === 'none' || g.owned[k], onPress: () => { g.horse = k; Sound.click(); g.save(); this.build(); } });
    rows.push({ name: 'Ride', desc: 'Mounted you are faster and a bigger target. A horse slows to a walk when you shoot.', button: null, choices: [ride('none', 'On foot'), ride('courser', 'Courser'), ride('destrier', 'Destrier')] });
    return { title: 'THE STABLES', blurb: (foreign ? `${foreign.stables.note}\n` : '') + (g.horse === 'none' ? 'On foot.' : `Riding the ${HORSES[g.horse].name}.`) + markup, rows };
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    this.add.rectangle(0, 0, w, h, 0x000000, 0.66).setOrigin(0);
    const { title, blurb, rows } = this.rows();
    const pw = Math.min(w * 0.96, 520 * u);
    const cx = w / 2;
    const rowH = Math.min(62 * u, (h - 150 * u) / Math.max(rows.length, 1));
    // measure the head before drawing the plate: an inn abroad has a long name and a line about its
    // own craft, so neither the title nor the blurb can be assumed to be one line of a fixed size
    const titleT = this.add.text(0, -9999, title, displayStyle(22 * u, CSS.emberDeep, false)).setOrigin(0.5, 0);
    if (titleT.width > pw - 24 * u) titleT.setFontSize(Math.max(12 * u, 22 * u * ((pw - 24 * u) / titleT.width)));
    const blurbT = this.add.text(0, -9999, `Gold ${GameState.gold}   ·   ${blurb}`, uiStyle(11 * u, CSS.inkSoft, { bold: false, wrap: pw - 30 * u })).setOrigin(0.5, 0);
    const headH = Math.max(78 * u, 12 * u + titleT.height + 6 * u + blurbT.height + 12 * u);
    const ph = headH + rows.length * rowH + 70 * u;
    const py = Math.max(8 * u, (h - ph) / 2);
    panel(this, cx - pw / 2, py, pw, ph);
    titleT.setPosition(cx, py + 12 * u);
    blurbT.setPosition(cx, py + 12 * u + titleT.height + 6 * u);
    this.children.bringToTop(titleT); this.children.bringToTop(blurbT);
    let y = py + headH;
    const left = cx - pw / 2 + 16 * u;
    const btnW = 112 * u;
    for (const r of rows) {
      this.add.graphics().lineStyle(1, 0x3a2a18, 0.18).lineBetween(cx - pw / 2 + 10 * u, y, cx + pw / 2 - 10 * u, y);
      const textW = pw - 32 * u - (r.button || r.choices ? btnW * (r.choices ? r.choices.length * 0.75 : 1) + 12 * u : 0);
      this.add.text(left, y + 8 * u, r.name, uiStyle(13 * u, CSS.ink, { align: 'left', wrap: textW }));
      this.add.text(left, y + 27 * u, r.desc, uiStyle(10 * u, CSS.inkSoft, { bold: false, align: 'left', wrap: textW }));
      if (r.button) {
        makeButton(this, cx + pw / 2 - 16 * u - btnW / 2, y + rowH / 2, { width: btnW, height: Math.min(44 * u, rowH - 8 * u), label: r.button.label, sub: r.button.sub,
          enabled: r.button.enabled, tone: r.button.tone ?? 'primary', fontSize: Math.round(13 * u), onPress: r.button.onPress });
      }
      if (r.choices) {
        const cw = btnW * 0.72, gap = 6 * u;
        const total = r.choices.length * cw + (r.choices.length - 1) * gap;
        let x = cx + pw / 2 - 16 * u - total + cw / 2;
        for (const c of r.choices) {
          makeButton(this, x, y + rowH / 2, { width: cw, height: Math.min(40 * u, rowH - 10 * u), label: c.label, enabled: c.enabled, tone: c.active ? 'success' : 'ghost', fontSize: Math.round(11 * u), onPress: c.onPress });
          x += cw + gap;
        }
      }
      y += rowH;
    }
    makeButton(this, cx, py + ph - 36 * u, { width: Math.min(pw - 40 * u, 260 * u), height: 46 * u, label: 'LEAVE', tone: 'neutral', fontSize: Math.round(16 * u), onPress: () => this.onClose() });
  }
}

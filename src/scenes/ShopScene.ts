// ShopScene.ts — the inside of a building: the Forge (swords, armor, shields, bow, weapon choice), the
// Barracks (local recruits) or the Stables (horses). What is on the shelves depends on the settlement.
import Phaser from 'phaser';
import { GameState, type ArmorKind, type HorseKind, type ShieldKind, type WeaponKind } from '../state/GameState';
import { EQUIPMENT, HORSES, TROOP, TROOP_KINDS, WEAPONS } from '../config/balance';
import { Sound } from '../systems/Sound';
import { stockFor } from '../world/Stock';
import type { BuildingId } from './SettlementScene';
import { dprOf, FONT, makeButton, uiUnit } from './ui';

interface Row {
  name: string; desc: string;
  button: { label: string; sub?: string; enabled: boolean; color?: number; onPress: () => void } | null;
  choices?: Array<{ label: string; active: boolean; enabled: boolean; onPress: () => void }>;
}

export class ShopScene extends Phaser.Scene {
  private settlementId = 'camp';
  private building: BuildingId = 'forge';
  private onClose!: () => void;
  constructor() { super('Shop'); }

  init(data: { settlementId: string; building: BuildingId; onClose: () => void }) {
    this.settlementId = data.settlementId;
    this.building = data.building;
    this.onClose = data.onClose;
  }

  create() {
    this.build();
    this.scale.on('resize', this.build, this);
    this.input.keyboard?.on('keydown-ESC', () => this.onClose());
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

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
    const stock = stockFor(this.settlementId);
    if (this.building === 'forge') {
      const rows: Row[] = [];
      const tier = g.weaponTier;
      const next = tier < stock.forge.swordMaxTier ? WEAPONS[tier] : null;
      rows.push(next ? {
        name: `Sword: ${WEAPONS[tier - 1].name} → ${next.name}`, desc: `${next.damage} damage, ${next.arcDeg}° swing — a visibly bigger strike`,
        button: { label: `${next.cost} gold`, enabled: g.gold >= next.cost, onPress: () => this.buy(next.cost, () => { g.weaponTier += 1; }) },
      } : { name: `Sword: ${WEAPONS[tier - 1].name}`, desc: tier >= 3 ? 'Fully upgraded.' : `This forge can't do better than tier ${stock.forge.swordMaxTier}. Kingsport's can.`, button: { label: tier >= 3 ? 'MAXED' : 'NOT HERE', enabled: false, onPress: () => {} } });
      const gear = (key: 'leather' | 'plate' | 'round' | 'kite') => {
        const item = EQUIPMENT[key];
        const owned = g.owned[key];
        const worn = (item.slot === 'armor' ? g.armor : g.shield) === key;
        rows.push({
          name: item.name, desc: item.desc,
          button: worn ? { label: 'WORN', enabled: false, onPress: () => {} }
            : owned ? { label: 'WEAR', enabled: true, color: 0x3f7a3f, onPress: () => { if (item.slot === 'armor') g.armor = key as ArmorKind; else g.shield = key as ShieldKind; Sound.click(); g.save(); this.build(); } }
            : { label: `${item.cost} gold`, enabled: g.gold >= item.cost, onPress: () => this.buy(item.cost, () => { g.owned[key] = true; if (item.slot === 'armor') g.armor = key as ArmorKind; else g.shield = key as ShieldKind; }) },
        });
      };
      for (const it of stock.forge.items) {
        if (it === 'bow') {
          rows.push({
            name: EQUIPMENT.bow.name, desc: EQUIPMENT.bow.desc,
            button: g.owned.bow ? { label: 'OWNED', enabled: false, onPress: () => {} }
              : { label: `${EQUIPMENT.bow.cost} gold`, enabled: g.gold >= EQUIPMENT.bow.cost, onPress: () => this.buy(EQUIPMENT.bow.cost, () => { g.owned.bow = true; g.equippedWeapon = 'bow'; }) },
          });
        } else gear(it);
      }
      if (g.owned.bow || g.owned.halberd) {
        const pick = (k: WeaponKind, label: string) => ({ label, active: g.weaponKind === k, enabled: k === 'sword' || (k === 'bow' ? g.owned.bow : g.owned.halberd), onPress: () => { g.equippedWeapon = k; Sound.click(); g.save(); this.build(); } });
        const choices = [pick('sword', 'Sword')];
        if (g.owned.bow) choices.push(pick('bow', 'Bow'));
        if (g.owned.halberd) choices.push(pick('halberd', 'Halberd'));
        rows.push({ name: 'Fight with', desc: g.owned.halberd ? 'The halberd out-reaches everything; the bow shoots from range (stand still).' : 'The sword cleaves up close; the bow shoots from range (stand still).', button: null, choices });
      }
      const weaponName = g.weaponKind === 'bow' ? 'Hunting Bow' : g.weaponKind === 'halberd' ? 'Kingsport Halberd' : WEAPONS[tier - 1].name;
      return { title: 'THE FORGE', blurb: `Defense ${g.defense}  ·  weapon: ${weaponName}`, rows };
    }
    if (this.building === 'barracks') {
      const kindKey = stock.barracks?.kind ?? 'raider';
      const k = TROOP_KINDS[kindKey];
      const full = g.troops.length >= TROOP.max;
      const rows: Row[] = [{
        name: full ? 'Warband is full' : `Recruit a ${k.label.toLowerCase()}`, desc: `${g.troops.length}/${TROOP.max} troops  ·  ${k.hp} HP, ${k.damage} damage  ·  ${k.desc}  ·  wages ${2}/day`,
        button: full ? { label: 'FULL', enabled: false, onPress: () => {} } : { label: `${k.cost} gold`, enabled: g.gold >= k.cost, onPress: () => this.buy(k.cost, () => { g.recruit(kindKey); }) },
      }];
      rows.push({ name: 'Your warband', desc: g.troops.map(t => `${t.name} (${TROOP_KINDS[t.kind ?? 'raider'].label})`).join(', ') || 'nobody — recruit before you raid', button: null });
      const garrisoned = Object.entries(g.garrisons).filter(([, list]) => list.length).map(([id, list]) => `${list.map(t => t.name).join(', ')} at ${id === 'kingsport' ? 'Kingsport' : id[0].toUpperCase() + id.slice(1)}`);
      if (garrisoned.length) rows.push({ name: 'Garrisons', desc: garrisoned.join('; '), button: null });
      if (g.fallen.length || g.deserted.length) rows.push({ name: 'Gone', desc: [...g.fallen.slice(-6).map(f => `${f.name} fell at ${f.where}`), ...g.deserted.slice(-4).map(n => `${n} deserted`)].join(', '), button: null });
      return { title: 'THE BARRACKS', blurb: 'Recruits follow you in formation and fight on their own. Every troop eats 2 gold a day on the road.', rows };
    }
    const rows: Row[] = [];
    for (const key of stock.stables) {
      if (key === 'none') continue;
      const hh = HORSES[key];
      rows.push({
        name: hh.name, desc: hh.desc,
        button: g.owned[key] ? { label: 'OWNED', enabled: false, onPress: () => {} }
          : { label: `${hh.cost} gold`, enabled: g.gold >= hh.cost, onPress: () => this.buy(hh.cost, () => { g.owned[key] = true; g.horse = key; }) },
      });
    }
    const ride = (k: HorseKind, label: string) => ({ label, active: g.horse === k, enabled: k === 'none' || g.owned[k], onPress: () => { g.horse = k; Sound.click(); g.save(); this.build(); } });
    rows.push({ name: 'Ride', desc: 'Mounted you are faster and a bigger target. A horse slows to a walk when you shoot.', button: null, choices: [ride('none', 'On foot'), ride('courser', 'Courser'), ride('destrier', 'Destrier')] });
    return { title: 'THE STABLES', blurb: g.horse === 'none' ? 'On foot.' : `Riding the ${HORSES[g.horse].name}.`, rows };
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0);
    const { title, blurb, rows } = this.rows();
    const pw = Math.min(w * 0.96, 520 * u);
    const cx = w / 2;
    const rowH = Math.min(62 * u, (h - 150 * u) / Math.max(rows.length, 1));
    const headH = 78 * u;
    const ph = headH + rows.length * rowH + 70 * u;
    const py = Math.max(8 * u, (h - ph) / 2);
    const bg = this.add.graphics();
    bg.fillStyle(0x2a2118, 0.97).fillRoundedRect(cx - pw / 2, py, pw, ph, 14);
    bg.lineStyle(3, 0xf5deb3, 0.9).strokeRoundedRect(cx - pw / 2, py, pw, ph, 14);
    this.add.text(cx, py + 12 * u, title, { fontFamily: FONT, fontSize: `${Math.round(22 * u)}px`, color: '#f5c542', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.add.text(cx, py + 40 * u, `Gold: ${GameState.gold}   ·   ${blurb}`, { fontFamily: FONT, fontSize: `${Math.round(11 * u)}px`, color: '#e8dcc0', align: 'center', wordWrap: { width: pw - 30 * u } }).setOrigin(0.5, 0);
    let y = py + headH;
    const left = cx - pw / 2 + 16 * u;
    const btnW = 112 * u;
    for (const r of rows) {
      this.add.graphics().lineStyle(1, 0xffffff, 0.12).lineBetween(cx - pw / 2 + 10 * u, y, cx + pw / 2 - 10 * u, y);
      const textW = pw - 32 * u - (r.button || r.choices ? btnW * (r.choices ? r.choices.length * 0.75 : 1) + 12 * u : 0);
      this.add.text(left, y + 8 * u, r.name, { fontFamily: FONT, fontSize: `${Math.round(13 * u)}px`, color: '#fff8e7', fontStyle: 'bold', wordWrap: { width: textW } });
      this.add.text(left, y + 27 * u, r.desc, { fontFamily: FONT, fontSize: `${Math.round(10 * u)}px`, color: '#c9bda3', wordWrap: { width: textW } });
      if (r.button) {
        makeButton(this, cx + pw / 2 - 16 * u - btnW / 2, y + rowH / 2, { width: btnW, height: Math.min(44 * u, rowH - 8 * u), label: r.button.label, sub: r.button.sub,
          enabled: r.button.enabled, color: r.button.color ?? 0x2f6b8a, fontSize: Math.round(13 * u), onPress: r.button.onPress });
      }
      if (r.choices) {
        const cw = btnW * 0.72, gap = 6 * u;
        const total = r.choices.length * cw + (r.choices.length - 1) * gap;
        let x = cx + pw / 2 - 16 * u - total + cw / 2;
        for (const c of r.choices) {
          makeButton(this, x, y + rowH / 2, { width: cw, height: Math.min(40 * u, rowH - 10 * u), label: c.label, enabled: c.enabled, color: c.active ? 0x3f7a3f : 0x555555, fontSize: Math.round(11 * u), onPress: c.onPress });
          x += cw + gap;
        }
      }
      y += rowH;
    }
    makeButton(this, cx, py + ph - 36 * u, { width: Math.min(pw - 40 * u, 260 * u), height: 46 * u, label: 'LEAVE', color: 0x8a5a2b, fontSize: Math.round(16 * u), onPress: () => this.onClose() });
  }
}

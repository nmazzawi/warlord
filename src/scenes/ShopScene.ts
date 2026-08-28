// ShopScene.ts — the inside of a camp building: the Forge (swords, armor, shield, bow), the
// Barracks (recruits) or the Stables (horses). Overlaid on the walkable camp.
import Phaser from 'phaser';
import { GameState, type HorseKind, type WeaponKind } from '../state/GameState';
import { EQUIPMENT, HORSES, TROOP, WEAPONS } from '../config/balance';
import { Sound } from '../systems/Sound';
import type { BuildingId } from './CampScene';
import { FONT, makeButton, uiUnit } from './ui';

interface Row { name: string; desc: string; button: { label: string; sub?: string; enabled: boolean; color?: number; onPress: () => void } | null;
  choices?: Array<{ label: string; active: boolean; enabled: boolean; onPress: () => void }>; }

export class ShopScene extends Phaser.Scene {
  private building!: BuildingId;
  private onClose!: () => void;
  constructor() { super('Shop'); }

  init(data: { building: BuildingId; onClose: () => void }) {
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
    if (this.building === 'forge') {
      const tier = g.weaponTier;
      const next = WEAPONS[tier] ?? null;
      const rows: Row[] = [];
      rows.push(next ? {
        name: `Sword: ${WEAPONS[tier - 1].name} → ${next.name}`, desc: `${next.damage} damage, ${next.arcDeg}° swing — a visibly bigger strike`,
        button: { label: `${next.cost} gold`, enabled: g.gold >= next.cost, onPress: () => this.buy(next.cost, () => { g.weaponTier += 1; }) },
      } : { name: `Sword: ${WEAPONS[tier - 1].name}`, desc: 'Fully upgraded.', button: { label: 'MAXED', enabled: false, onPress: () => {} } });
      const gear = (key: 'armor' | 'shield' | 'bow') => {
        const item = EQUIPMENT[key];
        rows.push({
          name: item.name, desc: item.desc,
          button: g.owned[key] ? { label: 'OWNED', enabled: false, onPress: () => {} }
            : { label: `${item.cost} gold`, enabled: g.gold >= item.cost, onPress: () => this.buy(item.cost, () => { g.owned[key] = true; if (key === 'bow') g.equippedWeapon = 'bow'; }) },
        });
      };
      gear('armor'); gear('shield'); gear('bow');
      if (g.owned.bow) {
        const pick = (k: WeaponKind) => ({ label: k === 'sword' ? 'Sword' : 'Bow', active: g.weaponKind === k, enabled: true, onPress: () => { g.equippedWeapon = k; Sound.click(); g.save(); this.build(); } });
        rows.push({ name: 'Fight with', desc: 'The sword cleaves up close; the bow shoots from range.', button: null, choices: [pick('sword'), pick('bow')] });
      }
      return { title: 'THE FORGE', blurb: `Defense ${g.defense}  ·  weapon: ${g.weaponKind === 'bow' ? 'Hunting Bow' : WEAPONS[tier - 1].name}`, rows };
    }
    if (this.building === 'barracks') {
      const full = g.troops.length >= TROOP.max;
      const rows: Row[] = [{
        name: full ? 'Warband is full' : 'Recruit a fighter', desc: `${g.troops.length}/${TROOP.max} troops  ·  ${TROOP.hp} HP, ${TROOP.damage} damage. Deaths are permanent.`,
        button: full ? { label: 'FULL', enabled: false, onPress: () => {} } : { label: `${TROOP.cost} gold`, enabled: g.gold >= TROOP.cost, onPress: () => this.buy(TROOP.cost, () => { g.recruit(); }) },
      }];
      rows.push({ name: 'Your warband', desc: g.troops.map(t => t.name).join(', ') || 'nobody — recruit before you raid', button: null });
      if (g.fallen.length) rows.push({ name: 'The fallen', desc: g.fallen.slice(-8).map(f => `${f.name} (${f.where})`).join(', '), button: null });
      return { title: 'THE BARRACKS', blurb: 'Recruits follow you in formation and fight on their own.', rows };
    }
    const rows: Row[] = [];
    const horse = (key: 'courser' | 'destrier') => {
      const h = HORSES[key];
      rows.push({
        name: h.name, desc: h.desc,
        button: g.owned[key] ? { label: 'OWNED', enabled: false, onPress: () => {} }
          : { label: `${h.cost} gold`, enabled: g.gold >= h.cost, onPress: () => this.buy(h.cost, () => { g.owned[key] = true; g.horse = key; }) },
      });
    };
    horse('courser'); horse('destrier');
    const ride = (k: HorseKind, label: string) => ({ label, active: g.horse === k, enabled: k === 'none' || g.owned[k], onPress: () => { g.horse = k; Sound.click(); g.save(); this.build(); } });
    rows.push({ name: 'Ride', desc: 'Mounted you are faster and a bigger target.', button: null, choices: [ride('none', 'On foot'), ride('courser', 'Courser'), ride('destrier', 'Destrier')] });
    return { title: 'THE STABLES', blurb: g.horse === 'none' ? 'On foot.' : `Riding the ${HORSES[g.horse].name}.`, rows };
  }

  private build() {
    for (const c of this.children.list.slice()) c.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0);
    const { title, blurb, rows } = this.rows();
    const pw = Math.min(w * 0.96, 520 * u);
    const cx = w / 2;
    const rowH = 62 * u;
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
      this.add.text(left, y + 10 * u, r.name, { fontFamily: FONT, fontSize: `${Math.round(13 * u)}px`, color: '#fff8e7', fontStyle: 'bold', wordWrap: { width: textW } });
      this.add.text(left, y + 30 * u, r.desc, { fontFamily: FONT, fontSize: `${Math.round(10 * u)}px`, color: '#c9bda3', wordWrap: { width: textW } });
      if (r.button) {
        makeButton(this, cx + pw / 2 - 16 * u - btnW / 2, y + rowH / 2, { width: btnW, height: 44 * u, label: r.button.label, sub: r.button.sub,
          enabled: r.button.enabled, color: r.button.color ?? 0x2f6b8a, fontSize: Math.round(13 * u), onPress: r.button.onPress });
      }
      if (r.choices) {
        const cw = btnW * 0.72, gap = 6 * u;
        const total = r.choices.length * cw + (r.choices.length - 1) * gap;
        let x = cx + pw / 2 - 16 * u - total + cw / 2;
        for (const c of r.choices) {
          makeButton(this, x, y + rowH / 2, { width: cw, height: 40 * u, label: c.label, enabled: c.enabled, color: c.active ? 0x3f7a3f : 0x555555, fontSize: Math.round(11 * u), onPress: c.onPress });
          x += cw + gap;
        }
      }
      y += rowH;
    }
    makeButton(this, cx, py + ph - 36 * u, { width: Math.min(pw - 40 * u, 260 * u), height: 46 * u, label: 'LEAVE', color: 0x8a5a2b, fontSize: Math.round(16 * u), onPress: () => this.onClose() });
  }
}

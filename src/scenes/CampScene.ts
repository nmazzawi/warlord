// CampScene.ts — between raids: spend gold on a better weapon or new recruits, then raid again.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { TROOP, WEAPONS } from '../config/balance';
import { Sound } from '../systems/Sound';
import { FONT, makeButton } from './ui';

export class CampScene extends Phaser.Scene {
  constructor() { super('Camp'); }

  create() {
    this.cameras.main.setBackgroundColor('#1a1410');
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  /** Lays the whole screen out from scratch — called on every resize so it fits any phone. */
  private build() {
    this.children.removeAll(true);
    const { width: w, height: h } = this.scale;
    const u = Phaser.Math.Clamp(Math.min(w, h) / 420, 0.75, 1.6); // UI scale unit
    const cx = w / 2;
    const colW = Math.min(w * 0.92, 420 * u);
    let y = 22 * u;
    const text = (str: string, size: number, color = '#fff8e7', align: 'center' | 'left' = 'center') => {
      const t = this.add.text(cx, y, str, { fontFamily: FONT, fontSize: `${Math.round(size * u)}px`, color, fontStyle: 'bold',
        wordWrap: { width: colW }, align }).setOrigin(0.5, 0);
      y += t.height + 6 * u;
      return t;
    };

    text('WARLORD', 34, '#f5c542');
    text(`Camp  ·  before Raid ${GameState.raidNumber}`, 15, '#d9c9a8');
    y += 6 * u;
    text(`Gold: ${GameState.gold}`, 22, '#f5c542');
    y += 8 * u;

    // Weapon
    const tier = GameState.weaponTier;
    const cur = WEAPONS[tier - 1];
    const next = WEAPONS[tier] ?? null;
    text(`Weapon: ${cur.name} (Tier ${tier})  ·  ${cur.damage} dmg, ${cur.arcDeg}° swing`, 13, '#d9c9a8');
    const bh = 54 * u;
    if (next) {
      const can = GameState.gold >= next.cost;
      makeButton(this, cx, y + bh / 2, {
        width: colW, height: bh, label: `Upgrade → ${next.name}`, sub: `${next.cost} gold  ·  ${next.damage} dmg, wider strike`,
        enabled: can, color: 0x2f6b8a,
        onPress: () => { GameState.gold -= next.cost; GameState.weaponTier += 1; Sound.buy(); this.build(); },
      });
    } else {
      makeButton(this, cx, y + bh / 2, { width: colW, height: bh, label: 'Weapon fully upgraded', enabled: false, onPress: () => {} });
    }
    y += bh + 14 * u;

    // Troops
    const names = GameState.troops.map(t => t.name).join(', ') || 'none';
    text(`Troops (${GameState.troops.length}/${TROOP.max}): ${names}`, 13, '#c8f0c8');
    const full = GameState.troops.length >= TROOP.max;
    const canRecruit = !full && GameState.gold >= TROOP.cost;
    makeButton(this, cx, y + bh / 2, {
      width: colW, height: bh, label: full ? 'Warband is full' : 'Recruit a troop', sub: full ? undefined : `${TROOP.cost} gold`,
      enabled: canRecruit, color: 0x3f7a3f,
      onPress: () => { GameState.gold -= TROOP.cost; GameState.recruit(); Sound.buy(); this.build(); },
    });
    y += bh + 10 * u;
    if (GameState.fallen.length) {
      const f = GameState.fallen.slice(-6).map(x => `${x.name} (raid ${x.raid})`).join(', ');
      text(`Fallen: ${f}`, 11, '#b08a8a');
    }
    y += 10 * u;

    // Raid
    const rh = 68 * u;
    makeButton(this, cx, y + rh / 2, {
      width: colW, height: rh, label: `RAID ${GameState.raidNumber}  ▶`, sub: 'clear the village of its defenders',
      color: 0xa0341f, fontSize: Math.round(26 * u),
      onPress: () => this.scene.start('Raid'),
    });
    y += rh + 16 * u;

    text('Move: drag anywhere on the left / WASD  ·  Q = War Horn  ·  E = Charge\nYou swing automatically at anything in reach. Fight in alleys, not in the open.', 11, '#a89a80');
  }
}

// CivSelectScene.ts — the first choice of a run: which of the fifteen you are. A portrait wall on one
// side, and on the other everything the choice actually decides — who this person was, how their
// people fight, what they are holding, the three who ride out with them, and where on Earth their
// camp will stand. The Borderland Outlaw stands first: it is the game as it was, and the hard way in.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { campPoint, civList, CONFINED, type CivDef } from '../world/Civs';
import { portrait, type Headgear } from '../systems/Portraits';
import { REGIONS } from '../world/WorldChart';
import { baseTexture } from '../world/ChartLayer';
import { CHART } from '../world/geo';
import { CSS, displayStyle, dprOf, drawPanel, ironBackdrop, makeButton, PAL, safeInsets, uiStyle, uiUnit } from './ui';

/** Which headgear names each country at a glance. */
const HEAD: Record<string, Headgear> = {
  outlaw: 'hood', rome: 'crest', greece: 'hoplite', japan: 'kabuto', china: 'lamellar',
  mongolia: 'fur', rus: 'fur', arabia: 'turban', viking: 'horned', persia: 'turban',
  india: 'turban', egypt: 'nemes', kush: 'nemes', aztecs: 'feather', inca: 'circlet',
};
const ARM: Record<string, 'sword' | 'bow' | 'spear' | 'axe' | 'club'> = {
  outlaw: 'sword', rome: 'sword', greece: 'spear', japan: 'sword', china: 'axe',
  mongolia: 'bow', rus: 'axe', arabia: 'sword', viking: 'axe', persia: 'spear',
  india: 'spear', egypt: 'bow', kush: 'bow', aztecs: 'club', inca: 'club',
};

export class CivSelectScene extends Phaser.Scene {
  private picked = 0;
  constructor() { super('CivSelect'); }

  create() {
    this.picked = 0;
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
  }

  private portraitKey(c: CivDef) {
    const key = `portrait_${c.id}`;
    portrait(this, key, { headgear: HEAD[c.id] ?? 'hood', tint: c.tint, accent: c.accent,
      arm: ARM[c.id] ?? 'sword', beard: c.id !== 'japan' && c.id !== 'china' && c.id !== 'aztecs' }, 220);
    return key;
  }

  private build() {
    for (const o of this.children.list.slice()) o.destroy();
    const { width: w, height: h } = this.scale;
    const u = uiUnit(w, h, dprOf(this));
    const ins = safeInsets(this);
    ironBackdrop(this, w, h);
    const list = civList();
    if (!list.length) return;
    const civ = list[Phaser.Math.Clamp(this.picked, 0, list.length - 1)];

    const wide = w > h * 1.15;
    const top = ins.top + 10 * u;
    this.add.text(w / 2, top, 'CHOOSE YOUR START', displayStyle(Math.round(26 * u), CSS.goldHi)).setOrigin(0.5, 0);
    const headH = top + 40 * u;

    // ---- the wall of portraits
    const cols = wide ? 5 : 5;
    const rows = Math.ceil(list.length / cols);
    const gridW = wide ? w * 0.42 : w - 20 * u;
    const cell = Math.min(gridW / cols, (wide ? h - headH - 80 * u : (h - headH) * 0.42) / rows);
    const gx = wide ? 14 * u : (w - cell * cols) / 2;
    const gy = headH;
    list.forEach((c, i) => {
      const x = gx + (i % cols) * cell + cell / 2;
      const y = gy + Math.floor(i / cols) * cell + cell / 2;
      const on = c.id === civ.id;
      const plate = this.add.graphics();
      drawPanel(plate, x - cell * 0.46, y - cell * 0.46, cell * 0.92, cell * 0.92, { radius: 8 * u, alpha: on ? 1 : 0.55 });
      const img = this.add.image(x, y - cell * 0.10, this.portraitKey(c));
      img.setDisplaySize(cell * 0.58, cell * 0.58).setAlpha(on ? 1 : 0.8);
      this.add.text(x, y + cell * 0.31, c.name.toUpperCase(), uiStyle(Math.max(7, Math.round(cell * 0.078)), on ? CSS.emberDeep : CSS.inkSoft,
        { bold: true, align: 'center', wrap: cell * 0.84 })).setOrigin(0.5, 0.5);
      if (on) {
        const ring = this.add.graphics();
        ring.lineStyle(2.5 * u, PAL.gold, 0.95).strokeRoundedRect(x - cell * 0.46, y - cell * 0.46, cell * 0.92, cell * 0.92, 8 * u);
      }
      const hit = this.add.rectangle(x, y, cell * 0.92, cell * 0.92, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => { this.picked = i; this.build(); });
    });

    // ---- and what the choice decides
    const px0 = wide ? gx + cell * cols + 14 * u : 12 * u;
    const py0 = wide ? headH : gy + rows * cell + 8 * u;
    const pw = wide ? w - px0 - 14 * u : w - 24 * u;
    const ph = (wide ? h - py0 - ins.bottom - 74 * u : h - py0 - ins.bottom - 68 * u);
    panelPlate(this, px0, py0, pw, ph, u);

    let y = py0 + 12 * u;
    const pad = 16 * u;
    this.add.text(px0 + pad, y, civ.heroName, displayStyle(Math.round(21 * u), CSS.emberDeep, false)).setOrigin(0, 0);
    y += 26 * u;
    this.add.text(px0 + pad, y, civ.heroTitle, uiStyle(Math.round(11.5 * u), CSS.inkSoft, { bold: false, wrap: pw - pad * 2 })).setOrigin(0, 0);
    y += 20 * u;
    const story = this.add.text(px0 + pad, y, civ.backstory, uiStyle(Math.round(11.5 * u), CSS.ink, { bold: false, wrap: pw - pad * 2 })).setOrigin(0, 0);
    y += story.height + 10 * u;
    this.add.text(px0 + pad, y, civ.playstyle.toUpperCase(), uiStyle(Math.round(11 * u), CSS.emberDeep, { wrap: pw - pad * 2 })).setOrigin(0, 0);
    y += 24 * u;

    // the home realm, shown on a small plate of the world
    const mapW = Math.min(pw - pad * 2, 210 * u), mapH = mapW * (CHART.h / CHART.w);
    this.miniChart(px0 + pad, y, mapW, mapH, civ);
    const colX = px0 + pad + mapW + 12 * u;
    const colW = pw - pad * 2 - mapW - 12 * u;
    if (colW > 90 * u) {
      this.add.text(colX, y, `HOME: ${realmName(civ.home)}`, uiStyle(Math.round(11 * u), CSS.emberDeep, { wrap: colW })).setOrigin(0, 0);
      this.add.text(colX, y + 18 * u, `Starts with ${weaponName(civ.weapon)}`, uiStyle(Math.round(11 * u), CSS.ink, { bold: false, wrap: colW })).setOrigin(0, 0);
      this.add.text(colX, y + 34 * u, `Rides out with:\n${civ.troops.slice(0, 3).map(t => `\u00b7 ${t.name}`).join('\n')}`,
        uiStyle(Math.round(11 * u), CSS.ink, { bold: false, wrap: colW })).setOrigin(0, 0);
    }
    if (CONFINED[civ.id]) {
      const note = this.add.text(px0 + pad, y + mapH + 2 * u, CONFINED[civ.id],
        uiStyle(Math.round(10.5 * u), '#8a3a10', { bold: false, wrap: pw - pad * 2 })).setOrigin(0, 0);
      y += note.height - 12 * u;
    }
    y += mapH + 10 * u;

    // the roster: what this country will sell you for the rest of the run
    for (const t of civ.troops) {
      if (y > py0 + ph - 30 * u) break;
      this.add.text(px0 + pad, y, `${t.name}`, uiStyle(Math.round(11.5 * u), roleColor(t.role))).setOrigin(0, 0);
      this.add.text(px0 + pw - pad, y, `${t.cost}g · ${t.wage}/day`, uiStyle(Math.round(10.5 * u), CSS.inkSoft, { bold: false })).setOrigin(1, 0);
      this.add.text(px0 + pad, y + 14 * u, t.signature, uiStyle(Math.round(10.5 * u), CSS.inkSoft, { bold: false, wrap: pw - pad * 2 })).setOrigin(0, 0);
      y += 32 * u;
    }

    // ---- begin
    const by = h - ins.bottom - 34 * u;
    makeButton(this, w / 2 - 88 * u, by, { width: 160 * u, height: 46 * u, label: 'BEGIN', tone: 'success', fontSize: Math.round(16 * u),
      onPress: () => { GameState.newRun(civ.id); this.scene.start('Settlement', { id: 'camp' }); } });
    makeButton(this, w / 2 + 88 * u, by, { width: 140 * u, height: 46 * u, label: 'BACK', tone: 'ghost', fontSize: Math.round(14 * u),
      onPress: () => this.scene.start('Title') });
  }

  /** The whole world, small, with this start's country lit and its camp marked. */
  private miniChart(x: number, y: number, w: number, h: number, civ: CivDef) {
    const img = this.add.image(x, y, baseTexture(this)).setOrigin(0).setDisplaySize(w, h);
    img.setAlpha(0.82);
    const g = this.add.graphics().setDepth(1);
    const sx = w / CHART.w, sy = h / CHART.h;
    const region = REGIONS.find(r => r.id === civ.home || (civ.home === 'steppe' && r.id === 'mongolia'));
    if (region) {
      g.fillStyle(PAL.goldHi, 0.34).lineStyle(1.5, PAL.goldHi, 0.9);
      g.beginPath();
      region.poly.forEach((p, i) => (i ? g.lineTo(x + p[0] * sx, y + p[1] * sy) : g.moveTo(x + p[0] * sx, y + p[1] * sy)));
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
    const at = campPoint(civ.id);
    const [cx, cy] = [at[0] * sx + x, at[1] * sy + y];
    g.fillStyle(0xd94f3a, 1).fillCircle(cx, cy, 3.2);
    g.lineStyle(1.2, 0xffffff, 0.9).strokeCircle(cx, cy, 5.2);
    g.lineStyle(1, PAL.gold, 0.5).strokeRect(x, y, w, h);
  }
}

function panelPlate(scene: Phaser.Scene, x: number, y: number, w: number, h: number, u: number) {
  const g = scene.add.graphics();
  drawPanel(g, x, y, w, h, { radius: 10 * u });
}
// on parchment: the elite in ember, the specialist in green, the line in plain ink
function roleColor(role: string) { return role === 'elite' ? CSS.emberDeep : role === 'specialist' ? '#3f6b2a' : CSS.ink; }
function weaponName(k: string) { return k === 'bow' ? 'a bow' : k === 'composite' ? 'a composite bow' : 'a sword'; }
function realmName(home: string) {
  if (home === 'homeland') return 'The Borderland';
  const r = REGIONS.find(x => x.id === home || (home === 'steppe' && x.id === 'mongolia'));
  return r ? r.name : home;
}

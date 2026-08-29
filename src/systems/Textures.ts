// Textures.ts — placeholder art, still 100% drawn in code, but with an identity: every unit is a
// composed figure whose type reads at a glance (helmet, shield, weapon), buildings are small
// vignettes, and everything shares one palette. Baked into textures so sprites can be tinted
// (hit flash) and batched (fast on phones).
import Phaser from 'phaser';
import { HERO, WEAPONS } from '../config/balance';
import { PAL } from '../scenes/ui';

export const TEX = {
  px: 'px',
  hero: 'hero', troop: 'troop', militia: 'militia', archer: 'archer', captain: 'captain', guard: 'guard', boss: 'boss',
  horsearcher: 'horsearcher', rider: 'rider', noyan: 'noyan', trooprider: 'trooprider',
  arrow: 'arrow', coin: 'coin', ring: 'ring', dot: 'dot', blade: 'blade', horse: 'horse', shield: 'shield', shadow: 'shadow',
  slash: (tier: number) => `slash${tier}`,
  hut: (w: number, h: number) => `hut_${w}x${h}`,
  mapCamp: 'map_camp', mapVillage: 'map_village', mapTown: 'map_town', mapToken: 'map_token', mapCross: 'map_cross', mapPalisade: 'map_palisade',
  mapYurts: 'map_yurts', mapWaypoint: 'map_waypoint', mapTrade: 'map_trade', mapGate: 'map_gate',
  forge: 'bld_forge', barracks: 'bld_barracks', stables: 'bld_stables', inn: 'bld_inn', tent: 'tent', campfire: 'campfire', signpost: 'signpost',
};

export const HUT_SIZES: Array<[number, number]> = [[90, 70], [80, 64], [70, 90], [64, 80], [100, 60]];

export const COLORS = {
  hero: 0x3f8fd6, troop: 0x6a9a4a, militia: 0x9a5a3a, archer: 0x4f7a4a, captain: 0x8e1f1f,
  gold: PAL.gold, hurt: 0xff4d4d, troopHurt: 0xffa040,
};

function g(scene: Phaser.Scene) { return scene.make.graphics({ x: 0, y: 0 }, false); }

interface FigureOpts {
  size: number;            // texture size (bigger than the body so weapons/plumes fit)
  radius: number;          // body radius (matches the physics circle)
  tunic: number; tunicHi?: number;
  helmet: 'none' | 'cap' | 'steel' | 'hood' | 'plume' | 'crest';
  helmetColor?: number; plume?: number;
  weapon: 'none' | 'sword' | 'pitchfork' | 'bow' | 'spear' | 'halberd';
  shield?: boolean; cloak?: number;
}

/** A top-down chibi figure: cloak, tunic, head/helmet, shield on the left, weapon on the right. */
function figure(scene: Phaser.Scene, key: string, o: FigureOpts) {
  if (scene.textures.exists(key)) return;
  const s = g(scene);
  const c = o.size / 2, r = o.radius;
  const dark = (col: number, k = 0.55) => Phaser.Display.Color.ValueToColor(col).darken(Math.round(k * 40)).color;
  if (o.cloak !== undefined) {
    s.fillStyle(dark(o.cloak), 1).fillEllipse(c, c + r * 0.35, r * 2.5, r * 2.2);
    s.fillStyle(o.cloak, 1).fillEllipse(c, c + r * 0.25, r * 2.2, r * 1.9);
  }
  // tunic
  s.fillStyle(dark(o.tunic), 1).fillCircle(c, c, r);
  s.fillStyle(o.tunic, 1).fillCircle(c, c, r - 1.5);
  s.fillStyle(o.tunicHi ?? 0xffffff, 0.18).fillEllipse(c - r * 0.25, c - r * 0.3, r * 0.9, r * 0.6);
  // belt
  s.fillStyle(dark(o.tunic, 0.8), 0.9).fillRect(c - r * 0.8, c + r * 0.15, r * 1.6, r * 0.22);
  // head
  const hr = r * 0.62, hy = c - r * 0.58;
  const skin = 0xe0b48c;
  if (o.helmet === 'none') {
    s.fillStyle(0x3a2412, 1).fillCircle(c, hy, hr + 1);
    s.fillStyle(skin, 1).fillCircle(c, hy + hr * 0.15, hr * 0.85);
  } else if (o.helmet === 'cap') {
    s.fillStyle(skin, 1).fillCircle(c, hy + hr * 0.2, hr * 0.85);
    s.fillStyle(o.helmetColor ?? 0x6b4a2b, 1).fillCircle(c, hy - hr * 0.05, hr);
    s.fillStyle(dark(o.helmetColor ?? 0x6b4a2b), 1).fillRect(c - hr, hy + hr * 0.1, hr * 2, hr * 0.28);
  } else if (o.helmet === 'hood') {
    s.fillStyle(skin, 1).fillCircle(c, hy + hr * 0.2, hr * 0.8);
    s.fillStyle(o.helmetColor ?? 0x2f4d2e, 1).fillTriangle(c - hr * 1.15, hy + hr * 0.6, c + hr * 1.15, hy + hr * 0.6, c, hy - hr * 1.5);
    s.fillStyle(dark(o.helmetColor ?? 0x2f4d2e), 1).fillRect(c - hr * 0.5, hy + hr * 0.1, hr, hr * 0.25);
  } else {
    // steel helmet (plume/crest add a feather)
    const hc = o.helmetColor ?? PAL.steel;
    s.fillStyle(dark(hc), 1).fillCircle(c, hy, hr + 1);
    s.fillStyle(hc, 1).fillCircle(c, hy, hr);
    s.fillStyle(0xffffff, 0.35).fillEllipse(c - hr * 0.3, hy - hr * 0.35, hr * 0.6, hr * 0.35);
    s.fillStyle(0x15161a, 1).fillRect(c - hr * 0.7, hy + hr * 0.1, hr * 1.4, hr * 0.28); // eye slit
    if (o.helmet === 'plume' || o.helmet === 'crest') {
      const pc = o.plume ?? PAL.dangerHi;
      const tall = o.helmet === 'crest' ? 2.2 : 1.6;
      s.fillStyle(PAL.gold, 1).fillRect(c - hr * 0.9, hy - hr * 0.35, hr * 1.8, hr * 0.22);
      s.fillStyle(pc, 1).fillTriangle(c - hr * 0.35, hy - hr * 0.3, c + hr * 0.35, hy - hr * 0.3, c + hr * 0.2, hy - hr * tall);
      s.fillStyle(dark(pc), 1).fillTriangle(c - hr * 0.1, hy - hr * 0.3, c + hr * 0.35, hy - hr * 0.3, c + hr * 0.2, hy - hr * tall);
    }
  }
  // shield on the left
  if (o.shield) {
    const sx = c - r * 0.95, sy = c + r * 0.05;
    s.fillStyle(0x3a2716, 1).fillCircle(sx, sy, r * 0.55);
    s.fillStyle(0xc9a86a, 1).fillCircle(sx, sy, r * 0.42);
    s.fillStyle(PAL.steel, 1).fillCircle(sx, sy, r * 0.14);
  }
  // weapon on the right
  const wx = c + r * 0.85, wy = c + r * 0.1;
  s.lineStyle(Math.max(2, r * 0.18), 0x4a3218, 1);
  if (o.weapon === 'pitchfork') {
    s.lineBetween(wx - r * 0.1, wy + r * 0.9, wx + r * 0.55, wy - r * 1.3);
    s.lineStyle(Math.max(1.5, r * 0.13), PAL.steel, 1);
    for (const d of [-0.28, 0, 0.28]) s.lineBetween(wx + r * 0.45 + d * r, wy - r * 1.15, wx + r * 0.6 + d * r, wy - r * 1.75);
  } else if (o.weapon === 'sword') {
    s.lineBetween(wx, wy + r * 0.5, wx + r * 0.15, wy - r * 0.1);
    s.lineStyle(Math.max(2, r * 0.2), 0xd9dde4, 1).lineBetween(wx + r * 0.15, wy - r * 0.1, wx + r * 0.55, wy - r * 1.3);
    s.lineStyle(Math.max(1.5, r * 0.16), PAL.gold, 1).lineBetween(wx - r * 0.2, wy - r * 0.05, wx + r * 0.45, wy - r * 0.2);
  } else if (o.weapon === 'bow') {
    s.lineStyle(Math.max(2, r * 0.16), 0x6b4a2b, 1);
    s.beginPath(); s.arc(wx - r * 0.2, wy - r * 0.2, r * 1.05, -1.9, 1.2, false); s.strokePath();
    s.lineStyle(1, 0xf3e9d2, 0.9).lineBetween(wx - r * 0.2 + Math.cos(-1.9) * r * 1.05, wy - r * 0.2 + Math.sin(-1.9) * r * 1.05, wx - r * 0.2 + Math.cos(1.2) * r * 1.05, wy - r * 0.2 + Math.sin(1.2) * r * 1.05);
  } else if (o.weapon === 'spear') {
    s.lineBetween(wx - r * 0.2, wy + r * 1.1, wx + r * 0.5, wy - r * 1.5);
    s.fillStyle(0xd9dde4, 1).fillTriangle(wx + r * 0.32, wy - r * 1.45, wx + r * 0.72, wy - r * 1.35, wx + r * 0.62, wy - r * 2.0);
  } else if (o.weapon === 'halberd') {
    s.lineBetween(wx - r * 0.2, wy + r * 1.2, wx + r * 0.5, wy - r * 1.6);
    s.fillStyle(0xd9dde4, 1).fillTriangle(wx + r * 0.3, wy - r * 1.55, wx + r * 1.0, wy - r * 1.15, wx + r * 0.55, wy - r * 2.1);
    s.fillStyle(PAL.gold, 1).fillRect(wx + r * 0.3, wy - r * 1.35, r * 0.3, r * 0.3);
  }
  s.generateTexture(key, o.size, o.size);
  s.destroy();
}

export function generateTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX.px)) return;

  let gr = g(scene);
  gr.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
  gr.generateTexture(TEX.px, 2, 2);
  gr.destroy();

  // soft shadow under every entity
  gr = g(scene);
  gr.fillStyle(0x000000, 0.35).fillEllipse(24, 12, 48, 24);
  gr.fillStyle(0x000000, 0.35).fillEllipse(24, 12, 34, 16);
  gr.generateTexture(TEX.shadow, 48, 24);
  gr.destroy();

  // ---- the cast (texture sizes leave room for plumes and weapons; physics radii are unchanged)
  figure(scene, TEX.hero,    { size: 48, radius: HERO.radius, tunic: COLORS.hero, helmet: 'steel', helmetColor: 0x8d95a6, weapon: 'sword', cloak: 0x1f4f8a });
  figure(scene, TEX.troop,   { size: 40, radius: 11, tunic: COLORS.troop, helmet: 'cap', weapon: 'sword' });
  figure(scene, TEX.militia, { size: 40, radius: 11, tunic: COLORS.militia, helmet: 'none', weapon: 'pitchfork' });
  figure(scene, TEX.archer,  { size: 40, radius: 10, tunic: COLORS.archer, helmet: 'hood', weapon: 'bow' });
  figure(scene, TEX.captain, { size: 56, radius: 15, tunic: COLORS.captain, helmet: 'plume', weapon: 'spear' });
  figure(scene, TEX.guard,   { size: 44, radius: 12, tunic: 0x5a6a8a, helmet: 'steel', weapon: 'sword', shield: true });
  figure(scene, TEX.boss,    { size: 64, radius: 17, tunic: 0x7a1414, helmet: 'crest', helmetColor: 0xb0b6c4, plume: PAL.goldHi, weapon: 'halberd', shield: true, cloak: 0x4a0c0c });
  // the steppe: fur hats, curved bows, lances (the horse is drawn separately under them)
  figure(scene, TEX.horsearcher, { size: 44, radius: 12, tunic: 0x8a6a3c, helmet: 'cap', helmetColor: 0x4a3a2a, weapon: 'bow' });
  figure(scene, TEX.rider,       { size: 44, radius: 12, tunic: 0x6b5030, helmet: 'cap', helmetColor: 0x3a2a1a, weapon: 'spear', shield: true });
  figure(scene, TEX.noyan,       { size: 56, radius: 16, tunic: 0x9a4a2a, helmet: 'plume', helmetColor: 0x8d95a6, plume: PAL.goldHi, weapon: 'spear', shield: true, cloak: 0x5a2a12 });
  figure(scene, TEX.trooprider,  { size: 40, radius: 11, tunic: 0x7a8a4a, helmet: 'cap', helmetColor: 0x4a3a2a, weapon: 'bow' });

  // arrow: a thin shaft with a bright tip
  gr = g(scene);
  gr.fillStyle(0xe8dcc0, 1).fillRect(0, 1, 14, 2);
  gr.fillStyle(0xffffff, 1).fillRect(11, 0, 4, 4);
  gr.generateTexture(TEX.arrow, 16, 4);
  gr.destroy();

  // coin
  gr = g(scene);
  gr.fillStyle(PAL.goldDeep, 1).fillCircle(6, 6, 6);
  gr.fillStyle(PAL.gold, 1).fillCircle(6, 6, 4.5);
  gr.fillStyle(0xfff3b0, 1).fillCircle(5, 5, 1.6);
  gr.generateTexture(TEX.coin, 12, 12);
  gr.destroy();

  // ring: the War Horn pulse and telegraphs
  gr = g(scene);
  gr.lineStyle(4, 0xffffff, 1).strokeCircle(42, 42, 38);
  gr.generateTexture(TEX.ring, 84, 84);
  gr.destroy();

  // dot: particle
  gr = g(scene);
  gr.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
  gr.generateTexture(TEX.dot, 6, 6);
  gr.destroy();

  // blade: the hero's facing marker; scaled by weapon tier
  gr = g(scene);
  gr.fillStyle(0xdddddd, 1).fillRect(0, 0, 10, 4);
  gr.fillStyle(0xffffff, 1).fillRect(7, 0, 3, 4);
  gr.generateTexture(TEX.blade, 10, 4);
  gr.destroy();

  // slash wedges: one per weapon tier — bigger reach and wider arc as the tier goes up
  WEAPONS.forEach((w, i) => {
    const r = w.reach + HERO.radius + 11;
    const size = r * 2 + 4;
    const c = size / 2;
    const half = Phaser.Math.DegToRad(w.arcDeg / 2);
    const s = g(scene);
    s.fillStyle(0xffffff, 0.35);
    s.slice(c, c, r, -half, half, false);
    s.fillPath();
    s.fillStyle(0xffffff, 0.85);
    s.slice(c, c, r, -half, half, false);
    s.lineStyle(3, 0xffffff, 1);
    s.strokePath();
    s.fillStyle(0xffffff, 0.5);
    s.slice(c, c, r * 0.55, -half * 0.8, half * 0.8, false);
    s.fillPath();
    s.generateTexture(TEX.slash(i + 1), size, size);
    s.destroy();
  });

  for (const [w, h] of HUT_SIZES) obstacleTexture(scene, 'hut', w, h);

  // the horse: an ellipse drawn under a mounted hero so the silhouette reads bigger
  gr = g(scene);
  gr.fillStyle(0x3a2412, 1).fillEllipse(24, 14, 48, 26);
  gr.fillStyle(0x6b4423, 1).fillEllipse(24, 13, 42, 20);
  gr.fillStyle(0x8a5a30, 0.8).fillEllipse(20, 10, 18, 8);
  gr.fillStyle(0x3a2412, 1).fillCircle(44, 10, 6); // head
  gr.generateTexture(TEX.horse, 52, 28);
  gr.destroy();

  // shield marker: a small round shield carried beside the hero
  gr = g(scene);
  gr.fillStyle(0x3a2716, 1).fillCircle(7, 7, 7);
  gr.fillStyle(0xc9a86a, 1).fillCircle(7, 7, 5.5);
  gr.fillStyle(0x7a5a33, 1).fillRect(6, 2, 2, 10).fillRect(2, 6, 10, 2);
  gr.generateTexture(TEX.shield, 14, 14);
  gr.destroy();

  mapIcons(scene);
  campBuildings(scene);
}

/** Huts, rocks, palisade walls, stone walls and the gate of any size, baked on first use. */
export function obstacleTexture(scene: Phaser.Scene, kind: 'hut' | 'rock' | 'wall' | 'stone' | 'gate' | 'yurt', w: number, h: number): string {
  const key = `${kind}_${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const s = g(scene);
  if (kind === 'hut') {
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x6b4a2b, 1).fillRect(3, 3, w - 6, h - 6);
    s.fillStyle(0x8b5e34, 1).fillRect(3, 3, w - 6, Math.floor(h * 0.42));
    s.fillStyle(0x9d6f3f, 1);
    for (let x = 6; x < w - 6; x += 12) s.fillRect(x, 5, 6, Math.floor(h * 0.42) - 4); // thatch lines
    s.fillStyle(0x3a2716, 1).fillRect(Math.floor(w / 2) - 6, h - 16, 12, 13); // door
  } else if (kind === 'yurt') {
    // a round felt tent with a smoke hole and a low door
    s.fillStyle(0x2b1c10, 1).fillCircle(w / 2, h / 2, w / 2);
    s.fillStyle(0xd9cdb2, 1).fillCircle(w / 2, h / 2, w / 2 - 3);
    s.fillStyle(0xc4b394, 1).fillCircle(w / 2, h / 2, w / 2 - 12);
    s.lineStyle(2, 0x8a6a3c, 0.8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s.lineBetween(w / 2, h / 2, w / 2 + Math.cos(a) * (w / 2 - 4), h / 2 + Math.sin(a) * (h / 2 - 4)); }
    s.fillStyle(0x3a2716, 1).fillCircle(w / 2, h / 2, 5);
    s.fillStyle(0x3a2716, 1).fillRect(w / 2 - 6, h - 14, 12, 11);
  } else if (kind === 'rock') {
    s.fillStyle(0x2e302c, 1).fillEllipse(w / 2, h / 2 + 2, w, h - 2);
    s.fillStyle(0x6f726b, 1).fillEllipse(w / 2, h / 2, w - 4, h - 6);
    s.fillStyle(0x9a9d94, 0.7).fillEllipse(w / 2 - w * 0.15, h / 2 - h * 0.18, w * 0.4, h * 0.28);
  } else if (kind === 'stone') {
    s.fillStyle(0x2a2a2e, 1).fillRect(0, 0, w, h);
    s.fillStyle(PAL.steel, 1).fillRect(2, 2, w - 4, h - 4);
    s.fillStyle(0x5f6169, 1);
    for (let y = 8; y < h; y += 16) s.fillRect(2, y, w - 4, 2);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 12 : 2; x < w; x += 20) s.fillRect(x, y + 2, 2, 6);
    s.fillStyle(0x9a9ca6, 1);
    if (w < h) { for (let y = 4; y < h; y += 14) s.fillRect(w / 2 - 6, y, 12, 7); }
    else { for (let x = 4; x < w; x += 14) s.fillRect(x, h / 2 - 6, 7, 12); }
  } else if (kind === 'gate') {
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x8a5e34, 1).fillRect(2, 2, w - 4, h - 4);
    s.fillStyle(0x5a3c1e, 1);
    for (let y = 6; y < h; y += 12) s.fillRect(2, y, w - 4, 2);
    s.fillStyle(0x3b3f46, 1).fillRect(2, h * 0.3, w - 4, 6).fillRect(2, h * 0.7, w - 4, 6);
    s.fillStyle(0xb0b4bc, 1).fillCircle(w / 2, h * 0.3 + 3, 3).fillCircle(w / 2, h * 0.7 + 3, 3);
  } else {
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x7a5a33, 1).fillRect(1, 1, w - 2, h - 2);
    s.fillStyle(0x4a3218, 1);
    if (w < h) { for (let y = 2; y < h; y += 10) s.fillRect(1, y, w - 2, 3); }
    else { for (let x = 2; x < w; x += 10) s.fillRect(x, 1, 3, h - 2); }
  }
  s.generateTexture(key, w, h);
  s.destroy();
  return key;
}

function mapIcons(scene: Phaser.Scene) {
  let s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillTriangle(4, 40, 44, 40, 24, 6);
  s.fillStyle(0x8a6a3c, 1).fillTriangle(8, 38, 40, 38, 24, 10);
  s.fillStyle(0x3a2716, 1).fillTriangle(18, 38, 30, 38, 24, 22);
  s.fillStyle(PAL.ember, 1).fillCircle(46, 36, 5);
  s.fillStyle(PAL.goldHi, 1).fillCircle(46, 35, 2.5);
  s.generateTexture(TEX.mapCamp, 54, 44);
  s.destroy();
  s = g(scene);
  const hutIcon = (x: number, y: number, w: number, h: number) => {
    s.fillStyle(0x2b1c10, 1).fillRect(x, y, w, h);
    s.fillStyle(0x6b4a2b, 1).fillRect(x + 2, y + 2, w - 4, h - 4);
    s.fillStyle(0x8b5e34, 1).fillRect(x + 2, y + 2, w - 4, Math.floor(h * 0.42));
  };
  hutIcon(2, 14, 22, 18); hutIcon(28, 4, 24, 20); hutIcon(34, 26, 20, 16);
  s.generateTexture(TEX.mapVillage, 58, 44);
  s.destroy();
  s = g(scene);
  s.fillStyle(0x2a2a2e, 1).fillRect(0, 12, 66, 40);
  s.fillStyle(PAL.steel, 1).fillRect(3, 15, 60, 34);
  s.fillStyle(0x55575f, 1).fillRect(0, 6, 14, 46).fillRect(52, 6, 14, 46);
  s.fillStyle(0x9a9ca6, 1).fillRect(2, 8, 10, 42).fillRect(54, 8, 10, 42);
  s.fillStyle(0x2a2a2e, 1).fillRect(27, 32, 12, 18);
  s.fillStyle(PAL.danger, 1).fillTriangle(7, 6, 7, 0, 15, 3).fillTriangle(59, 6, 59, 0, 67, 3);
  s.generateTexture(TEX.mapTown, 68, 54);
  s.destroy();
  s = g(scene);
  s.fillStyle(0x1b4f7a, 1).fillRoundedRect(2, 14, 26, 26, 6);
  s.fillStyle(COLORS.hero, 1).fillRoundedRect(4, 16, 22, 22, 5);
  s.fillStyle(0xffffff, 0.25).fillRoundedRect(6, 18, 18, 8, 3);
  s.fillStyle(0xeeeeee, 1).fillRect(26, 0, 2, 22);
  s.fillStyle(PAL.danger, 1).fillTriangle(28, 1, 28, 13, 40, 7);
  s.generateTexture(TEX.mapToken, 42, 42);
  s.destroy();
  s = g(scene);
  s.fillStyle(PAL.dirtDeep, 1).fillCircle(6, 6, 6);
  s.fillStyle(PAL.dirt, 1).fillCircle(6, 6, 4);
  s.generateTexture(TEX.mapCross, 12, 12);
  s.destroy();
  s = g(scene);
  s.lineStyle(4, 0x7a5a33, 1).strokeCircle(30, 30, 24);
  s.fillStyle(0x4a3218, 1);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; s.fillCircle(30 + Math.cos(a) * 24, 30 + Math.sin(a) * 24, 3); }
  s.generateTexture(TEX.mapPalisade, 60, 60);
  s.destroy();
  // a roaming camp: three yurts
  s = g(scene);
  const yurtIcon = (x: number, y: number, r: number) => { s.fillStyle(0x2b1c10, 1).fillCircle(x, y, r + 1.5); s.fillStyle(0xd9cdb2, 1).fillCircle(x, y, r); s.fillStyle(0x3a2716, 1).fillCircle(x, y, 2); };
  yurtIcon(14, 24, 10); yurtIcon(34, 14, 11); yurtIcon(40, 32, 9);
  s.generateTexture(TEX.mapYurts, 54, 44);
  s.destroy();
  // a waypoint: a cairn
  s = g(scene);
  s.fillStyle(0x2e302c, 1).fillEllipse(12, 18, 22, 10);
  s.fillStyle(0x6f726b, 1).fillEllipse(12, 12, 16, 10);
  s.fillStyle(0x9a9d94, 1).fillEllipse(12, 6, 10, 7);
  s.generateTexture(TEX.mapWaypoint, 24, 24);
  s.destroy();
  // the trade camp: a big yurt with a banner
  s = g(scene);
  yurtIcon(24, 26, 16);
  s.fillStyle(0x3a2716, 1).fillRect(38, 2, 3, 26);
  s.fillStyle(PAL.gold, 1).fillTriangle(41, 3, 41, 15, 54, 9);
  s.generateTexture(TEX.mapTrade, 56, 46);
  s.destroy();
  // the border stones
  s = g(scene);
  s.fillStyle(0x5f6169, 1).fillRect(6, 10, 10, 28).fillRect(26, 6, 10, 32);
  s.fillStyle(0x9a9ca6, 1).fillRect(8, 12, 6, 24).fillRect(28, 8, 6, 28);
  s.generateTexture(TEX.mapGate, 44, 40);
  s.destroy();
}

function campBuildings(scene: Phaser.Scene) {
  // forge: dark stone, chimney, a hearth of glowing coals
  let s = g(scene);
  s.fillStyle(0x1e1b1b, 1).fillRect(0, 0, 160, 110);
  s.fillStyle(0x4a4646, 1).fillRect(3, 3, 154, 104);
  s.fillStyle(0x2e2a2a, 1).fillRect(3, 3, 154, 40);
  s.fillStyle(0x5c5858, 1);
  for (let y = 8; y < 40; y += 10) for (let x = (y / 10) % 2 ? 14 : 6; x < 150; x += 22) s.fillRect(x, y, 16, 6);
  s.fillStyle(0x3a3636, 1).fillRect(118, 0, 24, 30);
  s.fillStyle(0x1a1616, 1).fillRect(52, 52, 56, 54); // hearth mouth
  s.fillStyle(PAL.emberDeep, 1).fillRect(56, 66, 48, 38);
  s.fillStyle(PAL.ember, 1).fillRect(60, 74, 40, 30);
  s.fillStyle(PAL.goldHi, 1).fillRect(66, 82, 28, 20);
  s.fillStyle(0xfff3b0, 0.9).fillCircle(74, 92, 4).fillCircle(88, 90, 3);
  s.fillStyle(0x2b2b2b, 1).fillRect(14, 80, 30, 14); // anvil
  s.fillStyle(0x6a6a6a, 1).fillRect(10, 76, 38, 6);
  s.generateTexture(TEX.forge, 160, 110);
  s.destroy();
  // barracks: timber with a big banner
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillRect(0, 0, 170, 110);
  s.fillStyle(0x6b4a2b, 1).fillRect(3, 3, 164, 104);
  s.fillStyle(0x8b5e34, 1).fillRect(3, 3, 164, 42);
  s.fillStyle(0x9d6f3f, 1);
  for (let x = 8; x < 164; x += 12) s.fillRect(x, 5, 6, 38);
  s.fillStyle(0x3a2716, 1).fillRect(24, 74, 24, 32).fillRect(122, 74, 24, 32);
  s.fillStyle(PAL.dangerDeep, 1).fillRect(72, 30, 26, 60);
  s.fillStyle(PAL.danger, 1).fillRect(74, 32, 22, 56);
  s.fillStyle(PAL.danger, 1).fillTriangle(74, 88, 96, 88, 85, 100);
  s.fillStyle(PAL.gold, 1).fillCircle(85, 56, 7);
  s.fillStyle(PAL.goldDeep, 1).fillRect(66, 28, 38, 4);
  s.generateTexture(TEX.barracks, 170, 110);
  s.destroy();
  // stables: open front with horse heads over the doors, hay, a fence
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillRect(0, 0, 180, 110);
  s.fillStyle(0x7a5a33, 1).fillRect(3, 3, 174, 104);
  s.fillStyle(0x9a7040, 1).fillRect(3, 3, 174, 36);
  s.fillStyle(0xab7f4c, 1);
  for (let x = 8; x < 174; x += 12) s.fillRect(x, 5, 6, 32);
  s.fillStyle(0x3a2716, 1).fillRect(20, 44, 60, 62).fillRect(100, 44, 60, 62);
  const head = (x: number, y: number, col: number) => {
    s.fillStyle(col, 1).fillRoundedRect(x - 12, y - 10, 24, 22, 6);
    s.fillStyle(col, 1).fillTriangle(x - 11, y - 8, x - 4, y - 8, x - 9, y - 20).fillTriangle(x + 4, y - 8, x + 11, y - 8, x + 9, y - 20);
    s.fillStyle(0xd9cbb0, 1).fillRoundedRect(x - 6, y + 2, 12, 10, 3);
    s.fillStyle(0x15161a, 1).fillCircle(x - 5, y - 2, 2).fillCircle(x + 5, y - 2, 2);
  };
  head(50, 64, 0x6b4423); head(130, 64, 0x3a2412);
  s.fillStyle(0xd9b24a, 1).fillCircle(50, 96, 9).fillCircle(130, 96, 9);
  s.fillStyle(0xc9a86a, 1);
  for (let x = 8; x < 180; x += 20) s.fillRect(x, 96, 4, 14);
  s.generateTexture(TEX.stables, 180, 110);
  s.destroy();
  // inn: a tavern with a lit window and a hanging sign
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillRect(0, 0, 160, 110);
  s.fillStyle(0x8a6a3c, 1).fillRect(3, 3, 154, 104);
  s.fillStyle(0xa27a45, 1).fillRect(3, 3, 154, 40);
  s.fillStyle(0xb58a52, 1);
  for (let x = 8; x < 154; x += 12) s.fillRect(x, 5, 6, 36);
  s.fillStyle(0x3a2716, 1).fillRect(66, 70, 28, 36);
  s.fillStyle(PAL.goldHi, 1).fillRect(20, 60, 26, 22).fillRect(114, 60, 26, 22);
  s.fillStyle(0x3a2716, 1).fillRect(32, 60, 2, 22).fillRect(126, 60, 2, 22).fillRect(20, 70, 26, 2).fillRect(114, 70, 26, 2);
  s.fillStyle(0x3a2716, 1).fillRect(130, 30, 4, 22);
  s.fillStyle(PAL.parchment, 1).fillRoundedRect(118, 44, 30, 16, 4);
  s.fillStyle(PAL.ember, 1).fillCircle(133, 52, 4);
  s.generateTexture(TEX.inn, 160, 110);
  s.destroy();
  // tent, campfire, signpost (kept for the map/camp vignettes)
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillTriangle(0, 50, 60, 50, 30, 4);
  s.fillStyle(0x8a6a3c, 1).fillTriangle(4, 48, 56, 48, 30, 8);
  s.fillStyle(0x3a2716, 1).fillTriangle(22, 48, 38, 48, 30, 28);
  s.generateTexture(TEX.tent, 60, 52);
  s.destroy();
  s = g(scene);
  s.fillStyle(0x3a2716, 1).fillRect(2, 20, 26, 5).fillRect(6, 24, 20, 4);
  s.fillStyle(PAL.ember, 1).fillCircle(15, 14, 10);
  s.fillStyle(PAL.goldHi, 1).fillCircle(15, 15, 6);
  s.fillStyle(0xfff3b0, 1).fillCircle(15, 16, 2.5);
  s.generateTexture(TEX.campfire, 30, 30);
  s.destroy();
  s = g(scene);
  s.fillStyle(0x3a2716, 1).fillRect(10, 8, 6, 34);
  s.fillStyle(0x8a6a3c, 1).fillRect(0, 6, 30, 14);
  s.fillStyle(0x2b1c10, 1).fillTriangle(30, 6, 30, 20, 36, 13);
  s.generateTexture(TEX.signpost, 36, 42);
  s.destroy();
}

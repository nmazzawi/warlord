// WorldChart.ts — the world as an aged parchment chart: one stylized, compressed Earth. Land and the
// twelve culture regions are hand-placed polygons (jittered when drawn so they look inked by hand),
// the oceans carry hatching, a compass rose and sea creatures, and the locked sea roads are dashed.
import Phaser from 'phaser';
import { PAL } from '../scenes/ui';
import { mulberry32 } from '../utils/rng';

export const CHART = { w: 3000, h: 1800, texScale: 0.5 };

export type Pt = [number, number];
export interface Region {
  id: string; name: string; tint: number; poly: Pt[]; note: string;
  enterable: boolean; territory?: 'homeland' | 'steppe';
}

/** Filler land (neutral parchment): the Americas, Eurasia + Africa, Japan's islands, Britain. */
export const LAND: Pt[][] = [
  [[260, 260], [480, 200], [680, 300], [740, 500], [680, 680], [600, 780], [640, 950], [700, 1150], [640, 1400], [560, 1620], [470, 1700], [400, 1520], [360, 1300], [280, 1120], [330, 980], [270, 860], [200, 700], [190, 470]],
  [[1120, 300], [1300, 220], [1550, 170], [1780, 210], [2050, 180], [2350, 200], [2650, 240], [2900, 330], [2960, 560], [2880, 760], [2760, 920], [2650, 1060], [2560, 1180], [2470, 1200], [2380, 1120], [2260, 1220], [2230, 1340], [2120, 1300], [2040, 1420], [1980, 1600], [1880, 1680], [1760, 1580], [1660, 1420], [1560, 1260], [1440, 1140], [1330, 1040], [1220, 940], [1130, 780], [1090, 600], [1100, 430]],
  [[2960, 660], [3060, 690], [3100, 800], [3020, 890], [2940, 830], [2920, 720]],
  [[1180, 360], [1260, 340], [1290, 420], [1230, 470], [1170, 440]],
];

export const REGIONS: Region[] = [
  { id: 'viking', name: 'The Viking North', tint: 0x9fb4c8, poly: [[1420, 240], [1560, 190], [1700, 230], [1740, 380], [1640, 470], [1500, 460], [1420, 360]], note: 'Longships strike any coast — the sea is their highway. One day, the Longship Update.', enterable: false },
  { id: 'rus', name: 'Rus', tint: 0xa9c1a0, poly: [[1760, 300], [2000, 260], [2180, 320], [2140, 500], [2020, 600], [1820, 560], [1740, 430]], note: 'Winter punishes invaders. Heavy axes, shield walls, wooden kremlins that burn.', enterable: false },
  { id: 'homeland', name: 'The Borderland', tint: 0xd9c48a, poly: [[2140, 520], [2350, 500], [2440, 600], [2420, 740], [2300, 800], [2160, 780], [2110, 660]], note: 'A small kingdom nobody bothered to name, wedged between Rus and the steppe. Yours to take.', enterable: true, territory: 'homeland' },
  { id: 'mongolia', name: 'Mongolia', tint: 0xd6c39a, poly: [[2400, 420], [2600, 360], [2800, 420], [2820, 600], [2680, 700], [2520, 720], [2450, 640]], note: 'Rolling steppe. No fixed villages — camps that move, riders who shoot at a gallop.', enterable: true, territory: 'steppe' },
  { id: 'china', name: 'China', tint: 0xd9a8a8, poly: [[2620, 720], [2860, 700], [2920, 880], [2800, 1000], [2620, 980], [2560, 860]], note: 'Mass and technology: repeating crossbows, halberd blocks, war drums, the biggest walled cities anywhere.', enterable: false },
  { id: 'japan', name: 'Japan', tint: 0xe0b0b8, poly: [[2960, 660], [3060, 690], [3100, 800], [3020, 890], [2940, 830], [2920, 720]], note: 'Few but elite. Samurai who accept duels; ninja who strike at night.', enterable: false },
  { id: 'india', name: 'India', tint: 0xd9b57a, poly: [[2400, 1020], [2560, 1020], [2620, 1140], [2540, 1260], [2440, 1240], [2380, 1120]], note: 'War elephants that trample lines — and rampage into whoever is nearest when panicked.', enterable: false },
  { id: 'persia', name: 'Persia', tint: 0xc9a6c2, poly: [[2160, 840], [2400, 800], [2440, 940], [2340, 1040], [2180, 1020], [2120, 920]], note: 'The Immortals replace their losses overnight. Satrapies, and the Royal Road.', enterable: false },
  { id: 'arabia', name: 'Arabia', tint: 0xe0d29a, poly: [[1960, 1080], [2160, 1040], [2200, 1200], [2100, 1300], [1960, 1260], [1920, 1160]], note: 'The richest trade cities, desert that starves armies, assassin guilds for hire, camels that panic horses.', enterable: false },
  { id: 'egypt', name: 'Egypt', tint: 0xe3cc8f, poly: [[1740, 1120], [1920, 1100], [1940, 1280], [1860, 1360], [1740, 1300], [1700, 1200]], note: 'Chariots rule open ground; the Nile feeds armies; the richest loot per settlement.', enterable: false },
  { id: 'greece', name: 'Greece', tint: 0xa8c5d9, poly: [[1560, 900], [1700, 880], [1760, 1000], [1680, 1080], [1560, 1060], [1520, 980]], note: 'Phalanx walls unbreakable from the front, weak on the flanks; feuding city-states you can hire against each other.', enterable: false },
  { id: 'rome', name: 'Rome', tint: 0xd0a68c, poly: [[1320, 860], [1500, 840], [1560, 960], [1480, 1080], [1340, 1060], [1280, 960]], note: 'Discipline. Testudo against arrows, pilum volleys, the best siegecraft, roads that speed every march.', enterable: false },
  { id: 'aztecs', name: 'The Aztecs', tint: 0xa8c8a0, poly: [[420, 980], [600, 960], [680, 1100], [600, 1260], [460, 1280], [380, 1140]], note: 'Across the western ocean. Flower wars: defeat means capture for sacrifice, and an escape instead of a death.', enterable: false },
];

/** Dashed sea roads — locked until ships exist. */
export const SEA_ROUTES: Array<{ id: string; name: string; pts: Pt[] }> = [
  { id: 'west', name: 'The western crossing', pts: [[1420, 300], [1100, 340], [820, 420], [700, 520]] },
  { id: 'cape', name: 'Around the cape', pts: [[1840, 1400], [1760, 1720], [2050, 1760], [2350, 1500], [2480, 1300]] },
  { id: 'japan', name: 'The eastern sea', pts: [[2900, 900], [2960, 860]] },
];

export const SEA_CREATURES: Array<{ x: number; y: number; kind: 'serpent' | 'kraken' | 'whale'; scale: number }> = [
  { x: 950, y: 1350, kind: 'serpent', scale: 1.2 }, { x: 2550, y: 1600, kind: 'kraken', scale: 1 }, { x: 900, y: 620, kind: 'whale', scale: 0.9 }, { x: 2500, y: 1420, kind: 'whale', scale: 0.7 },
];
export const COMPASS = { x: 360, y: 1520, r: 110 };

export function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const [px, py] of poly) { x += px; y += py; }
  return [x / poly.length, y / poly.length];
}
export function pointInPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function regionAt(x: number, y: number): Region | null {
  for (const r of REGIONS) if (pointInPoly(x, y, r.poly)) return r;
  return null;
}
export function distToPolyline(x: number, y: number, pts: Pt[]) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Phaser.Math.Clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/** Subdivide and wobble a polygon so it looks inked by hand (deterministic). */
function wobble(poly: Pt[], rnd: () => number, amp: number, steps = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t + (rnd() - 0.5) * amp, ay + (by - ay) * t + (rnd() - 0.5) * amp]);
    }
  }
  return out;
}
function mix(a: number, b: number, t: number) {
  const ca = Phaser.Display.Color.ValueToColor(a), cb = Phaser.Display.Color.ValueToColor(b);
  return Phaser.Display.Color.GetColor(Math.round(ca.red + (cb.red - ca.red) * t), Math.round(ca.green + (cb.green - ca.green) * t), Math.round(ca.blue + (cb.blue - ca.blue) * t));
}

/** Bakes the whole chart once, at half resolution, into a texture. */
export function chartTexture(scene: Phaser.Scene): string {
  const key = 'world_chart';
  if (scene.textures.exists(key)) return key;
  const S = CHART.texScale;
  const rnd = mulberry32(777);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const P = (pts: Pt[]) => pts.map(([x, y]) => new Phaser.Geom.Point(x * S, y * S));
  const SEA = 0xa8b59a, SEA_DEEP = 0x8fa08c, PARCH = 0xe4d3ad, INK = 0x3a2a18;
  // ocean: parchment-washed sea with hatching and a few deeper washes
  g.fillStyle(SEA, 1).fillRect(0, 0, CHART.w * S, CHART.h * S);
  for (let i = 0; i < 70; i++) {
    g.fillStyle(SEA_DEEP, 0.18).fillEllipse(rnd() * CHART.w * S, rnd() * CHART.h * S, (60 + rnd() * 240) * S, (30 + rnd() * 120) * S);
  }
  g.lineStyle(1, INK, 0.08);
  for (let y = 10; y < CHART.h * S; y += 9) {
    for (let x = (y / 9) % 2 ? 18 : 0; x < CHART.w * S; x += 36) g.lineBetween(x, y, x + 14 + rnd() * 6, y + 1);
  }
  // land: filler first, then regions; each with a hand-inked outline
  const ink = (poly: Pt[], width = 1.6, alpha = 0.9) => {
    const w = wobble(poly, rnd, 8);
    g.lineStyle(width * S * 2, INK, alpha).strokePoints(P(w), true, true);
    g.lineStyle(0.8 * S * 2, 0xfff3d0, 0.35).strokePoints(P(wobble(poly, rnd, 5).map(([x, y]) => [x + 2, y + 2] as Pt)), true, true);
  };
  for (const land of LAND) {
    const w = wobble(land, rnd, 10);
    g.fillStyle(PARCH, 1).fillPoints(P(w), true, true);
    g.fillStyle(0xd5c193, 0.5);
    for (let i = 0; i < 40; i++) { const [cx, cy] = land[Math.floor(rnd() * land.length)]; g.fillCircle((cx + (rnd() - 0.5) * 120) * S, (cy + (rnd() - 0.5) * 120) * S, (20 + rnd() * 50) * S); }
  }
  for (const r of REGIONS) {
    const w = wobble(r.poly, rnd, 7);
    const col = r.enterable ? mix(PARCH, r.tint, 0.75) : mix(PARCH, r.tint, 0.42);
    g.fillStyle(col, 1).fillPoints(P(w), true, true);
    // relief: a few hill strokes / dunes / mountains as tiny ink marks
    g.lineStyle(1.2 * S * 2, INK, r.enterable ? 0.35 : 0.22);
    const [cx, cy] = centroid(r.poly);
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd() - 0.5) * 140, y = cy + (rnd() - 0.5) * 100 + 40;
      if (pointInPoly(x, y, r.poly)) { g.lineBetween(x * S, y * S, (x + 10) * S, (y - 8) * S); g.lineBetween((x + 10) * S, (y - 8) * S, (x + 20) * S, y * S); }
    }
  }
  for (const land of LAND) ink(land, 1.8, 0.9);
  for (const r of REGIONS) ink(r.poly, 1.1, r.enterable ? 0.8 : 0.45);
  // sea roads, dashed
  g.lineStyle(1.4 * S * 2, INK, 0.5);
  for (const route of SEA_ROUTES) {
    for (let i = 1; i < route.pts.length; i++) {
      const [ax, ay] = route.pts[i - 1], [bx, by] = route.pts[i];
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let d = 0; d < len; d += 22) g.lineBetween((ax + ux * d) * S, (ay + uy * d) * S, (ax + ux * Math.min(len, d + 11)) * S, (ay + uy * Math.min(len, d + 11)) * S);
    }
  }
  // sea creatures
  for (const c of SEA_CREATURES) creature(g, c.x * S, c.y * S, c.kind, c.scale * S, INK);
  // compass rose
  compass(g, COMPASS.x * S, COMPASS.y * S, COMPASS.r * S, INK, PAL.danger);
  // a worn border and a vignette
  g.lineStyle(6 * S * 2, INK, 0.5).strokeRect(4 * S, 4 * S, (CHART.w - 8) * S, (CHART.h - 8) * S);
  g.lineStyle(1.5 * S * 2, INK, 0.4).strokeRect(16 * S, 16 * S, (CHART.w - 32) * S, (CHART.h - 32) * S);
  g.fillStyle(0x5a4a2e, 0.14).fillRect(0, 0, CHART.w * S, 40 * S).fillRect(0, (CHART.h - 40) * S, CHART.w * S, 40 * S);
  g.generateTexture(key, Math.ceil(CHART.w * S), Math.ceil(CHART.h * S));
  g.destroy();
  return key;
}

function creature(g: Phaser.GameObjects.Graphics, x: number, y: number, kind: 'serpent' | 'kraken' | 'whale', s: number, ink: number) {
  g.lineStyle(2.2 * s, ink, 0.8);
  if (kind === 'serpent') {
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(x + i * 48 * s, y, 22 * s, Math.PI, 0, false); g.strokePath();
    }
    g.fillStyle(ink, 0.8).fillTriangle(x - 30 * s, y - 4 * s, x - 22 * s, y - 26 * s, x - 6 * s, y - 8 * s);
    g.fillCircle(x - 20 * s, y - 14 * s, 2 * s);
  } else if (kind === 'kraken') {
    g.fillStyle(ink, 0.75).fillEllipse(x, y - 10 * s, 40 * s, 34 * s);
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(x + i * 12 * s, y + 18 * s, 14 * s, Math.PI, i % 2 ? 0 : Math.PI * 1.9, i % 2 === 0); g.strokePath(); }
    g.fillStyle(0xe4d3ad, 1).fillCircle(x - 8 * s, y - 12 * s, 4 * s).fillCircle(x + 8 * s, y - 12 * s, 4 * s);
  } else {
    g.fillStyle(ink, 0.7).fillEllipse(x, y, 60 * s, 22 * s);
    g.fillTriangle(x + 26 * s, y, x + 44 * s, y - 14 * s, x + 44 * s, y + 12 * s);
    g.lineBetween(x - 6 * s, y - 12 * s, x - 6 * s, y - 30 * s); g.lineBetween(x - 6 * s, y - 30 * s, x - 16 * s, y - 40 * s); g.lineBetween(x - 6 * s, y - 30 * s, x + 4 * s, y - 40 * s);
  }
}

function compass(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, ink: number, red: number) {
  g.lineStyle(2, ink, 0.7).strokeCircle(x, y, r);
  g.lineStyle(1, ink, 0.5).strokeCircle(x, y, r * 0.72);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.lineStyle(1, ink, 0.5).lineBetween(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  const star = (len: number, col: number, rot: number) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2, b = a + Math.PI / 2;
      g.fillStyle(col, 0.9).fillTriangle(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos((a + b) / 2) * len * 0.22, y + Math.sin((a + b) / 2) * len * 0.22);
      g.fillStyle(col, 0.55).fillTriangle(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos((a - Math.PI / 4)) * len * 0.22, y + Math.sin((a - Math.PI / 4)) * len * 0.22);
    }
  };
  star(r * 0.55, ink, Math.PI / 4);
  star(r * 0.9, ink, 0);
  g.fillStyle(red, 0.9).fillTriangle(x, y, x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5);
  g.fillStyle(red, 0.9).fillTriangle(x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5, x, y - r * 0.95);
}

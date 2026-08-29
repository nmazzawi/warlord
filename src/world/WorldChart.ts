// WorldChart.ts — the world as an aged parchment atlas. The coastlines are real Earth (see geo.ts and
// AtlasData.ts): the Mediterranean and the Italian boot, Scandinavia, Arabia, India's triangle, the
// Japanese islands, the Americas across the western ocean. Every realm on it is a named empire with a
// tint, a throne and settlements of its own — the ones you cannot reach yet are drawn muted, as a
// promise. The sea, its hatching, its creatures and the compass rose are baked into one texture; the
// land, the empires and the ink outlines are drawn as vectors so they stay sharp at any zoom.
import Phaser from 'phaser';
import { PAL } from '../scenes/ui';
import { mulberry32 } from '../utils/rng';
import { CHART, ll, type Pt } from './geo';
import { ATLAS_EMPIRES, COASTS, COVER, EXTRA_CREATURES, RANGES, RIVERS, SEAS, TRADE_LANES, type AtlasPlace } from './AtlasData';

export { CHART } from './geo';
export type { Pt } from './geo';

export interface Region {
  id: string; name: string; tint: number; poly: Pt[]; note: string; throne: string;
  places: AtlasPlace[]; enterable: boolean; territory?: 'homeland' | 'steppe';
  /** Where the realm's name is written — placed by hand, the way a cartographer would, to keep the
   *  crowded Old World legible when the whole Earth is on screen. */
  labelAt: Pt;
}

/** One tint per realm — all of them washed-out enough to read as ink on parchment. */
const TINTS: Record<string, number> = {
  rome: 0xcf9c7e, greece: 0x9dc0d9, viking: 0x9ab1c8, rus: 0x9fbd94, mongolia: 0xcfb87f,
  china: 0xd79f9f, japan: 0xdfa7b1, india: 0xd8a55e, persia: 0xc59cbf, arabia: 0xd6c07c,
  egypt: 0xd9b45f, aztecs: 0x93c08d, kush: 0xc98f63, inca: 0xb0a6d4,
};

/** Where each realm's name sits (longitude, latitude) — open ground, clear of its neighbours. */
const LABEL_AT: Record<string, [number, number]> = {
  rome: [2, 46], greece: [22, 35.5], viking: [8, 58.5], rus: [42, 59], mongolia: [102, 48],
  china: [111, 29], japan: [131.5, 44], india: [80, 19], persia: [59, 34], arabia: [47, 24],
  egypt: [23.5, 27.5], kush: [31.5, 13.5], aztecs: [-104, 17], inca: [-72, -21],
};

/** The one realm that is not a real place: a nameless borderland east of Rus, west of the grass. */
const BORDERLAND: Pt[] = ([
  [55.2, 55.0], [59.0, 55.4], [63.4, 55.2], [67.4, 54.2], [68.4, 52.0],
  [67.2, 49.4], [63.0, 48.2], [58.6, 48.5], [55.0, 49.8], [54.0, 52.4],
] as Array<[number, number]>).map(([lon, lat]) => ll(lon, lat));

export const REGIONS: Region[] = [
  ...ATLAS_EMPIRES.map(e => ({
    id: e.id, name: e.name, tint: TINTS[e.id] ?? 0xd9c9a0, poly: e.poly, note: e.note, throne: e.throne,
    places: e.places, enterable: e.id === 'mongolia',
    territory: e.id === 'mongolia' ? ('steppe' as const) : undefined,
    labelAt: LABEL_AT[e.id] ? ll(LABEL_AT[e.id][0], LABEL_AT[e.id][1]) : centroid(e.poly),
  })),
  {
    id: 'homeland', name: 'The Borderland', tint: 0xd9c48a, poly: BORDERLAND, throne: '', places: [],
    note: 'A small kingdom nobody bothered to name, wedged between Rus and the steppe. No title, no throne, no allies. Yours to take.',
    enterable: true, territory: 'homeland', labelAt: centroid(BORDERLAND),
  },
];

/** Dashed sea roads — locked until ships exist. */
export const SEA_ROUTES: Array<{ id: string; name: string; pts: Pt[] }> = ([
  { id: 'west', name: 'The western crossing', pts: [[-10, 36], [-28, 32], [-48, 26], [-64, 17], [-73, 14.5], [-83, 16], [-87, 18]] },
  { id: 'cape', name: 'Around the cape', pts: [[-10.5, 35], [-14, 29], [-19, 20], [-21, 12], [-12, 0], [3, -15], [10, -28], [19, -38], [30, -36], [45, -30], [55, -12], [68, 8]] },
  { id: 'japan', name: 'The eastern sea', pts: [[129.6, 36.6], [131.5, 36.5], [132.8, 35.9]] },
  { id: 'north', name: 'The whale road', pts: [[3.5, 58.5], [-2, 60.5], [-9, 62], [-17, 62.5]] },
] as Array<{ id: string; name: string; pts: Array<[number, number]> }>)
  .map(r => ({ ...r, pts: r.pts.map(([lon, lat]) => ll(lon, lat)) }));

export const SEA_CREATURES: Array<{ xy: Pt; kind: 'serpent' | 'kraken' | 'whale'; scale: number }> = ([
  { lon: -42, lat: 8, kind: 'serpent', scale: 1.3 },
  { lon: 78, lat: -22, kind: 'kraken', scale: 1.15 },
  { lon: -34, lat: 47, kind: 'whale', scale: 1 },
  { lon: 140, lat: 4, kind: 'whale', scale: 0.85 },
  { lon: -45, lat: -32, kind: 'serpent', scale: 0.9 },
] as Array<{ lon: number; lat: number; kind: 'serpent' | 'kraken' | 'whale'; scale: number }>)
  .map(c => ({ xy: ll(c.lon, c.lat), kind: c.kind, scale: c.scale }));

export const COMPASS = { xy: ll(-33, -22), r: 210 };

// ---------------------------------------------------------------- geometry helpers
export function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const [px, py] of poly) { x += px; y += py; }
  return [x / poly.length, y / poly.length];
}
export function bbox(poly: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
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
  // a realm you can walk into always wins: the Borderland must never be shadowed by a giant neighbour
  let other: Region | null = null;
  for (const r of REGIONS) {
    if (!pointInPoly(x, y, r.poly)) continue;
    if (r.enterable) return r;
    other ??= r;
  }
  return other;
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

// ---------------------------------------------------------------- drawing
// The whole chart is painted ONCE into a canvas texture: an aged sea, the land, every realm's tint
// clipped to the coast, the ink, the sea roads, the monsters and the rose. Painting it as a texture
// (rather than leaving it as live vector shapes) is what keeps the map at full frame rate on a phone —
// vector shapes are re-tessellated every single frame. The only shapes still drawn live are the
// borders of the two realms you can actually walk into, so they stay razor sharp when you dive in.
const SEA = 0xa8b59a, SEA_DEEP = 0x8fa08c, PARCH = 0xe4d3ad, INK = 0x3a2a18;
/** Land nobody has claimed, and the blue-grey a cartographer keeps for water. */
const FOG = 0x8a7346, RIVER_INK = 0x5d7a72;
/** Portolan rhumb lines fan out from these points in the open sea. */
const RHUMB_HUBS: Array<[number, number]> = [[-35, 20], [-28, -26], [72, -8], [138, -14], [-95, 40]];
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Jitter a ring so it looks inked by hand, keeping every real cape exactly where it belongs. */
function inked(pts: Pt[], rnd: () => number, amp: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    out.push([ax + (rnd() - 0.5) * amp, ay + (rnd() - 0.5) * amp]);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.min(6, Math.floor(len / 45));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t + (rnd() - 0.5) * amp * 1.8, ay + (by - ay) * t + (rnd() - 0.5) * amp * 1.8]);
    }
  }
  return out;
}
function mix(a: number, b: number, t: number) {
  const ca = Phaser.Display.Color.ValueToColor(a), cb = Phaser.Display.Color.ValueToColor(b);
  return Phaser.Display.Color.GetColor(
    Math.round(ca.red + (cb.red - ca.red) * t), Math.round(ca.green + (cb.green - ca.green) * t), Math.round(ca.blue + (cb.blue - ca.blue) * t));
}
function trace(ctx: CanvasRenderingContext2D, pts: Pt[], close = true) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

/** Is this spot land? The same nonzero winding rule the canvas fill uses. */
function landAt(x: number, y: number, rings: Pt[][]) {
  let w = 0;
  for (const poly of rings) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi <= y) { if (yj > y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) > 0) w++; }
      else if (yj <= y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) < 0) w--;
    }
  }
  return w !== 0;
}

/** Paints the entire chart into one canvas texture and returns its key. */
export function chartTexture(scene: Phaser.Scene): string {
  const key = 'world_chart';
  if (scene.textures.exists(key)) return key;
  const S = CHART.texScale;
  const W = Math.ceil(CHART.w * S), H = Math.ceil(CHART.h * S);
  const canvas = scene.textures.createCanvas(key, W, H);
  if (!canvas) return key;
  const ctx = canvas.getContext();
  const rnd = mulberry32(777);
  ctx.setTransform(S, 0, 0, S, 0, 0);          // draw in chart units; the transform bakes the scale in
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. the sea: a flat wash, deeper blooms, hand hatching, and a portolan's rhumb lines
  ctx.fillStyle = css(SEA);
  ctx.fillRect(0, 0, CHART.w, CHART.h);
  ctx.fillStyle = css(SEA_DEEP, 0.16);
  for (let i = 0; i < 90; i++) {
    ctx.beginPath();
    ctx.ellipse(rnd() * CHART.w, rnd() * CHART.h, 100 + rnd() * 420, 50 + rnd() * 220, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = css(INK, 0.07);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let y = 30; y < CHART.h; y += 30) {
    for (let x = (y / 30) % 2 ? 60 : 0; x < CHART.w; x += 120) { ctx.moveTo(x, y); ctx.lineTo(x + 46 + rnd() * 20, y + 3); }
  }
  ctx.stroke();
  ctx.strokeStyle = css(INK, 0.055);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [lon, lat] of RHUMB_HUBS) {
    const [hx, hy] = ll(lon, lat);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(a) * 2400, hy + Math.sin(a) * 2400);
    }
  }
  ctx.stroke();

  // 2. the land
  const coasts = COASTS.map(c => inked(c.pts, rnd, 2.4));
  const landPath = () => { ctx.beginPath(); for (const pts of coasts) trace(ctx, pts); };
  landPath();
  ctx.fillStyle = css(PARCH);
  ctx.fill();

  // 3. the geography a cartographer draws before anyone claims anything: ground cover, rivers, ranges
  ctx.save();
  landPath();
  ctx.clip();
  ctx.fillStyle = css(0xd5c193, 0.45);
  for (const pts of coasts) {
    for (let i = 0; i < 26; i++) {
      const [cx, cy] = pts[Math.floor(rnd() * pts.length)];
      ctx.beginPath();
      ctx.arc(cx + (rnd() - 0.5) * 200, cy + (rnd() - 0.5) * 200, 30 + rnd() * 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const c of COVER) groundCover(ctx, c, rnd);
  for (const r of RIVERS) river(ctx, r);
  for (const r of RANGES) range(ctx, r);
  ctx.restore();

  // 4. terra incognita: land nobody has claimed goes under an old, empty wash. Painted on a scratch
  //    canvas so the realms can be *erased* out of the fog whatever order or overlap they are in.
  const fogCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (fogCanvas) {
    fogCanvas.width = W;
    fogCanvas.height = H;
    const fx = fogCanvas.getContext('2d');
    if (fx) {
      fx.setTransform(S, 0, 0, S, 0, 0);
      fx.beginPath();
      for (const pts of coasts) trace(fx, pts);
      fx.clip();
      fx.fillStyle = css(FOG, 0.42);
      fx.fillRect(0, 0, CHART.w, CHART.h);
      fx.fillStyle = css(0x6b5a38, 0.13);
      for (let i = 0; i < 3200; i++) {
        const x = rnd() * CHART.w, y = rnd() * CHART.h;
        fx.fillRect(x, y, 3, 3);
      }
      fx.globalCompositeOperation = 'destination-out';
      for (const r of REGIONS) { fx.beginPath(); trace(fx, inked(r.poly, mulberry32(9), 7)); fx.fill(); }
      ctx.drawImage(fogCanvas, 0, 0, CHART.w, CHART.h);
    }
  }

  // 5. and where the fog is widest, the old warning
  const unclaimed = (x: number, y: number) => landAt(x, y, coasts) && !REGIONS.some(r => pointInPoly(x, y, r.poly));
  const roomFor = (x: number, y: number, r: number) => {
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      if (!unclaimed(x + Math.cos(t) * r, y + Math.sin(t) * r)) return false;
    }
    return true;
  };
  const empty: Pt[] = [];
  for (let x = 520; x < CHART.w - 520; x += 80) {
    for (let y = 420; y < CHART.h - 420; y += 80) {
      if (!unclaimed(x, y) || !roomFor(x, y, 240)) continue;
      if (empty.some(([px, py]) => Math.hypot(px - x, py - y) < 900)) continue;
      empty.push([x, y]);
    }
  }
  ctx.textAlign = 'center';
  empty.forEach(([x, y], i) => {
    if (i % 2 === 1 && roomFor(x, y, 230)) {
      ctx.fillStyle = css(INK, 0.34);
      ctx.font = 'italic 40px Cinzel, Georgia, serif';
      ctx.fillText('HIC SVNT DRACONES', x, y);
    } else {
      dragon(ctx, x, y, 0.9 + (i % 3) * 0.25, INK, rnd);
    }
  });

  // 6. every realm's claim, clipped inside the coast — which is what makes a border trace a coastline
  ctx.save();
  landPath();
  ctx.clip();
  for (const r of REGIONS) {
    const w = inked(r.poly, rnd, 7);
    ctx.fillStyle = css(mix(PARCH, r.tint, r.enterable ? 0.88 : 0.76), r.enterable ? 0.9 : 0.84);
    ctx.beginPath();
    trace(ctx, w);
    ctx.fill();
  }
  for (const r of REGIONS) {
    ctx.beginPath();
    trace(ctx, inked(r.poly, mulberry32(9), 7));
    ctx.strokeStyle = css(INK, r.enterable ? 0.85 : 0.6);
    ctx.lineWidth = 3.4;
    ctx.stroke();
  }
  ctx.restore();

  // 7. inland seas punched back out of the land
  for (const s of SEAS) {
    const w = inked(s.pts, rnd, 2);
    ctx.beginPath();
    trace(ctx, w);
    ctx.fillStyle = css(SEA);
    ctx.fill();
    ctx.strokeStyle = css(INK, 0.5);
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  // 8. the coast over the top of everything
  ctx.strokeStyle = css(0xfff3d0, 0.3);
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (const pts of coasts) trace(ctx, pts.map(([x, y]) => [x + 5, y + 5] as Pt));
  ctx.stroke();
  ctx.strokeStyle = css(INK, 0.85);
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const pts of coasts) trace(ctx, pts);
  ctx.stroke();

  // 9. the sea roads and the trade lanes nobody can sail yet, and the things that live out there
  ctx.setLineDash([34, 26]);
  ctx.strokeStyle = css(INK, 0.45);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const route of SEA_ROUTES) trace(ctx, route.pts, false);
  ctx.stroke();
  ctx.setLineDash([14, 20]);
  ctx.strokeStyle = css(INK, 0.3);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const lane of TRADE_LANES) trace(ctx, lane.pts, false);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const c of SEA_CREATURES) creature(ctx, c.xy[0], c.xy[1], c.kind, c.scale * 2.2, INK);
  for (const c of EXTRA_CREATURES) creature(ctx, c.xy[0], c.xy[1], c.kind as 'serpent' | 'kraken' | 'whale', c.scale * 2.2, INK);
  compass(ctx, COMPASS.xy[0], COMPASS.xy[1], COMPASS.r, INK, PAL.danger);

  // 10. the worn frame of the chart itself
  ctx.strokeStyle = css(INK, 0.5);
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, CHART.w - 22, CHART.h - 22);
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK, 0.4);
  ctx.strokeRect(46, 46, CHART.w - 92, CHART.h - 92);
  ctx.fillStyle = css(0x5a4a2e, 0.12);
  ctx.fillRect(0, 0, CHART.w, 70);
  ctx.fillRect(0, CHART.h - 70, CHART.w, 70);

  canvas.refresh();
  return key;
}

/** A river, drawn from its mouth (broad) to its source (a hair). */
function river(ctx: CanvasRenderingContext2D, r: { size: number; pts: Pt[] }) {
  const w0 = 2.5 + r.size * 3;
  ctx.strokeStyle = css(RIVER_INK, 0.72);
  for (let i = 1; i < r.pts.length; i++) {
    const t = i / (r.pts.length - 1);
    ctx.lineWidth = Math.max(1, w0 * (1 - t * 0.78));
    ctx.beginPath();
    ctx.moveTo(r.pts[i - 1][0], r.pts[i - 1][1]);
    ctx.lineTo(r.pts[i][0], r.pts[i][1]);
    ctx.stroke();
  }
}

/** A mountain chain: little peaks marching along the crest. */
function range(ctx: CanvasRenderingContext2D, r: { size: number; pts: Pt[] }) {
  const h = 9 + r.size * 5, step = 16 + r.size * 5;
  ctx.strokeStyle = css(INK, 0.38);
  ctx.lineWidth = 1.8 + r.size * 0.45;
  ctx.beginPath();
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / (len || 1), uy = (by - ay) / (len || 1);
    for (let d = 0; d < len; d += step) {
      const x = ax + ux * d, y = ay + uy * d;
      ctx.moveTo(x - h * 0.7, y + h * 0.35);
      ctx.lineTo(x, y - h * 0.65);
      ctx.lineTo(x + h * 0.7, y + h * 0.35);
    }
  }
  ctx.stroke();
}

/** Ground cover: desert stipple, forest scatter, steppe ticks, marsh reeds. */
function groundCover(ctx: CanvasRenderingContext2D, c: { kind: string; pts: Pt[] }, rnd: () => number) {
  const b = bbox(c.pts);
  const density = c.kind === 'desert' ? 3400 : c.kind === 'forest' ? 3000 : c.kind === 'steppe' ? 2800 : 2000;
  const n = Phaser.Math.Clamp(Math.round((b.w * b.h) / density), 40, 1400);
  ctx.strokeStyle = css(INK, c.kind === 'forest' ? 0.32 : 0.26);
  ctx.fillStyle = css(INK, 0.28);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = b.x0 + rnd() * b.w, y = b.y0 + rnd() * b.h;
    if (!pointInPoly(x, y, c.pts)) continue;
    if (c.kind === 'desert') {
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      if (rnd() < 0.3) { ctx.moveTo(x - 9, y + 6); ctx.lineTo(x + 1, y + 6); }
    } else if (c.kind === 'forest') {
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x, y - 3);
      ctx.moveTo(x - 4, y + 1);
      ctx.lineTo(x, y - 6);
      ctx.lineTo(x + 4, y + 1);
    } else if (c.kind === 'steppe') {
      ctx.moveTo(x - 4, y + 3);
      ctx.lineTo(x, y - 3);
      ctx.moveTo(x + 4, y + 3);
      ctx.lineTo(x + 1, y - 2);
    } else {
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x - 4, y + 5);
      ctx.lineTo(x + 4, y + 5);
    }
  }
  ctx.stroke();
}

/** Here be dragons. */
function dragon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ink: number, rnd: () => number) {
  const k = 26 * s;
  ctx.strokeStyle = css(ink, 0.42);
  ctx.fillStyle = css(ink, 0.42);
  ctx.lineWidth = 2.6 * s;
  ctx.beginPath();                                   // a serpentine body
  ctx.moveTo(x - k * 1.6, y + k * 0.5);
  ctx.quadraticCurveTo(x - k * 0.6, y - k * 0.9, x + k * 0.2, y);
  ctx.quadraticCurveTo(x + k * 0.9, y + k * 0.8, x + k * 1.7, y - k * 0.2);
  ctx.stroke();
  ctx.beginPath();                                   // wings
  ctx.moveTo(x - k * 0.2, y - k * 0.15);
  ctx.lineTo(x - k * 0.5, y - k * 1.1);
  ctx.lineTo(x + k * 0.45, y - k * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();                                   // head and jaw
  ctx.moveTo(x + k * 1.7, y - k * 0.2);
  ctx.lineTo(x + k * 2.2, y - k * 0.55);
  ctx.lineTo(x + k * 1.75, y - k * 0.6);
  ctx.closePath();
  ctx.fill();
  if (rnd() < 0.5) {                                 // a tail fin, sometimes
    ctx.beginPath();
    ctx.moveTo(x - k * 1.6, y + k * 0.5);
    ctx.lineTo(x - k * 2.1, y + k * 0.2);
    ctx.lineTo(x - k * 1.9, y + k * 0.95);
    ctx.closePath();
    ctx.fill();
  }
}

export interface ChartLayers { setInkZoom(zoom: number): void; }

/** The borders of the realms you can actually walk into, kept as live vectors so that they stay sharp
 *  when you zoom right in on your own roads. Two outlines: cheap enough to redraw on a zoom change. */
export function drawChart(scene: Phaser.Scene): ChartLayers {
  const g = scene.add.graphics().setDepth(0.5);
  const rings = REGIONS.filter(r => r.enterable).map(r => inked(r.poly, mulberry32(9), 7));
  let band = -1;
  const redraw = (zoom: number) => {
    const b = zoom < 0.9 ? 0 : zoom < 1.8 ? 1 : 2;
    if (b === band) return;
    band = b;
    const k = [2.2, 1.2, 0.6][b];
    g.clear();
    for (const pts of rings) {
      g.lineStyle(3 * k, INK, 0.8).strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true, true);
    }
  };
  redraw(1);
  return { setInkZoom: redraw };
}

function creature(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'serpent' | 'kraken' | 'whale', s: number, ink: number) {
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  };
  ctx.strokeStyle = css(ink, 0.75);
  ctx.lineWidth = 2.2 * s;
  if (kind === 'serpent') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(x + i * 48 * s - 22 * s, y); ctx.arc(x + i * 48 * s, y, 22 * s, Math.PI, 0, false); }
    ctx.stroke();
    ctx.fillStyle = css(ink, 0.75);
    tri(x - 30 * s, y - 4 * s, x - 22 * s, y - 26 * s, x - 6 * s, y - 8 * s);
  } else if (kind === 'kraken') {
    ctx.fillStyle = css(ink, 0.7);
    ctx.beginPath(); ctx.ellipse(x, y - 10 * s, 20 * s, 17 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) { ctx.moveTo(x + i * 12 * s - 14 * s, y + 18 * s); ctx.arc(x + i * 12 * s, y + 18 * s, 14 * s, Math.PI, i % 2 ? 0 : Math.PI * 1.9, i % 2 === 0); }
    ctx.stroke();
    ctx.fillStyle = css(0xe4d3ad);
    ctx.beginPath(); ctx.arc(x - 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = css(ink, 0.65);
    ctx.beginPath(); ctx.ellipse(x, y, 30 * s, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
    tri(x + 26 * s, y, x + 44 * s, y - 14 * s, x + 44 * s, y + 12 * s);
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y - 12 * s); ctx.lineTo(x - 6 * s, y - 30 * s);
    ctx.lineTo(x - 16 * s, y - 40 * s); ctx.moveTo(x - 6 * s, y - 30 * s); ctx.lineTo(x + 4 * s, y - 40 * s);
    ctx.stroke();
  }
}

function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: number, red: number) {
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  };
  ctx.strokeStyle = css(ink, 0.6);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(ink, 0.45);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
  const star = (len: number, col: number, rot: number) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2, b = a + Math.PI / 2;
      ctx.fillStyle = css(col, 0.85);
      tri(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos((a + b) / 2) * len * 0.22, y + Math.sin((a + b) / 2) * len * 0.22);
      ctx.fillStyle = css(col, 0.5);
      tri(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos(a - Math.PI / 4) * len * 0.22, y + Math.sin(a - Math.PI / 4) * len * 0.22);
    }
  };
  star(r * 0.55, ink, Math.PI / 4);
  star(r * 0.9, ink, 0);
  ctx.fillStyle = css(red, 0.85);
  tri(x, y, x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5);
  tri(x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5, x, y - r * 0.95);
}

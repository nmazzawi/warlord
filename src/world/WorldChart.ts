// WorldChart.ts — what the world IS: its realms, where each one's name is written, the sea roads and
// the monsters. How it gets drawn lives next door in ChartPainter.ts, which paints this geometry at
// whatever zoom you are looking from.
// The world as an aged parchment atlas. The coastlines are real Earth (see geo.ts and
// AtlasData.ts): the Mediterranean and the Italian boot, Scandinavia, Arabia, India's triangle, the
// Japanese islands, the Americas across the western ocean. Every realm on it is a named empire with a
// tint, a throne and settlements of its own — the ones you cannot reach yet are drawn muted, as a
// promise. The sea, its hatching, its creatures and the compass rose are baked into one texture; the
// land, the empires and the ink outlines are drawn as vectors so they stay sharp at any zoom.
import Phaser from 'phaser';
import { ll, type Pt } from './geo';
import { ATLAS_EMPIRES, type AtlasPlace } from './AtlasData';

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

// build-atlas.mjs — turns the hand-authored geography packs (real longitude/latitude, one JSON file
// per landmass and per pair of empires) into src/world/AtlasData.ts: the same shapes projected once
// into chart coordinates. Run it whenever a pack changes:  node tools/build-atlas.mjs <packs-dir>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/build-atlas.mjs <packs-dir>'); process.exit(1); }

// the projection constants come straight out of geo.ts so the two can never drift apart
const geo = readFileSync(join(ROOT, 'src/world/geo.ts'), 'utf8');
const grab = (name) => {
  const m = geo.match(new RegExp(`export const ${name} = (\\{[^}]+\\})`));
  if (!m) throw new Error(`geo.ts: could not find ${name}`);
  return eval(`(${m[1]})`);
};
const CHART = grab('CHART'), PROJ = grab('PROJ');
const rad = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-84, Math.min(84, lat)) * rad) / 2));
const MY0 = mercY(PROJ.lat0);
const KY = (PROJ.y1 - PROJ.y0) / (MY0 - mercY(PROJ.lat1));
const KX = (PROJ.x1 - PROJ.x0) / (PROJ.lon1 - PROJ.lon0);
const r1 = (n) => Math.round(n * 10) / 10;
const ll = (lon, lat) => [
  r1(PROJ.x0 + (clampLon(lon) - PROJ.lon0) * KX),
  r1(PROJ.y0 + (MY0 - mercY(clampLat(lat))) * KY),
];
const clampLon = (v) => Math.max(PROJ.lon0, Math.min(PROJ.lon1, v));
const clampLat = (v) => Math.max(PROJ.lat1, Math.min(PROJ.lat0, v));

/** Every land ring must wind the same way: they are all traced into ONE canvas path and filled with the
 *  nonzero rule, so a ring wound the other way punches a hole where it overlaps its neighbour (which is
 *  exactly what the Suez isthmus does to Africa and Asia). */
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};
const sameWinding = (pts) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

/** Segments meet at the same named cape, so the join shows up twice; a duplicated point makes a
 *  zero-length edge that reads as a self-crossing (and inks a stray tick). Drop the repeats. */
const dedupe = (pts) => {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.5) out.push(p);
  }
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1.5) out.pop();
  return out;
};

/** A coast that leaves the chart's window is clamped onto its edge. Several capes in a row clamped to
 *  the same edge make the ring run out and back along one line — zero area, but a visible ink whisker
 *  poking into the sea. Keep only where such a run enters and leaves the edge. */
const trimEdgeRuns = (pts) => {
  const onEdge = (p) => (Math.abs(p[1] - PROJ.y0) < 0.6 ? 'top' : Math.abs(p[1] - PROJ.y1) < 0.6 ? 'bottom'
    : Math.abs(p[0] - PROJ.x0) < 0.6 ? 'left' : Math.abs(p[0] - PROJ.x1) < 0.6 ? 'right' : '');
  const out = [];
  for (let i = 0; i < pts.length;) {
    const edge = onEdge(pts[i]);
    if (!edge) { out.push(pts[i++]); continue; }
    let j = i;
    while (j + 1 < pts.length && onEdge(pts[j + 1]) === edge) j++;
    if (j - i >= 2) { out.push(pts[i], pts[j]); } else { for (let k = i; k <= j; k++) out.push(pts[k]); }
    i = j + 1;
  }
  return out;
};

const files = readdirSync(SRC).filter(f => f.endsWith('.json'));
const packs = {};
for (const f of files) {
  try { packs[f] = JSON.parse(readFileSync(join(SRC, f), 'utf8')); }
  catch (e) { console.error(`! ${f}: ${e.message}`); process.exitCode = 1; }
}

const byPrefix = (pre) => Object.entries(packs).filter(([f]) => f.startsWith(pre));

/** Every segment we were given, by its id. */
const segs = new Map();
for (const [file, data] of Object.entries(packs)) {
  for (const s of data.segments ?? []) {
    const pts = (s.points ?? []).map(p => (Array.isArray(p) ? p : [p.lon, p.lat]))
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) { console.warn(`! ${file}: segment ${s.id} has ${pts.length} points`); continue; }
    segs.set(s.id, { id: s.id, closed: !!s.closed, pts, file });
  }
}
const take = (id) => {
  const s = segs.get(id);
  if (!s) throw new Error(`missing coastline segment "${id}" — is its pack written?`);
  segs.delete(id);
  return s.pts;
};

// ---- the Old World is one ring: the Mediterranean's north shore, round Asia, the Arctic, home down
// ---- the Atlantic. The pieces were authored to meet at named capes, so they simply concatenate.
const eurasia = [
  ...take('med_north'),
  ...take('asia_south'),
  [PROJ.lon1, 58], [PROJ.lon1, 71],          // clipped off the chart's eastern edge
  ...take('asia_arctic'),
  ...take('europe_atlantic'),
];
// Africa is its own ring; a short isthmus at Suez stitches the two together the way the land does
const SUEZ = [[32.3, 30.4], [34.3, 31.3], [34.6, 29.4], [32.4, 29.3]];

const land = [{ id: 'eurasia', pts: eurasia }, { id: 'suez', pts: SUEZ }];
for (const [id, s] of [...segs]) {
  if (!s.closed) { console.warn(`! unused open segment "${id}" from ${s.file}`); segs.delete(id); continue; }
  if (id.startsWith('black_sea') || id.endsWith('_sea') || id.startsWith('lake_')) continue;
  land.push({ id, pts: s.pts });
  segs.delete(id);
}
const seas = [...segs.values()].map(s => ({ id: s.id, pts: s.pts }));

// ---- a real port sits exactly on a coast the chart only approximates, so a city can land a few units
// ---- out to sea. Walk any such settlement to the nearest bit of land rather than leaving it afloat.
const landRings = land.map(l => sameWinding(dedupe(trimEdgeRuns(l.pts.map(([lon, lat]) => ll(lon, lat))))));
const onLand = (x, y) => {
  let w = 0;
  for (const poly of landRings) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi <= y) { if (yj > y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) > 0) w++; }
      else if (yj <= y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) < 0) w--;
    }
  }
  return w !== 0;
};
let nudged = 0;
const ashore = (xy, name) => {
  if (onLand(xy[0], xy[1])) return xy;
  for (let r = 3; r <= 60; r += 3) {
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const p = [r1(xy[0] + Math.cos(t) * r), r1(xy[1] + Math.sin(t) * r)];
      if (onLand(p[0], p[1])) { nudged++; return p; }
    }
  }
  console.warn(`! ${name} is in open water and could not be brought ashore`);
  return xy;
};

// ---- realms claim their historical extents: the extent packs replace a realm's outline, and may
// ---- introduce a realm of their own (with its own name, note, throne and settlements)
const extents = new Map();
for (const [, data] of byPrefix('extent-')) for (const e of data.empires ?? []) extents.set(e.id, e);

// ---- the empires
const empires = [];
const seen = new Set();
for (const [file, data] of byPrefix('empire-')) {
  for (const e of data.empires ?? []) {
    const ext = extents.get(e.id);
    const src = ext?.poly?.length >= 3 ? ext : e;
    const poly = (src.poly ?? []).map(p => (Array.isArray(p) ? p : [p.lon, p.lat]));
    if (poly.length < 3) { console.warn(`! ${file}: empire ${e.id} has no polygon`); continue; }
    seen.add(e.id);
    empires.push({
      id: e.id, name: e.name, note: e.note, throne: e.throne,
      poly: poly.map(([lon, lat]) => ll(lon, lat)),
      places: (e.places ?? []).map(p => ({ name: p.name, kind: p.kind, xy: ashore(ll(p.lon, p.lat), p.name), note: p.note })),
    });
  }
}
for (const [id, e] of extents) {
  if (seen.has(id)) continue;                        // a realm that exists only in an extent pack
  const poly = (e.poly ?? []).map(p => (Array.isArray(p) ? p : [p.lon, p.lat]));
  if (poly.length < 3 || !e.name) { console.warn(`! new realm ${id} is missing a polygon or a name`); continue; }
  empires.push({
    id, name: e.name, note: e.note, throne: e.throne,
    poly: poly.map(([lon, lat]) => ll(lon, lat)),
    places: (e.places ?? []).map(p => ({ name: p.name, kind: p.kind, xy: ashore(ll(p.lon, p.lat), p.name), note: p.note })),
  });
}

// ---- the ink under the tints: rivers run mouth to source, ranges are crest lines, cover is stippled
const pts2 = (arr) => (arr ?? []).map(p => (Array.isArray(p) ? p : [p.lon, p.lat])).map(([lon, lat]) => ll(lon, lat));
const rivers = byPrefix('ink-').flatMap(([, d]) => (d.rivers ?? []).map(r => ({ name: r.name, size: r.size ?? 2, pts: pts2(r.points) }))).filter(r => r.pts.length > 1);
const ranges = byPrefix('ink-').flatMap(([, d]) => (d.ranges ?? []).map(r => ({ name: r.name, size: r.size ?? 2, pts: pts2(r.points) }))).filter(r => r.pts.length > 1);
const cover = byPrefix('ink-').flatMap(([, d]) => (d.cover ?? []).map(c => ({ name: c.name, kind: c.kind, pts: pts2(c.poly) }))).filter(c => c.pts.length > 2);
const creatures = Object.values(packs).flatMap(d => (d.creatures ?? []).map(c => ({ kind: c.kind, scale: c.scale ?? 1, xy: ll(c.lon, c.lat) })));
const lanes = Object.values(packs).flatMap(d => (d.lanes ?? []).map(l => ({ name: l.name, pts: pts2(l.points) }))).filter(l => l.pts.length > 1);

const fmt = (pts) => `[${pts.map(([x, y]) => `[${x},${y}]`).join(',')}]`;
const esc = (s) => JSON.stringify(String(s ?? ''));
const out = `// AtlasData.ts — GENERATED by tools/build-atlas.mjs. Do not edit by hand.
// Real Earth geography (longitude/latitude, authored as named capes, ports and cities) projected once
// into chart coordinates. Regenerate with:  node tools/build-atlas.mjs <packs-dir>
import type { Pt } from './geo';

export type PlaceKind = 'capital' | 'city' | 'town' | 'village';
export interface AtlasPlace { name: string; kind: PlaceKind; x: number; y: number; note: string; }
export interface AtlasEmpire { id: string; name: string; note: string; throne: string; poly: Pt[]; places: AtlasPlace[]; }

/** Coastlines: every landmass as a closed ring. */
export const COASTS: Array<{ id: string; pts: Pt[] }> = [
${land.map(l => `  { id: ${esc(l.id)}, pts: ${fmt(sameWinding(dedupe(trimEdgeRuns(l.pts.map(([lon, lat]) => ll(lon, lat))))))} },`).join('\n')}
];

/** Inland seas: drawn back over the land in the sea colour. */
export const SEAS: Array<{ id: string; pts: Pt[] }> = [
${seas.map(s => `  { id: ${esc(s.id)}, pts: ${fmt(s.pts.map(([lon, lat]) => ll(lon, lat)))} },`).join('\n')}
];

/** Rivers (mouth first), mountain crests, and ground cover — the ink that goes under the realm tints. */
export const RIVERS: Array<{ name: string; size: number; pts: Pt[] }> = [
${rivers.map(r => `  { name: ${esc(r.name)}, size: ${r.size}, pts: ${fmt(r.pts)} },`).join('\n')}
];
export const RANGES: Array<{ name: string; size: number; pts: Pt[] }> = [
${ranges.map(r => `  { name: ${esc(r.name)}, size: ${r.size}, pts: ${fmt(r.pts)} },`).join('\n')}
];
export const COVER: Array<{ name: string; kind: string; pts: Pt[] }> = [
${cover.map(c => `  { name: ${esc(c.name)}, kind: ${esc(c.kind)}, pts: ${fmt(c.pts)} },`).join('\n')}
];
/** Extra sea monsters and the dashed trade lanes no ship of yours can follow yet. */
export const EXTRA_CREATURES: Array<{ kind: string; scale: number; xy: Pt }> = [
${creatures.map(c => `  { kind: ${esc(c.kind)}, scale: ${c.scale}, xy: [${c.xy[0]},${c.xy[1]}] },`).join('\n')}
];
export const TRADE_LANES: Array<{ name: string; pts: Pt[] }> = [
${lanes.map(l => `  { name: ${esc(l.name)}, pts: ${fmt(l.pts)} },`).join('\n')}
];

export const ATLAS_EMPIRES: AtlasEmpire[] = [
${empires.map(e => `  {
    id: ${esc(e.id)}, name: ${esc(e.name)}, throne: ${esc(e.throne)},
    note: ${esc(e.note)},
    poly: ${fmt(e.poly)},
    places: [
${e.places.map(p => `      { name: ${esc(p.name)}, kind: ${esc(p.kind)} as PlaceKind, x: ${p.xy[0]}, y: ${p.xy[1]}, note: ${esc(p.note)} },`).join('\n')}
    ],
  },`).join('\n')}
];
`;
writeFileSync(join(ROOT, 'src/world/AtlasData.ts'), out);

const pts = land.reduce((n, l) => n + l.pts.length, 0) + seas.reduce((n, s) => n + s.pts.length, 0);
console.log(`AtlasData.ts: ${land.length} landmasses, ${seas.length} inland seas, ${pts} coast points, ${empires.length} empires, ${empires.reduce((n, e) => n + e.places.length, 0)} places`);
if (nudged) console.log(`${nudged} coastal settlement(s) nudged ashore`);
console.log(`ink: ${rivers.length} rivers, ${ranges.length} ranges, ${cover.length} cover areas, ${creatures.length} extra creatures, ${lanes.length} trade lanes`);
console.log(`chart ${CHART.w}x${CHART.h}, lon ${PROJ.lon0}..${PROJ.lon1}, lat ${PROJ.lat0}..${PROJ.lat1}`);

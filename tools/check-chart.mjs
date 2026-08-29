// check-chart.mjs — a lint for the world chart. Catches the mistakes that are invisible in code and
// obvious on screen: a sea road inked across a continent, a sea monster beached on Argentina, a city
// in the water, a foreign city inside your own borderland, a coastline ring wound the wrong way (which
// punches a hole in the map where two rings overlap).  Run: node tools/check-chart.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --- the same projection the game uses
const geo = read('src/world/geo.ts');
const grab = (src, name) => {
  const m = src.match(new RegExp(`export const ${name} = (\\{[^}]+\\})`));
  if (!m) throw new Error(`could not find ${name}`);
  return eval(`(${m[1]})`);
};
const PROJ = grab(geo, 'PROJ');
const rad = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-84, Math.min(84, lat)) * rad) / 2));
const MY0 = mercY(PROJ.lat0);
const KY = (PROJ.y1 - PROJ.y0) / (MY0 - mercY(PROJ.lat1));
const KX = (PROJ.x1 - PROJ.x0) / (PROJ.lon1 - PROJ.lon0);
const ll = (lon, lat) => [PROJ.x0 + (lon - PROJ.lon0) * KX, PROJ.y0 + (MY0 - mercY(lat)) * KY];

// --- the generated geography
const atlas = read('src/world/AtlasData.ts');
const rings = (block) => [...block.matchAll(/\{ id: "([^"]+)", pts: (\[\[[^\]]*\](?:,\[[^\]]*\])*\]) \}/g)]
  .map(m => ({ id: m[1], pts: eval(m[2]) }));
const COASTS = rings(atlas.slice(atlas.indexOf('export const COASTS'), atlas.indexOf('export const SEAS')));
const EMPIRES = [...atlas.matchAll(/id: "([a-z_]+)", name: "([^"]*)"[\s\S]*?poly: (\[\[[^\]]*\](?:,\[[^\]]*\])*\]),\s*places: \[([\s\S]*?)\n    \],/g)]
  .map(m => ({
    id: m[1], name: m[2], poly: eval(m[3]),
    places: [...m[4].matchAll(/name: "([^"]*)", kind: "([a-z]+)" as PlaceKind, x: ([-\d.]+), y: ([-\d.]+)/g)]
      .map(p => ({ name: p[1], kind: p[2], x: +p[3], y: +p[4] })),
  }));

// --- the hand-placed decoration, still in longitude/latitude
const chart = read('src/world/WorldChart.ts');
const ROUTES = [...chart.matchAll(/\{ id: '([a-z]+)', name: '([^']+)', pts: (\[\[[^\]]*\](?:, \[[^\]]*\])*\]) \}/g)]
  .map(m => ({ id: m[1], name: m[2], pts: eval(m[3]).map(([lon, lat]) => ll(lon, lat)) }));
const CREATURES = [...chart.matchAll(/\{ lon: ([-\d.]+), lat: ([-\d.]+), kind: '([a-z]+)'/g)]
  .map(m => ({ kind: m[3], xy: ll(+m[1], +m[2]) }));
const COMPASS = (() => { const m = chart.match(/COMPASS = \{ xy: ll\((-?[\d.]+), (-?[\d.]+)\)/); return m ? ll(+m[1], +m[2]) : null; })();

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** The nonzero winding rule the canvas uses: land where the windings do not cancel. */
const onLand = (x, y) => {
  let w = 0;
  for (const c of COASTS) {
    const poly = c.pts;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi <= y) { if (yj > y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) > 0) w++; }
      else if (yj <= y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) < 0) w--;
    }
  }
  return w !== 0;
};
const area = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return a / 2; };

let bad = 0;
const fail = (msg) => { console.log(`FAIL ${msg}`); bad++; };
const pass = (msg) => console.log(`ok   ${msg}`);

// 1. all land rings wind the same way, or overlapping rings cancel into holes
const wrong = COASTS.filter(c => area(c.pts) < 0).map(c => c.id);
wrong.length ? fail(`coastline rings wound the wrong way: ${wrong.join(', ')}`) : pass(`${COASTS.length} coastline rings all wind the same way`);

// 2. the Suez isthmus really joins Africa to Asia
const suez = [[3150, 1470], [3161, 1476], [3170, 1490]].filter(([x, y]) => !onLand(x, y));
suez.length ? fail(`a hole in the land at Suez (${suez.length}/3 sample points are sea)`) : pass('Africa and Asia are joined at Suez');

// 3. no sea road is inked across a continent
for (const r of ROUTES) {
  let onland = 0, total = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d <= len; d += 6) { total++; if (onLand(ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len)) onland++; }
  }
  const pct = Math.round((onland / total) * 100);
  onland > 2 ? fail(`sea road "${r.name}" crosses land (${pct}% of it)`) : pass(`sea road "${r.name}" stays at sea`);
}

// 4. monsters and the rose live in open water
for (const c of CREATURES) if (onLand(c.xy[0], c.xy[1])) fail(`a ${c.kind} is beached at ${c.xy.map(Math.round)}`);
if (COMPASS && onLand(COMPASS[0], COMPASS[1])) fail('the compass rose sits on land');
pass(`${CREATURES.length} sea creatures and the rose are at sea`);

// 5. every settlement is on land, and no foreign city stands inside a realm you can walk into
const walkable = ['mongolia'];
for (const e of EMPIRES) {
  for (const p of e.places) {
    if (!onLand(p.x, p.y)) fail(`${p.name} (${e.name}) stands in the sea`);
    for (const other of EMPIRES) {
      if (other.id === e.id || !walkable.includes(other.id)) continue;
      if (inPoly(p.x, p.y, other.poly)) fail(`${p.name} (${e.name}) stands inside ${other.name}`);
    }
  }
}
const names = EMPIRES.flatMap(e => e.places.map(p => p.name));
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
dupes.length ? fail(`two places share a name: ${[...new Set(dupes)].join(', ')}`) : pass(`${names.length} settlements, every name unique`);

const segsCross = (p1, p2, p3, p4) => {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
};

// 6a. no coastline ring crosses itself (a bowtie fills water as land and knots the ink)
const selfCrosses = (poly) => {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return [i, j];
    }
  }
  return null;
};

// 6. no empire polygon crosses itself (regionAt would report the wrong realm)
for (const c of COASTS) {
  const x = selfCrosses(c.pts);
  if (x) fail(`the "${c.id}" coastline crosses itself (edges ${x[0]} and ${x[1]}: ${c.pts[x[0]]} and ${c.pts[x[1]]})`);
}
pass(`${COASTS.length} coastlines checked for self-crossing`);
for (const e of EMPIRES) {
  const x = selfCrosses(e.poly);
  if (x) fail(`${e.name}'s border crosses itself (edges ${x[0]} and ${x[1]})`);
}
pass(`${EMPIRES.length} realm borders checked for self-crossing`);

// 7. realms must not overlap: overlapping claims make regionAt() ambiguous and the fog cancel itself
const sample = (poly, n = 160) => {
  const b = poly.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [1e9, 1e9, -1e9, -1e9]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = b[0] + ((i * 37) % 100) / 100 * (b[2] - b[0]);
    const y = b[1] + ((i * 61) % 100) / 100 * (b[3] - b[1]);
    if (inPoly(x, y, poly)) out.push([x, y]);
  }
  return out;
};
for (let i = 0; i < EMPIRES.length; i++) {
  for (let j = i + 1; j < EMPIRES.length; j++) {
    const a = EMPIRES[i], b = EMPIRES[j];
    const pts = sample(a.poly);
    const hits = pts.filter(([x, y]) => inPoly(x, y, b.poly) && onLand(x, y));
    if (hits.length > pts.length * 0.04) fail(`${a.name} and ${b.name} overlap (${Math.round((hits.length / Math.max(1, pts.length)) * 100)}% of ${a.name}'s land)`);
  }
}
pass(`${EMPIRES.length} realms checked for overlap`);

// 8. the fiction says the Borderland touches the Mongols
const home = chart.match(/const BORDERLAND: Pt\[\] = \(\[([\s\S]*?)\] as Array/);
if (home) {
  const ring = eval(`[${home[1]}]`).map(([lon, lat]) => ll(lon, lat));
  const mongolia = EMPIRES.find(e => e.id === 'mongolia');
  if (!mongolia) fail('there is no Mongol realm on the chart');
  else {
    const shared = ring.filter(p => mongolia.poly.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2));
    shared.length >= 2
      ? pass(`the Borderland and the Mongol Khanates share a real border (${shared.length} points)`)
      : fail(`the Borderland and the Mongol Khanates do not touch (${shared.length} shared points)`);
  }
}

// 9. the ink must lie on land, and there should not be too much of the world left unclaimed
const inkBlock = atlas.slice(atlas.indexOf('export const RIVERS'), atlas.indexOf('export const EXTRA_CREATURES'));
const lines = [...inkBlock.matchAll(/\{ name: "([^"]*)", (?:size: \d+|kind: "[a-z]+"), pts: (\[\[[^\]]*\](?:,\[[^\]]*\])*\]) \}/g)]
  .map(m => ({ name: m[1], pts: eval(m[2]) }));
let strayed = 0;
for (const l of lines) {
  const off = l.pts.filter(([x, y]) => !onLand(x, y)).length;
  if (off > Math.max(2, l.pts.length * 0.34)) { fail(`"${l.name}" is mostly drawn in the sea (${off}/${l.pts.length} points)`); strayed++; }
}
if (!strayed) pass(`${lines.length} rivers, ranges and cover areas all sit on land`);

let land = 0, claimed = 0;
for (let x = 100; x < 5400; x += 40) {
  for (let y = 100; y < 3240; y += 40) {
    if (!onLand(x, y)) continue;
    land++;
    if (EMPIRES.some(e => inPoly(x, y, e.poly)) || inPoly(x, y, eval(`[${(chart.match(/const BORDERLAND: Pt\[\] = \(\[([\s\S]*?)\] as Array/) || [0, '[0,0]'])[1]}]`).map(([lon, lat]) => ll(lon, lat)))) claimed++;
  }
}
console.log(`ok   ${Math.round((claimed / land) * 100)}% of the world's land belongs to someone (the rest is terra incognita)`);

console.log(bad ? `\n${bad} PROBLEM(S)` : '\nchart is clean');
process.exit(bad ? 1 : 0);

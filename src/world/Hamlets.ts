// Hamlets.ts — the fringe every country actually had. The atlas names thrones, great cities and the
// towns between them, because that is what a cartographer draws; it does not name the three huts on
// the border where the road stops being a road. A realm with no fringe is a realm a new warband
// cannot touch, so each one gets three: placed out on its own edge, on land, clear of everything
// already there, and named the way that country names a small place.
import { ll, type Pt } from './geo';
import { REGIONS } from './WorldChart';
import { isLand, nearestLand } from './Terrain';

/** Three small places per country, in its own tongue. Nothing grand — a ford, a well, a stockade. */
const NAMES: Record<string, [string, string, string]> = {
  rome: ['Ad Fines', 'Vicus Petra', 'Castra Vetera'],
  greece: ['Oinoe', 'Kryoneri', 'Phyle'],
  japan: ['Sekiyado', 'Kawagoe', 'Yamashiro-no-Seki'],
  china: ['Yumen Post', 'Baishui', 'Liangzhou Ford'],
  mongolia: ['Ulaan Ford', 'Bayan Wells', 'Kherlen Crossing'],
  rus: ['Brody', 'Zaseka', 'Peresechen'],
  arabia: ['Bir Sada', 'Qasr al-Milh', 'Wadi Rakb'],
  viking: ['Grimsby', 'Vestrfjord', 'Steinvik'],
  persia: ['Chahar Deh', 'Sang-e Rah', 'Ab-i Garm'],
  india: ['Palli', 'Ghatpur', 'Simanta'],
  egypt: ['Per-Sekhet', 'Khenu', 'Ta-Mehu Ford'],
  kush: ['Sedeinga', 'Tabo', 'Amara West'],
  aztecs: ['Atlixco', 'Tepetlixpa', 'Cuauhnahuac'],
  inca: ['Willkapampa', 'Ayapata', 'Qollpa'],
};

export interface Hamlet { realm: string; name: string; xy: Pt; }

/**
 * Three per realm, out where its grip is thinnest: the border vertices furthest from the throne that
 * are on land and not on top of anything the atlas already named. Worked out once from the map, so
 * the fringe follows the country if the country is ever redrawn.
 */
let cached: Hamlet[] | null = null;
export function hamlets(): Hamlet[] {
  if (cached) return cached;
  const out: Hamlet[] = [];
  for (const r of REGIONS) {
    const names = NAMES[r.id];
    if (!names || r.poly.length < 3) continue;
    const cap = r.places.find(p => p.kind === 'capital');
    const from: Pt = cap ? [cap.x, cap.y] : centroidOf(r.poly);

    // ONE frontier anchor: the border point furthest from the throne that a warband can stand on.
    let anchor: Pt | null = null, far = -1;
    for (const v of r.poly) {
      for (const step of [56, 92, 136, 190]) {
        const p = pullIn(v, from, step);
        if (!isLand(p[0], p[1])) continue;
        const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
        if (d > far) { far = d; anchor = p; }
        break;
      }
    }
    if (!anchor) continue;

    // and three hamlets around it, close enough that all three are one march from the same camp.
    // A cluster rather than a scatter is what makes "a few easy places near home" TRUE for every
    // country, instead of true for whichever ones happen to be compact.
    const ring: Array<[number, number]> = [[0, -74], [66, 46], [-66, 46], [88, -34], [-88, -34], [0, 92],
      [46, 0], [-46, 0], [0, -40], [0, 44]];
    let picked: Pt[] = [];
    // India's valley and the Aztec lake are crowded: if three will not fit at arm's length from the
    // named places, they stand closer. Every realm gets its three.
    for (const [clear, apart] of [[56, 44], [34, 30], [18, 22]] as const) {
      picked = [];
      for (const [dx, dy] of ring) {
        if (picked.length >= 3) break;
        let p: Pt = [Math.round(anchor[0] + dx), Math.round(anchor[1] + dy)];
        if (!isLand(p[0], p[1])) {
          const snap = nearestLand(p[0], p[1], 5);
          if (!snap) continue;
          p = [Math.round(snap[0]), Math.round(snap[1])];
        }
        if (r.places.some(q => Math.hypot(q.x - p[0], q.y - p[1]) < clear)) continue;
        if (picked.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < apart)) continue;
        picked.push(p);
      }
      if (picked.length >= 3) break;
    }
    // a realm with nowhere to put three still gets whatever it can hold
    picked.forEach((p, i) => out.push({ realm: r.id, name: names[i] ?? names[0], xy: p }));
  }
  cached = out;
  return out;
}

/** A border point is on the line; a village stands a little inside it. */
function pullIn(p: Pt, toward: Pt, step: number): Pt {
  const dx = toward[0] - p[0], dy = toward[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  return [Math.round(p[0] + (dx / len) * step), Math.round(p[1] + (dy / len) * step)];
}

function centroidOf(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

/** The Borderland's own fringe is already drawn by hand, so it takes none. */
export const HAMLET_LON_LAT = ll;

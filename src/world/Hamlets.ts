// Hamlets.ts — the fringe every country actually had. The atlas names thrones, great cities and the
// towns between them, because that is what a cartographer draws; it does not name the three huts on
// the border where the road stops being a road. A realm with no fringe is a realm a new warband
// cannot touch, so each one gets three: placed out on its own edge, on land, clear of everything
// already there, and named the way that country names a small place.
import { ll, type Pt } from './geo';
import { REGIONS } from './WorldChart';
import { componentNear, isLand, landComponent, nearestLand, nearestOnLandmass, route } from './Terrain';

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
    // The country's real ground: whichever landmass most of its named places stand on. Roma is drawn
    // a hair out to sea on this grid and Japan is four islands, so ask the places, not the outline.
    const tally = new Map<number, number>();
    for (const p of r.places) {
      const c = componentNear(p.x, p.y);
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    let mainland = 0, best = 0;
    for (const [c, n] of tally) if (n > best) { best = n; mainland = c; }

    // Anchors, best first. The NEAREST frontier, not the far one: the far corner of Rome is North
    // Africa, and a Roman warband should be able to raid without leaving Italy. So take the closest
    // border to the throne that is still a couple of days out of it — the edge of the heartland —
    // and keep the further corners as fallbacks for a country whose near edge has no room.
    const cand: Array<{ p: Pt; d: number }> = [];
    for (const v of r.poly) {
      for (const step of [56, 92, 136, 190]) {
        const p = pullIn(v, from, step);
        if (!isLand(p[0], p[1])) continue;
        cand.push({ p, d: Math.hypot(p[0] - from[0], p[1] - from[1]) });
        break;
      }
    }
    if (!cand.length) continue;
    // Roma is drawn a hair out to sea, and the nearest dry cell to it is an islet, not Italy.
    const seat = (mainland ? nearestOnLandmass(from[0], from[1], mainland) : nearestLand(from[0], from[1], 6)) ?? from;
    const OUT = 150; // close enough to be home, far enough that the camp is not in the capital's shadow
    const anchors = [...cand]
      // A region outline drawn round Italy also encloses Corsica, and 'is it land' says yes to Corsica.
      // A Roman start that cannot walk to Rome is not a Roman start.
      .filter(c => !mainland || landComponent(c.p[0], c.p[1]) === mainland)
      .sort((a, b) => (a.d >= OUT ? 0 : 1) - (b.d >= OUT ? 0 : 1) || a.d - b.d)
      .slice(0, 12)
      // Then reorder by the walk, not the ruler. A hundred and sixty units due south of Rome is a
      // month and a half away round the Middle Sea; the same distance north is a fortnight up the
      // peninsula. Only the march knows which of those is home ground.
      .map(c => ({ ...c, w: route(c.p, seat) }))
      .filter(c => !!c.w && c.w.days <= 25)
      .sort((a, b) => a.w!.days - b.w!.days);
    if (!anchors.length) continue;

    // Three hamlets around one anchor, close enough that all three are a short march from the same
    // camp. Close is measured in DAYS, not in pixels: Japan is islands and Norway is fjords, and a
    // hut ninety units away across a firth is a week's walk. So the pathfinder gets the last word.
    const ring: Array<[number, number]> = [[0, -74], [66, 46], [-66, 46], [88, -34], [-88, -34], [0, 92],
      [46, 0], [-46, 0], [0, -40], [0, 44], [62, -62], [-62, -62], [62, 62], [-62, 62], [104, 12],
      [-104, 12], [26, -88], [-26, -88], [26, 88], [-26, 88]];
    let picked: Pt[] = [];
    for (const a of anchors) {
      // India's valley and the Aztec lake are crowded: if three will not fit at arm's length from the
      // named places, they stand closer. Every realm gets its three.
      // The last tier is as close as anything may ever stand: a settlement resolves a tap within 22
      // units, so 26 is the point below which two places become one to a thumb.
      for (const [clear, apart] of [[62, 70], [44, 52], [32, 40], [26, 32], [22, 28]] as const) {
        const set: Pt[] = [];
        for (const [dx, dy] of ring) {
          if (set.length >= 3) break;
          let p: Pt = [Math.round(a.p[0] + dx), Math.round(a.p[1] + dy)];
          if (!isLand(p[0], p[1])) {
            const snap = nearestLand(p[0], p[1], 5);
            if (!snap) continue;
            p = [Math.round(snap[0]), Math.round(snap[1])];
          }
          // clear of EVERY realm's places, not just this one's: a Caliphate hamlet five units from an
          // Egyptian one is a tap that could mean either, and two names drawn on top of each other
          if (REGIONS.some(x => x.places.some(q => Math.hypot(q.x - p[0], q.y - p[1]) < clear))) continue;
          if (out.some(h => Math.hypot(h.xy[0] - p[0], h.xy[1] - p[1]) < clear)) continue;
          if (set.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < apart)) continue;
          if (mainland && landComponent(p[0], p[1]) !== mainland) continue;
          if (set.length) { const w = route(set[0], p); if (!w || w.days > 3) continue; }
          set.push(p);
        }
        if (set.length > picked.length) picked = set;
        if (picked.length >= 3) break;
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

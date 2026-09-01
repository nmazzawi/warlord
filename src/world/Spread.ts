// Spread.ts — no two places may stand on the same spot. The atlas was written from real geography, and
// real geography puts Tlacopan two world units from Tenochtitlan, Ostia five from Roma and Marathon
// three from Athenai. At this chart's scale a day's march is about a hundred and forty units, so those
// pairs are not neighbours — they are the same dot. Eight Aztec settlements sat inside twenty-five
// units of their capital: one marker's worth of ground holding a third of a country, where only the
// capital could be named and a tap could not tell you which of them you had hit.
//
// So the cartographer does what a cartographer does with a crowded coast: he keeps the throne where it
// belongs and eases the rest apart until each has room for its own name, without letting any of them
// slide into the sea or out of their own country.
import { isLand, landComponent, nearestLand } from './Terrain';
import type { AtlasPlace } from './AtlasData';
import type { Pt } from './geo';

/** The most ground a settlement is ever given to itself — about half a day's march, and a name's width. */
const MIN_GAP = 62;
/** What this realm is actually being spread to, set from how much room it has. */
let gap = MIN_GAP;
/** A throne does not move for anybody. Below it, the smaller the place the further it gives way. */
const GIVE: Record<string, number> = { capital: 0, city: 0.7, town: 1, village: 1.25 };
const PASSES = 40;

/** Is a point inside this realm's outline? Ray casting, the same test the chart paints with. */
function inPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Ease a realm's settlements apart until each stands on its own ground. Mutates the places in place,
 * once, at load: everything downstream — the markers, the nodes you tap, the routes between them —
 * reads the same coordinates, so they cannot disagree about where a town is.
 */
/**
 * And once every country has been eased apart on its own, the borders between them: Waset belongs to
 * Egypt and Qasr Ibrim to Kush, and neither realm's own pass can see that they are drawn on top of one
 * another. Run with no polygon to hold them in, because a border place has two countries to answer to.
 */
export function spreadAcrossRealms(all: AtlasPlace[]): void {
  gap = 40;                                  // borders only: enough that two realms' towns are distinct
  relax(all, [], all.map(() => false));
}

export function spreadPlaces(places: AtlasPlace[], poly: Pt[]): void {
  if (places.length < 2) return;
  const home = places.map(p => inPoly(p.x, p.y, poly));
  // How far apart a country can actually hold its towns is a fact about the country. Rome has a
  // continent and can spare sixty units a settlement; the valley of Mexico has nine cities and three
  // hamlets to fit on a hand's breadth of land, and pushing them to sixty fills every gap the hamlets
  // needed. So aim for a little under how far apart this country's own places already sit.
  const gaps: number[] = [];
  for (let i = 0; i < places.length; i++) {
    let m = Infinity;
    for (let j = 0; j < places.length; j++) {
      if (i === j) continue;
      m = Math.min(m, Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y));
    }
    if (Number.isFinite(m)) gaps.push(m);
  }
  gaps.sort((a, b) => a - b);
  const typical = gaps.length ? gaps[gaps.length >> 1] : MIN_GAP;
  gap = Math.max(34, Math.min(MIN_GAP, typical * 1.6));
  // Twice: first keeping every place inside its own country, then — for a country too narrow to hold
  // its own settlements, which the valley of Mexico is — allowing them past the tint line so long as
  // they stay on land. A town drawn a little outside its wash is a small untruth; two towns drawn on
  // the same dot is one you cannot play through.
  relax(places, poly, home);
  const worst = tightest(places);
  if (worst.gap < gap * 0.75) relax(places, poly, home.map(() => false));
}

/**
 * Easing apart fails where there is nowhere to ease TO: Sakai and Kagoshima face each other across a
 * strait, and every direction either one is pushed is water or another island. For those, stop pushing
 * and go looking — the lesser of the two is carried to the nearest spot on its own coast that has room.
 */
export function unstack(all: AtlasPlace[]): number {
  let fixed = 0;
  const rank = (p: AtlasPlace) => (p.kind === 'capital' ? 0 : p.kind === 'city' ? 1 : p.kind === 'town' ? 2 : 3);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) >= 34) continue;
      const move = rank(a) >= rank(b) ? a : b;       // the lesser place gives way
      const land = landComponent(move.x, move.y) || componentOf(move);
      let best: Pt | null = null, bestD = Infinity;
      for (const rad of [70, 96, 124, 158, 196]) {
        for (let k = 0; k < 24; k++) {
          const th = (k / 24) * Math.PI * 2;
          const q: Pt = [Math.round(move.x + Math.cos(th) * rad), Math.round(move.y + Math.sin(th) * rad)];
          if (!isLand(q[0], q[1])) continue;
          if (land && landComponent(q[0], q[1]) !== land) continue;
          if (all.some(o => o !== move && Math.hypot(o.x - q[0], o.y - q[1]) < 40)) continue;
          const d = Math.hypot(q[0] - move.x, q[1] - move.y);
          if (d < bestD) { bestD = d; best = q; }
        }
        if (best) break;                              // the nearest ring that has room wins
      }
      if (!best) continue;
      move.x = best[0]; move.y = best[1];
      fixed++;
    }
  }
  return fixed;
}

function relax(places: AtlasPlace[], poly: Pt[], home: boolean[]): void {
  const land = places.map(p => landComponent(p.x, p.y) || componentOf(p));
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const a = places[i], b = places[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        // two dots on exactly the same spot have no direction to part along; give them one, chosen
        // from their order so the result is the same every time the world is drawn
        if (d < 0.001) { const th = ((i * 7 + j * 13) % 16) / 16 * Math.PI * 2; dx = Math.cos(th); dy = Math.sin(th); d = 1; }
        const push = (gap - d) / 2;
        const ux = dx / d, uy = dy / d;
        const ga = GIVE[a.kind] ?? 1, gb = GIVE[b.kind] ?? 1;
        const total = ga + gb || 1;
        const ma = nudge(a, -ux * push * (ga / total) * 2, -uy * push * (ga / total) * 2, poly, home[i], land[i], places);
        const mb = nudge(b, ux * push * (gb / total) * 2, uy * push * (gb / total) * 2, poly, home[j], land[j], places);
        moved = moved || ma || mb;
      }
    }
    if (!moved) break;
  }
}

/** Move a place, but never into the sea, never out of its own country, and never onto another island. */
function nudge(p: AtlasPlace, dx: number, dy: number, poly: Pt[], wasHome: boolean, land: number,
  all: AtlasPlace[]): boolean {
  if (!dx && !dy) return false;
  // Japan is nine settlements on forty-six grid cells: there is no room to put sixty units between
  // them, and pushing anyway just slides them all into the middle. So a move is only ever taken if it
  // leaves the place FURTHER from its nearest neighbour than it was. The spread may fail to help; it
  // may never make anything worse.
  const nearest = (x: number, y: number) => {
    let m = Infinity;
    for (const o of all) { if (o === p) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < m) m = d; }
    return m;
  };
  const was = nearest(p.x, p.y);
  const x = p.x + dx, y = p.y + dy;
  if (wasHome && poly.length && !inPoly(x, y, poly)) return false;   // it belongs here; it stays here
  const take = (nx: number, ny: number) => {
    // Ostia eased off Italy onto the islet beside it is Ostia nobody can march to. A place keeps the
    // landmass it was written on, whatever else it gives up.
    if (land && landComponent(nx, ny) !== land) return false;
    if (wasHome && poly.length && !inPoly(nx, ny, poly)) return false;
    if (nearest(nx, ny) <= was + 0.01) return false;
    p.x = nx; p.y = ny; return true;
  };
  const step = (ox: number, oy: number) => {
    if (isLand(ox, oy)) return take(ox, oy);
    // a port pushed off its coast is walked back to the nearest shore rather than left on the water
    const snap = nearestLand(ox, oy, 3);
    return snap ? take(snap[0], snap[1]) : false;
  };
  if (step(x, y)) return true;
  // Straight apart is into the sea — Sakai and Kagoshima face each other across a strait and neither
  // can back away. So try along the coast instead: the same distance, turned a quarter and a half turn
  // each way. A place that cannot part from its neighbour head-on can usually slide past it.
  for (const turn of [0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const c = Math.cos(turn), sn = Math.sin(turn);
    if (step(p.x + (dx * c - dy * sn), p.y + (dx * sn + dy * c))) return true;
  }
  return false;
}

/** A place the atlas drew a hair out to sea belongs to the shore beside it. */
function componentOf(p: AtlasPlace) {
  const near = nearestLand(p.x, p.y, 4);
  return near ? landComponent(near[0], near[1]) : 0;
}

/** The closest two places in a set — what the harness checks, and what this module exists to raise. */
export function tightest(places: AtlasPlace[]): { gap: number; pair: string } {
  let gap = Infinity, pair = '';
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y);
      if (d < gap) { gap = d; pair = `${places[i].name}/${places[j].name}`; }
    }
  }
  return { gap, pair };
}

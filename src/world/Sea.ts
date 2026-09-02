// Sea.ts — the water, and how a warband crosses it. The land router next door refuses to leave the
// coast; this is its mirror, and the only file that knows anything about sailing.
//
// One thing had to be fixed before "take it anywhere" could be true. The chart's terrain grid asks
// whether the CENTRE of each eighteen-unit cell is land, and the Strait of Gibraltar is drawn about
// five units wide — so the centre lands on Spain and the strait closes. Flood the water as drawn and
// it is not one sea but eleven: a world ocean, a Mediterranean of 351 cells sealed off with every
// Roman and Greek port in it, a Red Sea of 51, and eight puddles. Twenty-seven harbours could reach
// each other and nowhere else on Earth. So three cells are opened by hand, named for the straits they
// are, and the world's water becomes one body.
import { CELL, COLS, ROWS, cellOf, centreOf, componentNear, DAY, terrain, type Route } from './Terrain';
import { nodeById, NODES, type MapNode } from './WorldMap';
import type { Pt } from './geo';

/** Cells the atlas draws as water but the grid rounds shut. Gibraltar, then Bab el-Mandeb. */
const STRAITS: Array<[number, number]> = [[133, 75], [186, 101], [186, 102]];

/**
 * A ship sails through the night while an army marches six hours and makes camp, and it never climbs
 * a mountain. Measured against the land router, that is about four and a half times a marching column:
 * a crossing from Ostia to Sakai is fifty-odd days, near enough what it costs a Borderland warband to
 * walk to Rome. Long, and not a season of nothing.
 */
const SEA_DAY = DAY * 4.6;

/** What a crossing costs per day of sailing, when you do not own the hull you are standing on. */
export const FARE_PER_DAY = 14;
/** And the least anyone will take you anywhere for. */
export const FARE_MIN = 30;

interface SeaGrid { sail: Uint8Array; body: Int32Array; main: number; }
let grid: SeaGrid | null = null;

const idx = (cx: number, cy: number) => cy * COLS + cx;

/** The water, labelled into bodies, with the straits opened. Built once. */
function sea(): SeaGrid {
  if (grid) return grid;
  const g = terrain();
  const sail = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < sail.length; i++) sail[i] = g.land[i] ? 0 : 1;
  for (const [cx, cy] of STRAITS) if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) sail[idx(cx, cy)] = 1;
  // label the bodies, and remember the biggest — the one ocean everything worth sailing to is on
  const body = new Int32Array(COLS * ROWS);
  let next = 0, main = 0, biggest = 0;
  const q = new Int32Array(COLS * ROWS);
  for (let start = 0; start < sail.length; start++) {
    if (!sail[start] || body[start]) continue;
    const id = ++next;
    let head = 0, tail = 0, size = 0;
    body[start] = id; q[tail++] = start;
    while (head < tail) {
      const i = q[head++]; size++;
      const cx = i % COLS, cy = (i / COLS) | 0;
      if (cx > 0 && sail[i - 1] && !body[i - 1]) { body[i - 1] = id; q[tail++] = i - 1; }
      if (cx < COLS - 1 && sail[i + 1] && !body[i + 1]) { body[i + 1] = id; q[tail++] = i + 1; }
      if (cy > 0 && sail[i - COLS] && !body[i - COLS]) { body[i - COLS] = id; q[tail++] = i - COLS; }
      if (cy < ROWS - 1 && sail[i + COLS] && !body[i + COLS]) { body[i + COLS] = id; q[tail++] = i + COLS; }
    }
    if (size > biggest) { biggest = size; main = id; }
  }
  grid = { sail, body, main };
  return grid;
}

/** Is there open water here, and is it water a ship could have got to? */
export function isOpenSea(x: number, y: number) {
  const s = sea();
  const [cx, cy] = cellOf(x, y);
  return s.body[idx(cx, cy)] === s.main;
}

/**
 * The nearest place a hull can lie off this point — on the MAIN sea, never a landlocked puddle. Two
 * Egyptian harbours sit beside a one-cell pool of the Nile delta; a boat moored there sails nowhere.
 */
export function berth(x: number, y: number, reach = 4): Pt | null {
  const s = sea();
  const [sx, sy] = cellOf(x, y);
  if (s.body[idx(sx, sy)] === s.main) return centreOf(sx, sy);
  for (let r = 1; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = sx + dx, cy = sy + dy;
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
        if (s.body[idx(cx, cy)] === s.main) return centreOf(cx, cy);
      }
    }
  }
  return null;
}

/**
 * Three countries the atlas gives no coast worth the name, and which would otherwise have no way to
 * sea at all: their people would have to walk into somebody else's country to take ship. Each of these
 * is a river port in the real world, which is how a landlocked capital has always reached the ocean.
 */
const RIVER_PORTS = new Set(['Novgorod', 'Susa', 'Amara West']);

/**
 * A harbour is a settlement with deep water within a cell of it — under a day's walk to the quay.
 * isCoastal next door asks whether the sea is visible from here, which is the right question for
 * painting a shoreline into a settlement scene and much too generous for mooring a ship: at its
 * radius Damascus, Jerusalem and Persepolis are all ports.
 */
let cachedHarbours: MapNode[] | null = null;
export function harbours(): MapNode[] {
  if (cachedHarbours) return cachedHarbours;
  cachedHarbours = NODES.filter(n => !!n.name && n.kind !== 'cross' && n.kind !== 'waypoint'
    && (!!berth(n.x, n.y, 1) || (RIVER_PORTS.has(n.name) && !!berth(n.x, n.y, 6))));
  return cachedHarbours;
}

export function isHarbour(id: string) {
  return harbours().some(h => h.id === id);
}

/** The nearest harbour to a point, for telling a landlocked warband where to go and take ship. */
export function nearestHarbour(x: number, y: number, sameLandAs?: MapNode): MapNode | null {
  const want = sameLandAs ? componentNear(sameLandAs.x, sameLandAs.y) : 0;
  let best: MapNode | null = null, bd = Infinity;
  for (const h of harbours()) {
    // a port you can walk inland from: no use landing in Spain for a city in Peru
    if (want && componentNear(h.x, h.y) !== want) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

/**
 * The port that serves a place. Tenochtitlan sits inland and no keel reaches it, but Huaxyacac is on
 * its coast and on its ground — so "you cannot sail to the Aztec throne" is the wrong answer, and
 * "sail to Huaxyacac, then march" is the right one.
 */
export function portFor(n: MapNode): MapNode | null {
  if (isHarbour(n.id)) return n;
  return nearestHarbour(n.x, n.y, n);
}

/**
 * A voyage: A* over open water. The same shape as the land router, and simpler — water has no roads,
 * no mountains and no ground a horse prefers, so every cell costs the same.
 */
export function seaRoute(from: Pt, to: Pt): Route | null {
  const s = sea();
  const a = berth(from[0], from[1]);
  const b = berth(to[0], to[1]);
  if (!a || !b) return null;
  const start = cellOf(a[0], a[1]), goal = cellOf(b[0], b[1]);
  const startI = idx(start[0], start[1]), goalI = idx(goal[0], goal[1]);
  if (startI === goalI) return { points: [from, to], days: 1 };

  const n = COLS * ROWS;
  const best = new Float64Array(n).fill(Infinity);
  const score = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const heur = (i: number) => {
    const cx = i % COLS, cy = (i / COLS) | 0;
    return Math.hypot(cx - goal[0], cy - goal[1]) * CELL * (1 / SEA_DAY);
  };
  const heap: number[] = [startI];
  best[startI] = 0; score[startI] = heur(startI);
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (score[heap[p]] <= score[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < heap.length && score[heap[l]] < score[heap[m]]) m = l;
        if (r < heap.length && score[heap[r]] < score[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const cur = pop();
    if (cur === goalI) break;
    if (seen[cur]) continue;
    seen[cur] = 1;
    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = idx(nx, ny);
        if (s.body[ni] !== s.main) continue;
        // no cutting a corner past a headland the hull would strike
        if (dx && dy && (s.body[idx(cx + dx, cy)] !== s.main || s.body[idx(cx, cy + dy)] !== s.main)) continue;
        const step = (dx && dy ? Math.SQRT2 : 1) * CELL / SEA_DAY;
        const cost = best[cur] + step;
        if (cost >= best[ni]) continue;
        best[ni] = cost; prev[ni] = cur; score[ni] = cost + heur(ni);
        push(ni);
      }
    }
  }
  if (prev[goalI] < 0 && goalI !== startI) return null;
  const cells: number[] = [];
  for (let i = goalI; i >= 0; i = prev[i]) { cells.push(i); if (i === startI) break; }
  cells.reverse();
  const points: Pt[] = [from, ...cells.map(i => centreOf(i % COLS, (i / COLS) | 0)), to];
  return { points: simplify(points), days: Math.max(1, Math.round(best[goalI])) };
}

/** Drop the points that sit on a straight run, so a voyage draws as a few long legs. */
function simplify(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) > 240) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface Crossing { route: Route; days: number; fare: number; from: MapNode; to: MapNode; }

/**
 * What it takes to sail from one harbour to another. There is always a hull and always a man willing
 * to take your silver — a crossing is refused for one reason only, that no water joins the two.
 */
export function crossing(fromId: string, toId: string): Crossing | null {
  if (fromId === toId) return null;
  let from: MapNode, to: MapNode;
  try { from = nodeById(fromId); to = nodeById(toId); } catch { return null; }
  if (!isHarbour(from.id) || !isHarbour(to.id)) return null;
  const r = seaRoute([from.x, from.y], [to.x, to.y]);
  if (!r) return null;
  return { route: r, days: r.days, fare: Math.max(FARE_MIN, Math.round(r.days * FARE_PER_DAY)), from, to };
}

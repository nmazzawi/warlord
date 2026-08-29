// Terrain.ts — what the ground is like, and how to walk across it.
// The chart is divided into a coarse grid; every cell knows whether it is land, what kind of ground it
// is, and whether a road runs through it. From that comes two things the game needs: a route between
// any two points that never crosses water and skirts the mountains, and how many days that march costs.
// Plains are quick, forest slower, mountains slowest, the steppe quick if you are mounted, and a road
// is worth half again as much as the ground beside it.
import { COASTS, COVER, RANGES } from './AtlasData';
import { CHART, lly, type Pt } from './geo';

export type Ground = 'plains' | 'forest' | 'desert' | 'steppe' | 'marsh' | 'mountain' | 'ice' | 'jungle';

/** World units a warband covers in a day on open plains. Everything else is a fraction of this. */
export const DAY = 22;
/** How fast each kind of ground is, as a share of open plains. */
export const SPEED: Record<Ground, number> = {
  plains: 1, steppe: 1.15, desert: 0.75, forest: 0.7, jungle: 0.5, marsh: 0.55, mountain: 0.42, ice: 0.5,
};
/** A horse is worth more on open ground than in a forest. */
export const MOUNTED: Partial<Record<Ground, number>> = { steppe: 1.35, plains: 1.2, desert: 1.1 };
/** A road is worth half again as much as the ground it crosses. */
export const ROAD_BONUS = 1.5;

export const CELL = 18;                       // world units per grid cell
export const COLS = Math.ceil(CHART.w / CELL);
export const ROWS = Math.ceil(CHART.h / CELL);

interface Grid { land: Uint8Array; ground: Uint8Array; road: Uint8Array; }
const GROUNDS: Ground[] = ['plains', 'forest', 'desert', 'steppe', 'marsh', 'mountain', 'ice', 'jungle'];
let grid: Grid | null = null;

const idx = (cx: number, cy: number) => cy * COLS + cx;
export const cellOf = (x: number, y: number): [number, number] =>
  [Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))), Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)))];
export const centreOf = (cx: number, cy: number): Pt => [(cx + 0.5) * CELL, (cy + 0.5) * CELL];

function inPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Land is where the coastline rings wind to something other than zero — the same rule the chart paints. */
function onLand(x: number, y: number) {
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
}

/** Latitude decides the default: ice at the top of the world, jungle at the equator, temperate between. */
function bandAt(y: number): Ground {
  const lat = latOf(y);
  const a = Math.abs(lat);
  if (a > 66) return 'ice';
  if (a > 56) return 'forest';
  if (a > 23) return 'plains';
  return 'jungle';
}
const MY0 = Math.log(Math.tan(Math.PI / 4 + (72 * Math.PI) / 360));
const KY = (3170 - 70) / (MY0 - Math.log(Math.tan(Math.PI / 4 + (-49 * Math.PI) / 360)));
export function latOf(y: number) {
  const m = MY0 - (y - 70) / KY;
  return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI);
}

/** Build the grid once: land, ground type, and where the roads run. */
export function terrain(roads: Array<[Pt, Pt]> = []): Grid {
  if (grid) return grid;
  const land = new Uint8Array(COLS * ROWS);
  const ground = new Uint8Array(COLS * ROWS);
  const road = new Uint8Array(COLS * ROWS);
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const [x, y] = centreOf(cx, cy);
      const i = idx(cx, cy);
      if (!onLand(x, y)) continue;
      land[i] = 1;
      ground[i] = GROUNDS.indexOf(bandAt(y));
    }
  }
  // ground cover overrides the latitude band
  const KIND: Record<string, Ground> = { desert: 'desert', forest: 'forest', steppe: 'steppe', marsh: 'marsh' };
  for (const c of COVER) {
    const kind = KIND[c.kind];
    if (!kind) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of c.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const [ax, ay] = cellOf(x0, y0), [bx, by] = cellOf(x1, y1);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const i = idx(cx, cy);
        if (!land[i]) continue;
        const [x, y] = centreOf(cx, cy);
        if (inPoly(x, y, c.pts)) ground[i] = GROUNDS.indexOf(kind);
      }
    }
  }
  // mountains: the cells a crest line passes through, and their immediate neighbours
  for (const r of RANGES) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / (CELL * 0.6)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const [cx, cy] = cellOf(ax + (bx - ax) * t, ay + (by - ay) * t);
        const reach = r.size >= 3 ? 1 : 0;
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const j = idx(Math.max(0, Math.min(COLS - 1, cx + dx)), Math.max(0, Math.min(ROWS - 1, cy + dy)));
            if (land[j]) ground[j] = GROUNDS.indexOf('mountain');
          }
        }
      }
    }
  }
  for (const [a, b] of roads) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [cx, cy] = cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      road[idx(cx, cy)] = 1;
    }
  }
  grid = { land, ground, road };
  return grid;
}

export function groundAt(x: number, y: number): Ground {
  const g = terrain();
  const [cx, cy] = cellOf(x, y);
  return GROUNDS[g.ground[idx(cx, cy)]];
}
export function isLand(x: number, y: number) {
  const g = terrain();
  const [cx, cy] = cellOf(x, y);
  return g.land[idx(cx, cy)] === 1;
}
/** The nearest walkable spot to a point — so a tap just off the coast still means "go to the shore". */
export function nearestLand(x: number, y: number, reach = 8): Pt | null {
  if (isLand(x, y)) return [x, y];
  const g = terrain();
  const [sx, sy] = cellOf(x, y);
  for (let r = 1; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = sx + dx, cy = sy + dy;
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
        if (g.land[idx(cx, cy)]) return centreOf(cx, cy);
      }
    }
  }
  return null;
}

/** Days per world unit across one cell, for this warband. */
function costPerUnit(i: number, g: Grid, mounted: boolean) {
  const kind = GROUNDS[g.ground[i]];
  let speed = SPEED[kind];
  if (mounted && MOUNTED[kind]) speed *= MOUNTED[kind]!;
  if (g.road[i]) speed *= ROAD_BONUS;
  return 1 / (DAY * speed);
}

export interface Route { points: Pt[]; days: number; }

/**
 * A march from one point to another: A* over the grid, never leaving the land, preferring open ground
 * and roads to mountains and marsh. Returns the route and what it costs in days.
 */
export function route(from: Pt, to: Pt, mounted = false): Route | null {
  const g = terrain();
  const start = cellOf(from[0], from[1]);
  const goalPt = nearestLand(to[0], to[1]);
  if (!goalPt) return null;
  const goal = cellOf(goalPt[0], goalPt[1]);
  const startI = idx(start[0], start[1]), goalI = idx(goal[0], goal[1]);
  if (!g.land[startI] || !g.land[goalI]) return null;
  if (startI === goalI) return { points: [from, goalPt], days: 1 };

  const n = COLS * ROWS;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const heur = (i: number) => {
    const cx = i % COLS, cy = (i / COLS) | 0;
    return Math.hypot(cx - goal[0], cy - goal[1]) * CELL * (1 / (DAY * 1.4));
  };
  // a small binary heap keyed on estimated total cost
  const heap: number[] = [startI];
  const score = new Float64Array(n).fill(Infinity);
  best[startI] = 0;
  score[startI] = heur(startI);
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

  let found = false;
  let guard = 0;
  while (heap.length && guard++ < 400000) {
    const cur = pop();
    if (seen[cur]) continue;
    seen[cur] = 1;
    if (cur === goalI) { found = true; break; }
    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = idx(nx, ny);
        if (!g.land[ni] || seen[ni]) continue;
        if (dx && dy && (!g.land[idx(cx + dx, cy)] || !g.land[idx(cx, cy + dy)])) continue;  // no corner-cutting over water
        const step = (dx && dy ? Math.SQRT2 : 1) * CELL;
        const cost = best[cur] + step * (costPerUnit(cur, g, mounted) + costPerUnit(ni, g, mounted)) / 2;
        if (cost >= best[ni]) continue;
        best[ni] = cost;
        prev[ni] = cur;
        score[ni] = cost + heur(ni);
        push(ni);
      }
    }
  }
  if (!found) return null;

  const cells: number[] = [];
  for (let c = goalI; c !== -1; c = prev[c]) { cells.unshift(c); if (c === startI) break; }
  const pts: Pt[] = cells.map(c => centreOf(c % COLS, (c / COLS) | 0));
  pts[0] = from;
  pts[pts.length - 1] = goalPt;
  return { points: simplify(pts), days: Math.max(1, Math.round(best[goalI])) };
}

/** Drop points that sit on a straight run, so the drawn route is a few strokes rather than a staircase. */
function simplify(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) > 12) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** How far along a route a warband gets in one day — used to walk hunters toward you. */
export function stepAlong(from: Pt, to: Pt, days: number, mounted = false): Pt {
  const r = route(from, to, mounted);
  if (!r || r.points.length < 2) return from;
  const want = (days / Math.max(1, r.days)) * totalLength(r.points);
  let left = want;
  for (let i = 1; i < r.points.length; i++) {
    const [ax, ay] = r.points[i - 1], [bx, by] = r.points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) return [ax + ((bx - ax) * left) / len, ay + ((by - ay) * left) / len];
    left -= len;
  }
  return r.points[r.points.length - 1];
}
export function totalLength(pts: Pt[]) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return n;
}
export { lly };

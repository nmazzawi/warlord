// LayoutCheck.ts — no battle map ships without a way in. A palisade drawn round a village that was
// authored open can seal it: the warband lands outside a ring it cannot cross, or inside one its own
// troops cannot follow it through, and the fight is unwinnable before a blow is struck. So every
// layout is walked before it is fought on — from the spawn to every defender and every building — and
// one that fails has a gate cut into it and is walked again.
import type { LayoutDef, Obstacle, Post } from './Layouts';

/** The same grid the flow field uses, so "walkable here" means the same thing to the check and to the men. */
const CELL = 32;
const INFLATE = 13;

export interface Walk {
  cols: number; rows: number;
  open: Uint8Array;      // not blocked by an obstacle
  seen: Uint8Array;      // reached from the spawn
  at(x: number, y: number): boolean;
  reached: number; walkable: number;
}

/** Flood the map from one point and remember everywhere the warband could get to. */
export function walkFrom(l: LayoutDef, obstacles: Obstacle[], from: Post): Walk {
  const cols = Math.ceil(l.w / CELL), rows = Math.ceil(l.h / CELL);
  const open = new Uint8Array(cols * rows).fill(1);
  for (const o of obstacles) {
    // a gate is a door, not a wall: it is meant to be broken, and a map is not sealed for having one
    if (o.kind === 'gate') continue;
    const x0 = o.x - o.w / 2 - INFLATE, x1 = o.x + o.w / 2 + INFLATE;
    const y0 = o.y - o.h / 2 - INFLATE, y1 = o.y + o.h / 2 + INFLATE;
    const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(cols - 1, Math.floor(x1 / CELL));
    const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(rows - 1, Math.floor(y1 / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        if (cx > x0 && cx < x1 && cy > y0 && cy < y1) open[r * cols + c] = 0;
      }
    }
  }
  const seen = new Uint8Array(cols * rows);
  const cell = (x: number, y: number) => {
    const c = Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(y / CELL)));
    return r * cols + c;
  };
  // the spawn itself may sit in the skirt of a hut; start from the nearest cell that is actually open
  let startCell = cell(from.x, from.y);
  if (!open[startCell]) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < open.length; i++) {
      if (!open[i]) continue;
      const cx = (i % cols) * CELL + CELL / 2, cy = ((i / cols) | 0) * CELL + CELL / 2;
      const d = Math.hypot(cx - from.x, cy - from.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return { cols, rows, open, seen, at: () => false, reached: 0, walkable: 0 };
    startCell = best;
  }
  const queue = new Int32Array(cols * rows);
  let head = 0, tail = 0;
  seen[startCell] = 1; queue[tail++] = startCell;
  while (head < tail) {
    const i = queue[head++], c = i % cols, r = (i / cols) | 0;
    if (c > 0 && !seen[i - 1] && open[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
    if (c < cols - 1 && !seen[i + 1] && open[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
    if (r > 0 && !seen[i - cols] && open[i - cols]) { seen[i - cols] = 1; queue[tail++] = i - cols; }
    if (r < rows - 1 && !seen[i + cols] && open[i + cols]) { seen[i + cols] = 1; queue[tail++] = i + cols; }
  }
  let reached = 0, walkable = 0;
  for (let i = 0; i < open.length; i++) { if (open[i]) walkable++; if (seen[i]) reached++; }
  return {
    cols, rows, open, seen, reached, walkable,
    // A man standing a foot from a wall is standing in the skirt the grid paints round it, and he is
    // still perfectly reachable — so ask about the neighbourhood, not the single cell.
    at(x, y) {
      const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (seen[nr * cols + nc]) return true;
        }
      }
      return false;
    },
  };
}

export interface Verdict {
  ok: boolean;
  walk: Walk;
  /** Defender posts the warband could never reach. */
  strandedPosts: Post[];
  /** Buildings with no reachable ground beside them. */
  strandedBuildings: number;
  /** How much of the walkable map the warband can actually use. */
  share: number;
}

/** Can the warband get from where it stands to everyone it has to fight, and everything it can loot? */
export function inspect(l: LayoutDef, obstacles: Obstacle[], from: Post, posts: Post[]): Verdict {
  const walk = walkFrom(l, obstacles, from);
  const strandedPosts = posts.filter(p => !walk.at(p.x, p.y));
  const beside = (o: Obstacle) => {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (walk.at(o.x + dx * (o.w / 2 + 30), o.y + dy * (o.h / 2 + 30))) return true;
    }
    return false;
  };
  const buildings = l.obstacles.filter(o => o.kind === 'hut' || o.kind === 'yurt');
  const strandedBuildings = buildings.filter(o => !beside(o)).length;
  const share = walk.walkable ? walk.reached / walk.walkable : 0;
  return { ok: !strandedPosts.length && !strandedBuildings, walk, strandedPosts, strandedBuildings, share };
}

/** Every post a battle will actually stand a defender on. */
export function allPosts(l: LayoutDef): Post[] {
  return Object.values(l.posts).flat().filter(Boolean) as Post[];
}

/**
 * Cut a gate into the wall between the warband and the men it came for. The opening is put on the
 * side of the ring that faces the spawn, at the height the spawn stands, and a gate with hit points
 * is hung in it: a wall a village has actually closed is a siege, which is a fight, and not a sealed
 * ring, which is not.
 */
export function cutGate(l: LayoutDef, obstacles: Obstacle[], from: Post, side: Side): Obstacle[] {
  const p = l.palisade;
  if (!p) return obstacles;
  const GAP = 130, T = 14;
  const along = side === 'n' || side === 's' ? from.x : from.y;
  const lo = side === 'n' || side === 's' ? p.x0 : p.y0;
  const hi = side === 'n' || side === 's' ? p.x1 : p.y1;
  const mid = Math.max(lo + GAP / 2 + 20, Math.min(hi - GAP / 2 - 20, along));
  const from0 = mid - GAP / 2, to0 = mid + GAP / 2;
  const out: Obstacle[] = [];
  for (const o of obstacles) {
    const isWall = o.kind === 'wall';
    if (!isWall) { out.push(o); continue; }
    const horizontal = o.w > o.h;
    const onThisWall = side === 'n' ? (horizontal && Math.abs(o.y - p.y0) < T)
      : side === 's' ? (horizontal && Math.abs(o.y - p.y1) < T)
      : side === 'w' ? (!horizontal && Math.abs(o.x - p.x0) < T)
      : (!horizontal && Math.abs(o.x - p.x1) < T);
    if (!onThisWall) { out.push(o); continue; }
    // trim this run back to the edges of the new opening, keeping whatever lies outside it
    const a = horizontal ? o.x - o.w / 2 : o.y - o.h / 2;
    const b = horizontal ? o.x + o.w / 2 : o.y + o.h / 2;
    if (b <= from0 || a >= to0) { out.push(o); continue; }
    const keep = (k0: number, k1: number) => {
      if (k1 - k0 < 8) return;
      out.push(horizontal ? { x: (k0 + k1) / 2, y: o.y, w: k1 - k0, h: o.h, kind: 'wall' }
        : { x: o.x, y: (k0 + k1) / 2, w: o.w, h: k1 - k0, kind: 'wall' });
    };
    keep(a, from0); keep(to0, b);
  }
  // and hang the gate itself in the hole
  out.push(side === 'n' || side === 's'
    ? { x: mid, y: side === 'n' ? p.y0 : p.y1, w: GAP, h: T, kind: 'gate' }
    : { x: side === 'w' ? p.x0 : p.x1, y: mid, w: T, h: GAP, kind: 'gate' });
  return out;
}

export interface Ready {
  obstacles: Obstacle[];
  /** The defender posts as they will actually be used — any that were walled off have been moved. */
  posts: LayoutDef['posts'];
  /** How many men had to be moved out of a crevice the warband could not reach. */
  moved: number;
  /** Where the warband stands, together, outside the walls. */
  spawn: Post;
  /** The way in it is looking at, if this map has one that must be broken. */
  gate: Obstacle | null;
  /** How the map had to be repaired, for the log and for the tests. */
  repaired: 'none' | 'gate-cut' | 'walls-dropped';
}

/**
 * Everything a battle needs to be fought fairly: obstacles that enclose nothing, a spawn outside the
 * walls with the whole warband on it, and the gate it is facing. Deterministic — the same layout and
 * the same walls always produce the same map, so a fight is never a lottery.
 */
export function prepare(l: LayoutDef, walled: boolean, palisade: Obstacle[]): Ready {
  const posts = allPosts(l);
  const base = l.obstacles;
  const spawn = outsideSpawn(l, walled);
  if (!walled || !l.palisade) {
    return { obstacles: [...base], spawn, gate: null, repaired: 'none', ...relocate(l, base, spawn) };
  }

  const walls = [...base, ...palisade];
  const withWalls = inspect(l, walls, spawn, posts);
  if (withWalls.ok) return { obstacles: walls, spawn, gate: null, repaired: 'none', ...relocate(l, walls, spawn) };

  // The ring cannot be walked. Cut a gate in it and try again — every side in turn, nearest the
  // warband first, because the approach to one wall may be blocked by the huts outside it while the
  // next one over is clear. The first opening that gives a walkable map is the one the village has.
  const p = l.palisade;
  const order: Side[] = ([
    { s: 'w' as Side, d: Math.abs(spawn.x - p.x0) },
    { s: 'e' as Side, d: Math.abs(spawn.x - p.x1) },
    { s: 'n' as Side, d: Math.abs(spawn.y - p.y0) },
    { s: 's' as Side, d: Math.abs(spawn.y - p.y1) },
  ]).sort((a, b) => a.d - b.d).map(x => x.s);
  for (const side of order) {
    const at = gateSpawn(l, side);
    const cut = cutGate(l, walls, at, side);
    const moved = relocate(l, cut, at);
    if (!inspect(l, cut, at, allPosts({ ...l, posts: moved.posts })).ok) continue;
    return { obstacles: cut, spawn: at, gate: cut.find(o => o.kind === 'gate') ?? null, repaired: 'gate-cut', ...moved };
  }
  // and a ring that is still wrong on every side does not go up at all: a fight you can walk is worth
  // more than a wall you cannot
  const bare = outsideSpawn(l, false);
  return { obstacles: [...base], spawn: bare, gate: null, repaired: 'walls-dropped', ...relocate(l, base, bare) };
}

/**
 * A defender the warband cannot get to is a fight that never ends. Ashford has an archer post wedged
 * in a hand's breadth between the palisade and a hut; the man does not stand there. Every post the
 * flood could not reach is moved to the nearest ground it could, keeping the shape of the defence.
 */
function relocate(l: LayoutDef, obstacles: Obstacle[], from: Post): { posts: LayoutDef['posts']; moved: number } {
  const walk = walkFrom(l, obstacles, from);
  let moved = 0;
  const fix = (p: Post): Post => {
    if (walk.at(p.x, p.y)) return p;
    for (let ring = 1; ring <= 8; ring++) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        const q = { x: p.x + Math.cos(th) * ring * 26, y: p.y + Math.sin(th) * ring * 26 };
        if (q.x < 20 || q.y < 20 || q.x > l.w - 20 || q.y > l.h - 20) continue;
        if (!walk.at(q.x, q.y)) continue;
        moved++;
        return q;
      }
    }
    return p;
  };
  const out: LayoutDef['posts'] = { militia: [], archers: [], captains: [] };
  for (const [key, list] of Object.entries(l.posts)) {
    if (!list) continue;
    (out as Record<string, Post[]>)[key] = (list as Post[]).map(fix);
  }
  return { posts: out, moved };
}

export type Side = 'n' | 's' | 'e' | 'w';

/** Where a warband forms up to storm one particular wall: square in front of the middle of it. */
function gateSpawn(l: LayoutDef, side: Side): Post {
  const p = l.palisade!;
  const midX = (p.x0 + p.x1) / 2, midY = (p.y0 + p.y1) / 2;
  const OUT = 120;
  if (side === 'w') return { x: Math.max(60, p.x0 - OUT), y: midY };
  if (side === 'e') return { x: Math.min(l.w - 60, p.x1 + OUT), y: midY };
  if (side === 'n') return { x: midX, y: Math.max(60, p.y0 - OUT) };
  return { x: midX, y: Math.min(l.h - 60, p.y1 + OUT) };
}

/** Where the warband forms up: its authored start if that is outside the ring, or in front of a wall if not. */
function outsideSpawn(l: LayoutDef, walled: boolean): Post {
  const s = l.heroStart;
  const p = l.palisade;
  if (!walled || !p) return { x: s.x, y: s.y };
  const inside = s.x > p.x0 && s.x < p.x1 && s.y > p.y0 && s.y < p.y1;
  if (!inside) return { x: s.x, y: s.y };
  // pushed out through the nearest wall, far enough clear that the whole warband fits in front of it
  const d = [
    { side: 'w', gap: s.x - p.x0, at: { x: Math.max(60, p.x0 - 110), y: s.y } },
    { side: 'e', gap: p.x1 - s.x, at: { x: Math.min(l.w - 60, p.x1 + 110), y: s.y } },
    { side: 'n', gap: s.y - p.y0, at: { x: s.x, y: Math.max(60, p.y0 - 110) } },
    { side: 's', gap: p.y1 - s.y, at: { x: s.x, y: Math.min(l.h - 60, p.y1 + 110) } },
  ].sort((a, b) => a.gap - b.gap)[0];
  return d.at;
}

/**
 * Where each man of the warband stands: together, in ranks behind the hero, all of them on the same
 * side of the wall as the hero. Troops used to be strung out to the left of wherever the hero landed,
 * which is how half a warband ended up on the wrong side of a palisade.
 */
export function warbandPosts(spawn: Post, facing: { x: number; y: number }, count: number,
  fits?: (x: number, y: number) => boolean): Post[] {
  const dx = facing.x - spawn.x, dy = facing.y - spawn.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = dx / len, fy = dy / len;              // toward the fight
  const sx = -fy, sy = fx;                          // across the front
  const ok = fits ?? (() => true);
  const out: Post[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.floor(i / 3) + 1;             // three abreast, ranks behind
    const file = (i % 3) - 1;
    const want: Post = { x: spawn.x - fx * rank * 34 + sx * file * 34, y: spawn.y - fy * rank * 34 + sy * file * 34 };
    if (ok(want.x, want.y)) { out.push(want); continue; }
    // a hero who forms up in a corner has no room behind him: the ranks close on him instead of
    // trailing off the map, and a man who cannot stand where he was told stands as near as he can
    let placed: Post | null = null;
    for (let ring = 1; ring <= 5 && !placed; ring++) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const p = { x: spawn.x + Math.cos(th) * ring * 26, y: spawn.y + Math.sin(th) * ring * 26 };
        if (!ok(p.x, p.y)) continue;
        if (out.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 22)) continue;
        placed = p; break;
      }
    }
    out.push(placed ?? { x: spawn.x, y: spawn.y });
  }
  return out;
}

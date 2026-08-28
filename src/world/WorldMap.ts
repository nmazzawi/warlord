// WorldMap.ts — the overworld: places (nodes) joined by roads (edges). Travel costs days.
import { TRAVEL } from '../config/balance';

export type NodeKind = 'camp' | 'village' | 'town' | 'cross';

export interface MapNode {
  id: string; name: string; kind: NodeKind; x: number; y: number;
  tier?: number;      // villages: 1..4
  layout?: string;    // villages: which raid layout
  blurb?: string;
}
export interface MapEdge { a: string; b: string; days: number; }

export const MAP = { w: 1480, h: 1000 };

export const NODES: MapNode[] = [
  { id: 'camp', name: 'Bandit Camp', kind: 'camp', x: 200, y: 720, blurb: 'Home. Forge, barracks and stables.' },
  { id: 'ashford', name: 'Ashford', kind: 'village', x: 470, y: 640, tier: 1, layout: 'ashford', blurb: 'A sleepy hamlet on the old road.' },
  { id: 'x1', name: '', kind: 'cross', x: 690, y: 540 },
  { id: 'millbrook', name: 'Millbrook', kind: 'village', x: 600, y: 330, tier: 2, layout: 'millbrook', blurb: 'Lanes and a longhouse by the mill.' },
  { id: 'thornhill', name: 'Thornhill', kind: 'village', x: 920, y: 660, tier: 3, layout: 'thornhill', blurb: 'A warren of alleys under the hill.' },
  { id: 'greywater', name: 'Greywater', kind: 'village', x: 1010, y: 300, tier: 4, layout: 'greywater', blurb: 'Rich, proud, and wide open.' },
  { id: 'kingsport', name: 'Kingsport', kind: 'town', x: 1240, y: 520, blurb: 'A walled town with a standing garrison.' },
];

function dist(a: MapNode, b: MapNode) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function nodeById(id: string): MapNode {
  const n = NODES.find(n => n.id === id);
  if (!n) throw new Error(`unknown map node ${id}`);
  return n;
}

const LINKS: Array<[string, string]> = [
  ['camp', 'ashford'], ['ashford', 'x1'], ['x1', 'millbrook'], ['x1', 'thornhill'],
  ['millbrook', 'greywater'], ['thornhill', 'kingsport'], ['greywater', 'kingsport'], ['x1', 'greywater'],
];
export const EDGES: MapEdge[] = LINKS.map(([a, b]) => ({ a, b, days: Math.max(1, Math.round(dist(nodeById(a), nodeById(b)) / TRAVEL.pxPerDay)) }));

export function edgeBetween(a: string, b: string): MapEdge | null {
  return EDGES.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)) ?? null;
}
export function neighbours(id: string): string[] {
  return EDGES.filter(e => e.a === id || e.b === id).map(e => (e.a === id ? e.b : e.a));
}

/** Cheapest route in days (tiny Dijkstra). Returns the node ids after `from`, or [] if unreachable. */
export function findPath(from: string, to: string): string[] {
  if (from === to) return [];
  const best = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size) {
    let cur = '';
    let cd = Infinity;
    for (const id of open) { const d = best.get(id)!; if (d < cd) { cd = d; cur = id; } }
    open.delete(cur);
    if (cur === to) break;
    for (const nb of neighbours(cur)) {
      const e = edgeBetween(cur, nb)!;
      const nd = cd + e.days;
      if (nd < (best.get(nb) ?? Infinity)) { best.set(nb, nd); prev.set(nb, cur); open.add(nb); }
    }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  for (let c = to; c !== from; c = prev.get(c)!) path.unshift(c);
  return path;
}

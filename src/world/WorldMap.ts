// WorldMap.ts — the places you can stand on and the roads between them, in world-chart coordinates.
// Two territories so far: the homeland (fixed villages, Kingsport) and the Mongol steppe (waypoints
// that roaming camps drift between, one neutral trade camp). Travel costs days.
import { STEPPE, TRAVEL } from '../config/balance';

export type NodeKind = 'camp' | 'village' | 'town' | 'cross' | 'waypoint' | 'trade' | 'gate';
export type Territory = 'homeland' | 'steppe';

export interface MapNode {
  id: string; name: string; kind: NodeKind; x: number; y: number; territory: Territory;
  tier?: number;      // villages: 1..4
  layout?: string;    // villages / town: which raid layout
  blurb?: string;
}
export interface MapEdge { a: string; b: string; days: number; }

/** The old 1480x1000 homeland map is squeezed into the Borderland region of the chart. */
const HX = 2150, HY = 545, HS = 0.22;
const H = (x: number, y: number) => ({ x: Math.round(HX + x * HS), y: Math.round(HY + y * HS) });

export const NODES: MapNode[] = [
  { id: 'camp', name: 'Bandit Camp', kind: 'camp', ...H(200, 720), territory: 'homeland', blurb: 'Home. Forge, barracks and stables.' },
  { id: 'ashford', name: 'Ashford', kind: 'village', ...H(470, 640), territory: 'homeland', tier: 1, layout: 'ashford', blurb: 'A sleepy hamlet on the old road.' },
  { id: 'x1', name: '', kind: 'cross', ...H(690, 540), territory: 'homeland' },
  { id: 'millbrook', name: 'Millbrook', kind: 'village', ...H(600, 330), territory: 'homeland', tier: 2, layout: 'millbrook', blurb: 'Lanes and a longhouse by the mill.' },
  { id: 'thornhill', name: 'Thornhill', kind: 'village', ...H(920, 660), territory: 'homeland', tier: 3, layout: 'thornhill', blurb: 'A warren of alleys under the hill.' },
  { id: 'greywater', name: 'Greywater', kind: 'village', ...H(1010, 300), territory: 'homeland', tier: 4, layout: 'greywater', blurb: 'Rich, proud, and wide open.' },
  { id: 'kingsport', name: 'Kingsport', kind: 'town', ...H(1240, 520), territory: 'homeland', layout: 'kingsport', blurb: 'A walled town with a standing garrison.' },
  // the steppe
  { id: 'steppe_gate', name: 'The Border Stones', kind: 'gate', x: 2470, y: 625, territory: 'steppe', blurb: 'Where the last fence ends and the grass begins.' },
  { id: 'w1', name: 'Red Hill', kind: 'waypoint', x: 2520, y: 520, territory: 'steppe' },
  { id: 'w2', name: 'The Salt Pan', kind: 'waypoint', x: 2570, y: 450, territory: 'steppe' },
  { id: 'w3', name: 'Eagle Rocks', kind: 'waypoint', x: 2680, y: 500, territory: 'steppe' },
  { id: 'w4', name: 'The Long Water', kind: 'waypoint', x: 2740, y: 610, territory: 'steppe' },
  { id: 'w5', name: 'Bone Pass', kind: 'waypoint', x: 2620, y: 660, territory: 'steppe' },
  { id: 'w6', name: 'The Grey Wells', kind: 'waypoint', x: 2560, y: 640, territory: 'steppe' },
  { id: 'steppe_trade', name: "Khoja's Camp", kind: 'trade', x: 2610, y: 560, territory: 'steppe', blurb: 'A neutral trade camp. Everyone is welcome here, and everyone pays.' },
];

function dist(a: MapNode, b: MapNode) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function nodeById(id: string): MapNode {
  const n = NODES.find(n => n.id === id);
  if (!n) throw new Error(`unknown map node ${id}`);
  return n;
}
export function territoryOf(id: string): Territory { return nodeById(id).territory; }

const LINKS: Array<[string, string]> = [
  ['camp', 'ashford'], ['ashford', 'x1'], ['x1', 'millbrook'], ['x1', 'thornhill'],
  ['millbrook', 'greywater'], ['thornhill', 'kingsport'], ['greywater', 'kingsport'], ['x1', 'greywater'],
  ['greywater', 'steppe_gate'],
  ['steppe_gate', 'w6'], ['steppe_gate', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'w4'], ['w4', 'w5'], ['w5', 'w6'], ['w6', 'w1'],
  ['w1', 'steppe_trade'], ['w3', 'steppe_trade'], ['w5', 'steppe_trade'], ['w6', 'steppe_trade'],
];
export const EDGES: MapEdge[] = LINKS.map(([a, b]) => {
  const na = nodeById(a), nb = nodeById(b);
  const steppe = na.territory === 'steppe' && nb.territory === 'steppe';
  const per = steppe ? STEPPE.pxPerDay : TRAVEL.pxPerDay;
  return { a, b, days: Math.max(1, Math.round(dist(na, nb) / per)) };
});

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

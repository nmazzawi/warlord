// WorldMap.ts — the places you can stand on and the roads between them, in world-chart coordinates.
// Two territories so far: the homeland (fixed villages, Kingsport) and the Mongol steppe (waypoints
// that roaming camps drift between, one neutral trade camp). Travel costs days.

export type NodeKind = 'camp' | 'village' | 'town' | 'cross' | 'waypoint' | 'trade' | 'gate';
export type Territory = 'homeland' | 'steppe';

export interface MapNode {
  id: string; name: string; kind: NodeKind; x: number; y: number; territory: Territory;
  tier?: number;      // villages: 1..4
  layout?: string;    // villages / town: which raid layout
  blurb?: string;
}
export interface MapEdge { a: string; b: string; days: number; }

/** The homeland's own little map (the old 1480x1000 layout) squeezed into the Borderland on the chart. */
const H = (x: number, y: number) => ({ x: Math.round(3590 + ((x - 200) * 220) / 1040), y: Math.round(845 + ((y - 300) * 160) / 420) });

export const NODES: MapNode[] = [
  { id: 'camp', name: 'Bandit Camp', kind: 'camp', ...H(200, 720), territory: 'homeland', blurb: 'Home. Forge, barracks and stables.' },
  { id: 'ashford', name: 'Ashford', kind: 'village', ...H(470, 640), territory: 'homeland', tier: 1, layout: 'ashford', blurb: 'A sleepy hamlet on the old road.' },
  { id: 'x1', name: '', kind: 'cross', ...H(690, 540), territory: 'homeland' },
  { id: 'millbrook', name: 'Millbrook', kind: 'village', ...H(600, 330), territory: 'homeland', tier: 2, layout: 'millbrook', blurb: 'Lanes and a longhouse by the mill.' },
  { id: 'thornhill', name: 'Thornhill', kind: 'village', ...H(920, 660), territory: 'homeland', tier: 3, layout: 'thornhill', blurb: 'A warren of alleys under the hill.' },
  { id: 'greywater', name: 'Greywater', kind: 'village', ...H(1010, 300), territory: 'homeland', tier: 4, layout: 'greywater', blurb: 'Rich, proud, and wide open.' },
  { id: 'kingsport', name: 'Kingsport', kind: 'town', ...H(1240, 520), territory: 'homeland', layout: 'kingsport', blurb: 'A walled town with a standing garrison.' },
  // the steppe
  { id: 'steppe_gate', name: 'The Border Stones', kind: 'gate', x: 4195, y: 1085, territory: 'steppe', blurb: 'Where the last fence ends and the grass begins.' },
  { id: 'w1', name: 'Red Hill', kind: 'waypoint', x: 4300, y: 1010, territory: 'steppe' },
  { id: 'w2', name: 'The Salt Pan', kind: 'waypoint', x: 4430, y: 960, territory: 'steppe' },
  { id: 'w3', name: 'Eagle Rocks', kind: 'waypoint', x: 4600, y: 1000, territory: 'steppe' },
  { id: 'w4', name: 'The Long Water', kind: 'waypoint', x: 4680, y: 1110, territory: 'steppe' },
  { id: 'w5', name: 'Bone Pass', kind: 'waypoint', x: 4520, y: 1180, territory: 'steppe' },
  { id: 'w6', name: 'The Grey Wells', kind: 'waypoint', x: 4340, y: 1140, territory: 'steppe' },
  { id: 'steppe_trade', name: "Khoja's Camp", kind: 'trade', x: 4470, y: 1075, territory: 'steppe', blurb: 'A neutral trade camp. Everyone is welcome here, and everyone pays.' },
];

export function nodeById(id: string): MapNode {
  const n = NODES.find(n => n.id === id);
  if (!n) throw new Error(`unknown map node ${id}`);
  return n;
}
export function territoryOf(id: string): Territory { return nodeById(id).territory; }

/** Roads, and what each one costs in days. Days are fixed by hand — the chart's geometry can change
 *  (a redraw, a new continent) without ever changing how long a march takes. */
const LINKS: Array<[string, string, number]> = [
  ['camp', 'ashford', 3], ['ashford', 'x1', 3], ['x1', 'millbrook', 3], ['x1', 'thornhill', 3],
  ['millbrook', 'greywater', 5], ['thornhill', 'kingsport', 4], ['greywater', 'kingsport', 4], ['x1', 'greywater', 5],
  ['greywater', 'steppe_gate', 5],
  ['steppe_gate', 'w6', 2], ['steppe_gate', 'w1', 3], ['w1', 'w2', 2], ['w2', 'w3', 3], ['w3', 'w4', 3],
  ['w4', 'w5', 3], ['w5', 'w6', 1], ['w6', 'w1', 3],
  ['w1', 'steppe_trade', 2], ['w3', 'steppe_trade', 2], ['w5', 'steppe_trade', 2], ['w6', 'steppe_trade', 2],
];
export const EDGES: MapEdge[] = LINKS.map(([a, b, days]) => ({ a, b, days }));

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

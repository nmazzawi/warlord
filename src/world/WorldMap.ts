// WorldMap.ts — the places you can stand on, in world-chart coordinates. The homeland (fixed villages,
// Kingsport), the Mongol steppe (waypoints that roaming camps drift between, one neutral trade camp),
// and the capitals and great cities of every foreign realm you can reach on foot. The lines between
// homeland places are ROADS: they are drawn, and a march that follows one goes half again as fast,
// but nothing routes along them any more — you walk where you like.

import { ATLAS_EMPIRES, type PlaceKind } from './AtlasData';

export type NodeKind = 'camp' | 'village' | 'town' | 'cross' | 'waypoint' | 'trade' | 'gate' | 'foreign';
/** 'homeland', 'steppe', or the id of a foreign realm you have walked into. Every one of them keeps
 *  its own opinion of you — see GameState.territoryInfamy. */
export type Territory = string;

export interface MapNode {
  id: string; name: string; kind: NodeKind; x: number; y: number; territory: Territory;
  tier?: number;      // villages: 1..4
  layout?: string;    // villages / town: which raid layout
  blurb?: string;
  capital?: boolean;    // foreign: the realm's throne
  rank?: PlaceKind;     // foreign: how big a place it is, which decides its garrison
}
export interface MapEdge { a: string; b: string; days: number; }

/** The homeland's own little map (the old 1480x1000 layout) squeezed into the Borderland on the chart. */
const H = (x: number, y: number) => ({ x: Math.round(3590 + ((x - 200) * 220) / 1040), y: Math.round(845 + ((y - 300) * 160) / 420) });

const HOME: MapNode[] = [
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

/**
 * EVERY settlement of every realm on Earth: thrones, great cities, towns and the villages on their
 * fringe. All of them can be stood on and all of them can be attacked — what differs is how much is
 * in the square, and whether you can WALK there, which is the pathfinder's business and not this
 * list's. That last point is why the realms across the water are here too: you cannot march to Japan,
 * but if you were born there you are already standing in it, and its cities have to exist.
 * Their ids are derived from the atlas, so adding a place to a pack adds a place without touching
 * this file.
 */
export const FOREIGN: MapNode[] = ATLAS_EMPIRES
  .flatMap(e => e.places.map(p => ({
    id: `f_${e.id}_${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
    name: p.name, kind: 'foreign' as const, x: p.x, y: p.y, territory: e.id,
    blurb: p.note, capital: p.kind === 'capital', rank: p.kind,
  })));

/** Only the big places sell to a foreigner; a fringe village has nothing for a stranger but a fight. */
export function tradesWithForeigners(n: MapNode) { return n.rank === 'capital' || n.rank === 'city'; }

export const NODES: MapNode[] = [...HOME, ...FOREIGN];

/** The throne of a realm, as somewhere you can march to. */
export function capitalOf(realm: string): MapNode | null {
  return FOREIGN.find(n => n.territory === realm && n.capital) ?? null;
}

export function nodeById(id: string): MapNode {
  const n = NODES.find(n => n.id === id);
  if (!n) throw new Error(`unknown map node ${id}`);
  return n;
}
export function territoryOf(id: string): Territory { return nodeById(id).territory; }

/** The roads themselves. The number is what the leg used to cost in days, kept only so the terrain
 *  grid can weight the older, better-trodden roads; nothing reads it as a travel time. */
const LINKS: Array<[string, string, number]> = [
  ['camp', 'ashford', 3], ['ashford', 'x1', 3], ['x1', 'millbrook', 3], ['x1', 'thornhill', 3],
  ['millbrook', 'greywater', 5], ['thornhill', 'kingsport', 4], ['greywater', 'kingsport', 4], ['x1', 'greywater', 5],
  ['greywater', 'steppe_gate', 5],
  ['steppe_gate', 'w6', 2], ['steppe_gate', 'w1', 3], ['w1', 'w2', 2], ['w2', 'w3', 3], ['w3', 'w4', 3],
  ['w4', 'w5', 3], ['w5', 'w6', 1], ['w6', 'w1', 3],
  ['w1', 'steppe_trade', 2], ['w3', 'steppe_trade', 2], ['w5', 'steppe_trade', 2], ['w6', 'steppe_trade', 2],
];
export const EDGES: MapEdge[] = LINKS.map(([a, b, days]) => ({ a, b, days }));

/** Roads are drawn features and a speed bonus now — nothing routes along them. Travel is free
 *  movement across the terrain (see Terrain.ts), so the old Dijkstra over this graph is gone. */

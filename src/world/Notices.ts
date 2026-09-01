// Notices.ts — the board by the market. Small work, honestly paid: carry something to a named place,
// or go and kill a party that has been named to you. The offer a board makes is deterministic per
// settlement per day, so it is the same job whether you look at it now or after a fight, and it
// changes when the world does.
import { GameState } from '../state/GameState';
import { mulberry32 } from '../utils/rng';
import { nodeById, NODES, type MapNode } from './WorldMap';
import { REGIONS } from './WorldChart';
import { componentNear, routeToPlace } from './Terrain';
import type { Quest } from '../state/GameState';

const PARCEL = ['a sealed letter', 'a strongbox', 'a bolt of cloth', 'a reliquary', 'a bag of seed grain',
  'a debt written on vellum', 'a smith’s pattern', 'a jar of oil', 'a dead man’s ring'];

/** What this board is offering today. Null if there is nothing worth your while. */
export function noticeFor(settlementId: string): Omit<Quest, 'id'> | null {
  let here;
  try { here = nodeById(settlementId); } catch { return null; }
  const rnd = mulberry32(hash(settlementId) + GameState.day * 7919);
  // half the time the work is a delivery, half the time it is a killing
  if (rnd() < 0.55) {
    const to = deliveryTarget(here, rnd);
    if (!to) return null;
    return {
      kind: 'deliver', to: to.node.id, from: here.name,
      text: `${PARCEL[Math.floor(rnd() * PARCEL.length)]} to ${to.node.name}`,
      reward: Math.round(40 + to.days * 9),
      days: to.days,
    };
  }
  const realm = here.territory;
  const who = realmName(realm);
  return {
    kind: 'hunt', realm, from: here.name,
    text: `bring down the next party ${who} sends after you`,
    reward: Math.round(70 + GameState.territoryInfamy(realm) * 2),
  };
}

/**
 * Nobody hires a courier for a place he cannot be walked to. A board only ever names a real
 * settlement on its own landmass — no sea crossing, because there are no ships yet — between three
 * and twelve days' march away, so the job is worth taking and can actually be finished.
 */
export const QUEST_DAYS = { min: 3, max: 12 };
function deliveryTarget(here: MapNode, rnd: () => number): { node: MapNode; days: number } | null {
  const land = componentNear(here.x, here.y);
  const named = NODES.filter(n => n.id !== here.id && !!n.name
    && n.kind !== 'cross' && n.kind !== 'waypoint' && n.kind !== 'camp'
    && (!land || componentNear(n.x, n.y) === land));
  // sorted so the pick is stable for a given board and day, then routed only until one fits — a
  // board is looked at often and the pathfinder is not free
  const order = named
    .map(n => ({ n, d: Math.hypot(n.x - here.x, n.y - here.y) }))
    .sort((a, b) => a.d - b.d)
    .filter(x => x.d > 120);
  const start = Math.floor(rnd() * Math.max(1, order.length));
  for (let i = 0; i < order.length; i++) {
    const cand = order[(start + i) % order.length].n;
    const r = routeToPlace([here.x, here.y], [cand.x, cand.y]);
    if (!r) continue;
    const days = Math.max(1, Math.round(r.days));
    if (days < QUEST_DAYS.min || days > QUEST_DAYS.max) continue;
    return { node: cand, days };
  }
  return null;
}

/** A country as it would be named on a board, not as a status-bar abbreviation. */
function realmName(realm: string) {
  if (realm === 'homeland') return 'the Borderland';
  const r = REGIONS.find(x => x.id === realm || (realm === 'steppe' && x.id === 'mongolia'));
  return r ? r.name : 'the local lord';
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

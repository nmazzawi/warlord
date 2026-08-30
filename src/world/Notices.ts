// Notices.ts — the board by the market. Small work, honestly paid: carry something to a named place,
// or go and kill a party that has been named to you. The offer a board makes is deterministic per
// settlement per day, so it is the same job whether you look at it now or after a fight, and it
// changes when the world does.
import { GameState } from '../state/GameState';
import { mulberry32 } from '../utils/rng';
import { nodeById, NODES } from './WorldMap';
import { REGIONS } from './WorldChart';
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
    // somewhere you could actually walk to, and far enough that it is worth paying for
    const candidates = NODES.filter(n => n.id !== settlementId && n.kind !== 'cross' && n.kind !== 'waypoint'
      && Math.hypot(n.x - here.x, n.y - here.y) > 90 && Math.hypot(n.x - here.x, n.y - here.y) < 900);
    if (!candidates.length) return null;
    const to = candidates[Math.floor(rnd() * candidates.length)];
    const dist = Math.hypot(to.x - here.x, to.y - here.y);
    return {
      kind: 'deliver', to: to.id, from: here.name,
      text: `${PARCEL[Math.floor(rnd() * PARCEL.length)]} to ${to.name}`,
      reward: Math.round(40 + dist * 0.22),
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

/** A country as it would be named on a board, not as a status-bar abbreviation. */
function realmName(realm: string) {
  if (realm === 'homeland') return 'the Borderland';
  const r = REGIONS.find(x => x.id === realm || (realm === 'steppe' && x.id === 'mongolia'));
  return r ? r.name : 'the local lord';
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

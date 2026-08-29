// Steppe.ts — the roaming camps: three warbands that drift around the waypoint ring, one hop a day.
// Where a camp stands on a given day is pure arithmetic, so a save never disagrees with the map.
import { STEPPE } from '../config/balance';
import { GameState } from '../state/GameState';

export interface RoamingCamp { id: string; name: string; leader: string; offset: number; }
const RING = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
export const CAMPS: RoamingCamp[] = [
  { id: 'camp_boke', name: "Böke's camp", leader: 'Böke', offset: 0 },
  { id: 'camp_temur', name: "Temür's camp", leader: 'Temür', offset: 2 },
  { id: 'camp_saran', name: "Saran's camp", leader: 'Saran', offset: 4 },
];

/** Waypoint a camp stands at on a given day (null while it is scattered after a raid). */
export function campLocation(camp: RoamingCamp, day = GameState.day): string | null {
  const until = GameState.campScattered[camp.id] ?? -1;
  if (day < until) return null;
  return RING[(day + camp.offset) % RING.length];
}
export function campAt(nodeId: string, day = GameState.day): RoamingCamp | null {
  return CAMPS.find(c => campLocation(c, day) === nodeId) ?? null;
}
export function campById(id: string) { return CAMPS.find(c => c.id === id)!; }
export function scatterCamp(campId: string) { GameState.campScattered[campId] = GameState.day + STEPPE.scatterDays; }
export function isHunted() { return GameState.day < GameState.huntedUntil; }

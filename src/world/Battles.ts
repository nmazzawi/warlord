// Battles.ts — turns "raid this village" or "a patrol found you" into a concrete battle setup.
import { GameState } from '../state/GameState';
import { SIEGE, STEPPE } from '../config/balance';
import { campById } from './Steppe';
import { LAYOUTS } from './Layouts';
import { nodeById, type MapNode } from './WorldMap';
import type { PlaceKind } from './AtlasData';
import type { EnemyKind } from '../entities/Enemy';

export interface DefenderCounts { militia: number; archers: number; captains: number; statMult: number; goldMult: number; }

/** "2 archers", "1 archer" — never "1 archers". */
export const many = (n: number, one: string, plural: string) => `${n} ${n === 1 ? one : plural}`;

/** The one elite a realm fields, for as long as its own milestone is still ahead of it. */
export interface EliteSpec { kind: EnemyKind; count: number; name: string; plural: string; tint: number; reforms: number; }

export interface BattleConfig {
  kind: 'village' | 'patrol' | 'siege' | 'camp' | 'steppePatrol' | 'foreign' | 'foreignPatrol';
  layoutId: string;
  name: string;         // "Ashford" / "Road patrol"
  title: string;        // banner
  hint: string;
  defenders: DefenderCounts;
  palisade: boolean;
  villageId?: string;
  campId?: string;
  tier?: number;
  /** steppe battles: mounted defenders instead of militia/archers/captains */
  steppe?: { horsearchers: number; riders: number; noyans: number };
  /** foreign battles: the realm's own men, standing with the militia */
  elite?: EliteSpec;
  /** foreign battles: whose country this is */
  realm?: string;
  rank?: PlaceKind;
}

/** Which map an empire's settlement is fought on. Generic until each realm's milestone draws its own:
 *  a fringe village is open ground, everything above it is walled. */
const FOREIGN_LAYOUTS: Record<PlaceKind, string[]> = {
  village: ['ashford', 'millbrook'],
  town: ['thornhill', 'millbrook'],
  city: ['greywater', 'thornhill'],
  capital: ['greywater'],
};
function foreignLayout(n: MapNode) {
  const list = FOREIGN_LAYOUTS[n.rank ?? 'town'];
  let h = 0;
  for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}

/** An assault on a foreign settlement. Nothing here checks whether it is wise. */
export function foreignBattle(nodeId: string): BattleConfig {
  const node = nodeById(nodeId);
  const info = GameState.foreignInfo(nodeId);
  const layout = LAYOUTS[foreignLayout(node)];
  const walls = info.rank !== 'village';
  return {
    kind: 'foreign', layoutId: layout.id, name: node.name,
    title: `ASSAULT — ${node.name.toUpperCase()}`,
    hint: `${info.total} defenders: ${info.militia} militia, ${many(info.archers, 'archer', 'archers')}, ${many(info.captains, 'captain', 'captains')}, and ${many(info.elites, info.eliteName, info.elitePlural)}.\n${info.eliteNote}`,
    defenders: { militia: info.militia, archers: info.archers, captains: info.captains, statMult: info.statMult, goldMult: info.goldMult },
    palisade: walls, villageId: nodeId, tier: info.tierish, realm: info.realm, rank: info.rank,
    elite: { kind: info.eliteKind, count: info.elites, name: info.eliteName, plural: info.elitePlural, tint: info.tint, reforms: info.reforms },
  };
}

/** A realm's riders, caught up with you inside its borders. */
export function foreignPatrolBattle(realm: string): BattleConfig {
  const p = GameState.foreignPatrol(realm);
  const layout = LAYOUTS.field;
  return {
    kind: 'foreignPatrol', layoutId: layout.id, name: p.name, title: p.title, hint: p.hint,
    defenders: { militia: p.militia, archers: p.archers, captains: p.captains, statMult: p.statMult, goldMult: p.goldMult },
    palisade: false, realm,
    elite: { kind: p.eliteKind, count: p.elites, name: p.eliteName, plural: p.elitePlural, tint: p.tint, reforms: 0 },
  };
}

export function villageBattle(nodeId: string): BattleConfig {
  const node = nodeById(nodeId);
  const info = GameState.villageInfo(nodeId);
  const layout = LAYOUTS[node.layout ?? 'ashford'];
  return {
    kind: 'village', layoutId: layout.id, name: node.name, title: `RAID — ${node.name.toUpperCase()}`,
    hint: layout.hint + (info.palisade ? `\nThey have raised a palisade — ${layout.palisade?.gaps.length ?? 1} gate${(layout.palisade?.gaps.length ?? 1) === 1 ? '' : 's'}.` : ''),
    defenders: { militia: info.militia, archers: info.archers, captains: info.captains, statMult: info.statMult, goldMult: info.goldMult },
    palisade: info.palisade, villageId: nodeId, tier: info.tier,
  };
}

export function siegeBattle(): BattleConfig {
  const node = nodeById('kingsport');
  const layout = LAYOUTS.kingsport;
  return {
    kind: 'siege', layoutId: layout.id, name: node.name, title: 'SIEGE — KINGSPORT', hint: layout.hint,
    defenders: { militia: 0, archers: SIEGE.wallArchers, captains: 0, statMult: 1.0, goldMult: 1.0 },
    palisade: false, villageId: 'kingsport', tier: 4,
  };
}

export function campBattle(campId: string): BattleConfig {
  const camp = campById(campId);
  const layout = LAYOUTS.steppe;
  const c = STEPPE.camp;
  const tierMult = 1 + GameState.steppeTier * 0.15;
  return {
    kind: 'camp', layoutId: layout.id, name: camp.name, title: `RAID — ${camp.name.toUpperCase()}`, hint: layout.hint,
    defenders: { militia: 0, archers: 0, captains: 0, statMult: c.statMult * tierMult, goldMult: c.goldMult },
    palisade: false, campId, steppe: { horsearchers: c.horsearchers, riders: c.riders, noyans: c.noyans },
  };
}

export function steppePatrolBattle(): BattleConfig {
  const layout = LAYOUTS.steppeField;
  const p = STEPPE.patrol;
  return {
    kind: 'steppePatrol', layoutId: layout.id, name: 'Steppe riders', title: 'RIDERS ON THE GRASS', hint: layout.hint,
    defenders: { militia: 0, archers: 0, captains: 0, statMult: p.statMult, goldMult: p.goldMult },
    palisade: false, steppe: { horsearchers: p.horsearchers, riders: p.riders, noyans: p.noyans },
  };
}

export function patrolBattle(): BattleConfig {
  const p = GameState.patrolConfig() ?? { militia: 5, archers: 1, captains: 0, statMult: 1.1, goldMult: 0.8 };
  const layout = LAYOUTS.field;
  return {
    kind: 'patrol', layoutId: layout.id, name: 'Road patrol', title: 'ROAD PATROL',
    hint: layout.hint,
    defenders: { militia: p.militia, archers: p.archers, captains: p.captains, statMult: p.statMult, goldMult: p.goldMult },
    palisade: false,
  };
}

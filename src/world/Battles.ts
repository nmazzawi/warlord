// Battles.ts — turns "raid this village" or "a patrol found you" into a concrete battle setup.
import { GameState } from '../state/GameState';
import { SIEGE } from '../config/balance';
import { LAYOUTS } from './Layouts';
import { nodeById } from './WorldMap';

export interface DefenderCounts { militia: number; archers: number; captains: number; statMult: number; goldMult: number; }

export interface BattleConfig {
  kind: 'village' | 'patrol' | 'siege';
  layoutId: string;
  name: string;         // "Ashford" / "Road patrol"
  title: string;        // banner
  hint: string;
  defenders: DefenderCounts;
  palisade: boolean;
  villageId?: string;
  tier?: number;
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

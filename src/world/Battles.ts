// Battles.ts — turns "raid this village" or "a patrol found you" into a concrete battle setup.
import { GameState } from '../state/GameState';
import { LAYOUTS } from './Layouts';
import { nodeById } from './WorldMap';

export interface DefenderCounts { militia: number; archers: number; captains: number; statMult: number; goldMult: number; }

export interface BattleConfig {
  kind: 'village' | 'patrol';
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
    hint: layout.hint + (info.palisade ? '\nThey have raised a palisade — find the gate.' : ''),
    defenders: { militia: info.militia, archers: info.archers, captains: info.captains, statMult: info.statMult, goldMult: info.goldMult },
    palisade: info.palisade, villageId: nodeId, tier: info.tier,
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

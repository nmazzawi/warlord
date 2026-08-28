// Stock.ts — what each settlement's buildings sell. Services are conquest-gated: only the camp and
// places you occupy have any. Kingsport's stock beats every village's.
import type { HorseKind, TroopKind } from '../state/GameState';
import { nodeById } from './WorldMap';

export type ForgeItem = 'leather' | 'plate' | 'round' | 'kite' | 'bow';
export interface StockDef {
  forge: { swordMaxTier: number; items: ForgeItem[] };
  barracks: { kind: TroopKind } | null;
  stables: HorseKind[];
}

export function stockFor(settlementId: string): StockDef {
  if (settlementId === 'camp') {
    return { forge: { swordMaxTier: 3, items: ['leather', 'round', 'bow'] }, barracks: { kind: 'raider' }, stables: ['courser', 'destrier'] };
  }
  const node = nodeById(settlementId);
  if (node.kind === 'town') {
    return { forge: { swordMaxTier: 3, items: ['leather', 'plate', 'round', 'kite', 'bow'] }, barracks: { kind: 'guard' }, stables: ['courser', 'destrier'] };
  }
  // villages: a modest local forge, levies, a courser if you're lucky
  return { forge: { swordMaxTier: 2, items: ['leather', 'round'] }, barracks: { kind: 'levy' }, stables: (node.tier ?? 1) >= 2 ? ['courser'] : [] };
}

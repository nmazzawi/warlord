// Stock.ts — what each settlement's buildings sell. Services are conquest-gated: only the camp and
// places you occupy sell freely. Unconquered places you merely VISIT sell less, at a markup, and
// will not recruit for you. Kingsport's stock beats every village's.
import type { HorseKind, TroopKind } from '../state/GameState';
import { nodeById } from './WorldMap';
import { visitOf } from './Realms';

export type ForgeItem = 'leather' | 'plate' | 'round' | 'kite' | 'bow' | 'composite';
export interface StockDef {
  forge: { swordMaxTier: number; items: ForgeItem[] };
  barracks: { kind: TroopKind } | null;
  stables: HorseKind[];
  inn: boolean;
  /** price multiplier (1 = your own place, 1.5 = visiting as a customer) */
  markup: number;
}

export const VISIT_MARKUP = 1.5;

export function stockFor(settlementId: string, visiting = false): StockDef {
  if (settlementId === 'camp') {
    return { forge: { swordMaxTier: 3, items: ['leather', 'round', 'bow'] }, barracks: { kind: 'raider' }, stables: ['courser', 'destrier'], inn: false, markup: 1 };
  }
  const node = nodeById(settlementId);
  if (node.kind === 'foreign') {
    // a foreign city sells what its own people make, at what it thinks a stranger is worth, and will
    // not put a spear in your hand at any price — unless you took the place, in which case its
    // workshops are yours and its people fight for whoever holds the walls
    const v = visitOf(node.territory);
    const items = v ? v.forge.items : (['leather'] as ForgeItem[]);
    const tier = v ? v.forge.swordMaxTier : 1;
    if (!visiting) {
      return { forge: { swordMaxTier: Math.max(2, tier), items }, barracks: { kind: node.rank === 'village' ? 'levy' : 'guard' },
        stables: v && v.stables.horses.length ? v.stables.horses : ['courser'], inn: true, markup: 1 };
    }
    return { forge: { swordMaxTier: tier, items }, barracks: null, stables: v ? v.stables.horses : [], inn: true, markup: v ? v.markup : 2.2 };
  }
  if (node.kind === 'trade') {
    // Khoja's camp: neutral, no markup, steppe goods — the composite bow and mounted archers for hire
    return { forge: { swordMaxTier: 1, items: ['leather', 'composite'] }, barracks: { kind: 'rider' }, stables: ['courser'], inn: true, markup: 1 };
  }
  if (node.kind === 'town') {
    return visiting
      ? { forge: { swordMaxTier: 2, items: ['leather', 'round'] }, barracks: null, stables: ['courser'], inn: true, markup: VISIT_MARKUP }
      : { forge: { swordMaxTier: 3, items: ['leather', 'plate', 'round', 'kite', 'bow'] }, barracks: { kind: 'guard' }, stables: ['courser', 'destrier'], inn: true, markup: 1 };
  }
  const tier = node.tier ?? 1;
  return visiting
    ? { forge: { swordMaxTier: 1, items: ['leather'] }, barracks: null, stables: tier >= 3 ? ['courser'] : [], inn: true, markup: VISIT_MARKUP }
    : { forge: { swordMaxTier: 2, items: ['leather', 'round'] }, barracks: { kind: 'levy' }, stables: tier >= 2 ? ['courser'] : [], inn: true, markup: 1 };
}

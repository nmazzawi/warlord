// Units.ts — one place to ask what a man in your warband is, whoever recruited him. The four the game
// began with (raider, levy, town guard, steppe rider) still live in balance.ts; every culture's own
// roster lives in Civs.ts. A warband late in a run is cross-cultural, so nothing may assume that a
// troop's kind belongs to any one list.
import { TROOP_KINDS } from '../config/balance';
import { CIVS, type UnitDef } from './Civs';

export interface UnitStats {
  id: string; label: string; hp: number; damage: number; cost: number; wage: number;
  tint: number; desc: string; signature: string; role: string;
  /** ranged units keep their distance and shoot; everyone else closes */
  ranged: boolean;
  /** and the mounted ones do it from a horse */
  mounted: boolean;
}

const LEGACY_WAGE = 2;
const cache = new Map<string, UnitStats>();

/** Every unit in the game, whichever list it came from. Unknown ids fall back to a plain raider. */
export function unitDef(id: string): UnitStats {
  const hit = cache.get(id);
  if (hit) return hit;
  let out: UnitStats;
  const legacy = (TROOP_KINDS as Record<string, { label: string; hp: number; damage: number; cost: number; tint: number; desc: string }>)[id];
  if (legacy) {
    out = { id, label: legacy.label, hp: legacy.hp, damage: legacy.damage, cost: legacy.cost, wage: LEGACY_WAGE,
      tint: legacy.tint, desc: legacy.desc, signature: '', role: id === 'guard' ? 'elite' : 'line',
      ranged: id === 'rider', mounted: id === 'rider' };
  } else {
    let found: UnitDef | null = null;
    for (const c of Object.values(CIVS)) { const u = c.troops.find(t => t.id === id); if (u) { found = u; break; } }
    if (found) {
      out = { id, label: found.name, hp: found.hp, damage: found.attack, cost: found.cost, wage: found.wage,
        tint: tintFor(found), desc: found.desc, signature: found.signature, role: found.role,
        ranged: found.range > 60, mounted: found.speed >= 185 };
    } else {
      const r = TROOP_KINDS.raider;
      out = { id: 'raider', label: r.label, hp: r.hp, damage: r.damage, cost: r.cost, wage: LEGACY_WAGE,
        tint: r.tint, desc: r.desc, signature: '', role: 'line', ranged: false, mounted: false };
    }
  }
  cache.set(id, out);
  return out;
}

/** Line troops keep the warband's own green; the men who cost you keep something of their country. */
function tintFor(u: UnitDef) {
  return u.role === 'elite' ? 0xffe0a0 : u.role === 'specialist' ? 0xc8e0ff : 0xffffff;
}

export function clearUnitCache() { cache.clear(); }

// Hunters.ts — the parties that come looking for you. Once your name is worth something, riders start
// working the country you are in: they appear a few days' ride away, move every day, and close on you
// when they catch your scent. There is no dice roll on a road any more — you can see them coming, and
// you can try to lose them. Get close enough and there is no avoiding the fight.
import { HUNT, INFAMY, STEPPE } from '../config/balance';
import { NODES, type Territory } from './WorldMap';
import { isLand, nearestLand, route, stepAlong } from './Terrain';
import type { Pt } from './geo';

export interface Hunter {
  id: number;
  x: number; y: number;
  /** Which kind of party: your homeland's bounty riders, or the steppe camps' horsemen. */
  kind: Territory;
  /** How many days it has been hunting — they give up eventually. */
  age: number;
}

/** How close a party must get before contact is forced, in world units. */
export const CONTACT = 26;
/** How far away they first appear. */
const SPAWN_MIN = 150, SPAWN_MAX = 330;
/** How far they can smell you: beyond this they wander toward your last known ground. */
const SCENT = 520;
/** They lose interest after this many days. */
const PATIENCE = 14;

/** Which territory a point belongs to — the nearest place decides, so the field still has a flavour. */
export function nearestTerritory(x: number, y: number): Territory {
  let best: Territory = 'homeland', bd = Infinity;
  for (const n of NODES) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = n.territory; }
  }
  return best;
}

/**
 * How many parties a country has out. Being wanted should be weather, not a metronome: one party at a
 * time until the whole chart is awake, and nobody at all until a country grades you Raider. A hunt you
 * survive is a story; a hunt every third day is a chore.
 */
export function wanted(tier: number, hunted: boolean) {
  if (tier < HUNT.fromTier && !hunted) return 0;
  return tier >= INFAMY.tiers.length - 1 ? HUNT.maxPartiesAtWorldThreat : HUNT.maxParties;
}

function spawnNear(x: number, y: number, rnd: () => number): Pt | null {
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const d = SPAWN_MIN + rnd() * (SPAWN_MAX - SPAWN_MIN);
    const p: Pt = [x + Math.cos(a) * d, y + Math.sin(a) * d];
    if (isLand(p[0], p[1])) return p;
    const near = nearestLand(p[0], p[1], 4);
    if (near) return near;
  }
  return null;
}

export interface HuntResult { hunters: Hunter[]; caught: Hunter | null; }

/**
 * A day passes for every hunting party: the ones that have you in their nose close in, the rest drift
 * your way, the bored ones go home, and a new party may set out. Returns the first one to reach you.
 */
export function advanceHunters(
  hunters: Hunter[], pos: { x: number; y: number }, days: number,
  opts: { tier: number; hunted: boolean; territory: Territory; mounted: boolean; rnd: () => number;
    /** No party sets out in a country whose last one you just put down. */
    quiet?: boolean; },
): HuntResult {
  const out: Hunter[] = [];
  let caught: Hunter | null = null;
  for (const h of hunters) {
    const next: Hunter = { ...h, age: h.age + days };
    if (next.age > PATIENCE) continue;                    // given up
    const d = Math.hypot(pos.x - next.x, pos.y - next.y);
    if (d < SCENT) {
      const step = stepAlong([next.x, next.y], [pos.x, pos.y], days * (next.kind === 'steppe' ? 1.25 : 1), true);
      next.x = step[0];
      next.y = step[1];
    }
    if (Math.hypot(pos.x - next.x, pos.y - next.y) <= CONTACT && !caught) caught = next;
    out.push(next);
  }
  // do the country's riders want another party out? Only a country that has heard of you does: a
  // foreign realm you have just walked into grades you at nothing, and nobody there is looking.
  const tier = opts.tier;
  const want = opts.quiet ? 0 : wanted(tier, opts.hunted && opts.territory === 'steppe');
  const here = out.filter(h => h.kind === opts.territory).length;
  if (here < want && opts.rnd() < (opts.territory === 'steppe' ? STEPPE.huntChance : (INFAMY.interceptChance[tier] ?? 0)) * days) {
    const at = spawnNear(pos.x, pos.y, opts.rnd);
    if (at) out.push({ id: Date.now() + Math.floor(opts.rnd() * 1000), x: at[0], y: at[1], kind: opts.territory, age: 0 });
  }
  return { hunters: out, caught };
}

/** Is a party close enough that it will catch you before you get where you are going? */
export function threatens(h: Hunter, from: Pt, to: Pt) {
  const r = route(from, to, true);
  if (!r) return false;
  for (const p of r.points) if (Math.hypot(p[0] - h.x, p[1] - h.y) <= CONTACT) return true;
  return false;
}

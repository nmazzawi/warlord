// Combat.ts — the single place damage is applied, so every hit gets the same feedback:
// number, spark burst, flash, knockback, sound.
import type { RaidScene } from '../scenes/RaidScene';
import type { Unit } from '../entities/Unit';
import { Hero } from '../entities/Hero';
import { COLORS } from './Textures';
import { Sound } from './Sound';

export type DamageSource = 'hero' | 'charge' | 'troop' | 'enemy';

/** Returns true if the hit killed the target. */
export function dealDamage(raid: RaidScene, target: Unit, amount: number, srcX: number, srcY: number, knockback: number, source: DamageSource): boolean {
  if (!target.alive) return false;
  if (target instanceof Hero && target.dashing) {
    raid.juice.damageNumber(target.x, target.y - 24, 'dodge', 0xffffff, 12);
    return false;
  }
  const amt = Math.max(1, Math.round(amount));
  const isPlayer = target.team === 'player';
  const isHero = target instanceof Hero;
  const killed = target.damage(amt, srcX, srcY, knockback);

  const color = isHero ? COLORS.hurt : isPlayer ? COLORS.troopHurt : 0xffffff;
  const big = source === 'hero' || source === 'charge';
  raid.juice.damageNumber(target.x, target.y - target.radius - 10, String(amt), color, big ? 19 : 13);
  raid.juice.burst(target.x, target.y, isPlayer ? 0xff6a6a : 0xffd9a0, big ? 8 : 4);

  if (isHero) { Sound.heroHurt(); raid.juice.shake(0.004, 90); }
  else if (isPlayer) Sound.troopHurt();
  else if (source === 'troop') Sound.troopHit();
  return killed;
}

// Enemy.ts — village defenders. Three kinds with different *behaviour*:
//   militia  — swarm and try to surround you (each claims a slot around the hero)
//   archer   — keeps its distance and shoots; backs off when you get close
//   captain  — slow, huge hits with a long, obvious wind-up you can step out of
import Phaser from 'phaser';
import { Unit } from './Unit';
import type { Hero } from './Hero';
import type { Troop } from './Troop';
import type { RaidScene } from '../scenes/RaidScene';
import { ENEMIES, SURROUND } from '../config/balance';
import { TEX } from '../systems/Textures';
import { dealDamage } from '../systems/Combat';
import { hasLineOfSight } from '../systems/LineOfSight';

export type EnemyKind = 'militia' | 'archer' | 'captain';

export interface EnemyMult { hp: number; dmg: number; gold: number; }

export class Enemy extends Unit {
  readonly kind: EnemyKind;
  readonly goldValue: number;
  readonly damageAmount: number;
  aggro = false;
  target: Unit | null = null;
  /** Assigned by SurroundManager when this militia is hunting the hero. */
  slotAngle: number | null = null;
  private stats: { speed: number; cooldown: number; windup: number; reach: number; aggro: number };
  private post: Phaser.Math.Vector2;
  private wanderTarget: Phaser.Math.Vector2;
  private wanderTimer = 0;
  private attackTimer = 0;
  private retargetTimer = 0;
  private windupTimer = 0;
  private windingUp = false;
  private stuckTimer = 0;
  private detourUntil = 0;
  private lastPos: Phaser.Math.Vector2;
  private telegraph: Phaser.GameObjects.Image | null = null;
  private tmp = new Phaser.Math.Vector2();

  constructor(scene: RaidScene, x: number, y: number, kind: EnemyKind, mult: EnemyMult) {
    const s = ENEMIES[kind];
    const tex = kind === 'militia' ? TEX.militia : kind === 'archer' ? TEX.archer : TEX.captain;
    super(scene, x, y, tex, {
      hp: Math.round(s.hp * mult.hp), speed: s.speed, radius: s.radius, team: 'enemy', barColor: 0xe0453a,
      barWidth: kind === 'captain' ? 34 : 22,
    });
    this.kind = kind;
    this.stats = { speed: s.speed, cooldown: s.cooldown, windup: s.windup, reach: s.reach, aggro: s.aggro };
    this.damageAmount = s.damage * mult.dmg;
    this.goldValue = Math.round(Phaser.Math.Between(s.gold[0], s.gold[1]) * mult.gold);
    this.post = new Phaser.Math.Vector2(x, y);
    this.lastPos = new Phaser.Math.Vector2(x, y);
    this.wanderTarget = new Phaser.Math.Vector2(x, y);
    this.wanderTimer = Phaser.Math.FloatBetween(0.5, 2.5);
    this.attackTimer = Phaser.Math.FloatBetween(0, 0.5); // so a group doesn't swing in perfect unison
  }

  /** Wake up and start hunting. Also shouts to nearby friends (who wake without shouting on). */
  wake() {
    if (this.aggro || !this.alive) return;
    this.wakeQuiet();
    this.raid.alertNear(this.x, this.y, SURROUND.alertRadius);
  }

  /** Wake up without relaying the alarm — keeps the village coming in waves, not all at once. */
  wakeQuiet() {
    if (this.aggro || !this.alive) return;
    this.aggro = true;
    this.flash(70);
  }

  update(dt: number, hero: Hero, troops: Troop[]) {
    this.attackTimer -= dt;
    this.retargetTimer -= dt;

    if (!this.aggro) {
      this.idle(dt, hero, troops);
      this.applyVelocity(dt);
      return;
    }

    // never change target mid-swing: the telegraph must land where it was aimed
    if (!this.windingUp && (this.retargetTimer <= 0 || !this.target || !this.target.alive)) {
      this.retargetTimer = 0.3;
      this.target = this.pickTarget(hero, troops);
    }
    if (!this.target) { this.desired.set(0, 0); this.applyVelocity(dt); return; }

    if (this.windingUp) {
      this.windupTimer -= dt;
      this.desired.set(0, 0);
      // swell up as the blow approaches; snapping back to normal size IS the strike
      const p = 1 - Math.max(0, this.windupTimer) / this.stats.windup;
      const grow = this.kind === 'captain' ? 1.4 : 1.22;
      this.setScale(1 + (grow - 1) * p * p);
      if (this.windupTimer <= 0) this.finishAttack();
      this.applyVelocity(dt);
      return;
    }

    switch (this.kind) {
      case 'militia': this.militia(hero); break;
      case 'archer': this.archer(); break;
      case 'captain': this.captain(); break;
    }
    this.trackStuck(dt);
    this.applyVelocity(dt);
  }

  /** Shuffle around the post; notice the hero or troops when they get close. */
  private idle(dt: number, hero: Hero, troops: Troop[]) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = Phaser.Math.FloatBetween(1.5, 3.5);
      this.wanderTarget.set(this.post.x + Phaser.Math.Between(-30, 30), this.post.y + Phaser.Math.Between(-30, 30));
    }
    const d = this.moveToward(this.wanderTarget.x, this.wanderTarget.y, this.stats.speed * 0.35, 20);
    if (d < 4) this.desired.set(0, 0);
    if (hero.alive && this.distTo(hero) < this.stats.aggro) { this.wake(); return; }
    for (const t of troops) if (t.alive && this.distTo(t) < this.stats.aggro * 0.8) { this.wake(); return; }
  }

  /** Nearest player unit, with a preference for the hero. Sticks with the current target unless clearly better. */
  private pickTarget(hero: Hero, troops: Troop[]): Unit | null {
    const heroBias = this.kind === 'archer' ? 0.6 : 0.75;
    const score = (u: Unit) => {
      const d = this.distTo(u);
      if (u === hero) return d * heroBias;
      return this.edgeDistTo(u) < 18 ? d * 0.5 : d; // a troop pressed against me is in my way
    };
    let best: Unit | null = null, bestScore = Infinity;
    if (hero.alive) { best = hero; bestScore = score(hero); }
    for (const t of troops) {
      if (!t.alive) continue;
      const s = score(t);
      if (s < bestScore) { best = t; bestScore = s; }
    }
    if (this.target && this.target.alive && this.target !== best && bestScore > score(this.target) * 0.8) return this.target;
    return best;
  }

  private militia(hero: Hero) {
    const t = this.target!;
    const ed = this.edgeDistTo(t);
    if (ed <= this.stats.reach) {
      this.desired.set(0, 0);
      if (this.attackTimer <= 0) this.beginWindup();
      return;
    }
    if (this.followFlow(t === hero && this.distTo(t) > 110)) return;
    if (t === hero && this.slotAngle !== null) {
      const R = hero.radius + this.radius + SURROUND.slotPadding;
      const a0 = Math.atan2(this.y - hero.y, this.x - hero.x);
      const diff = Phaser.Math.Angle.Wrap(this.slotAngle - a0);
      if (Math.abs(diff) > 0.6) {
        // my slot is round the other side: walk AROUND the hero, not through them
        const a1 = a0 + Math.sign(diff) * 0.9;
        this.moveToward(hero.x + Math.cos(a1) * (R + 16), hero.y + Math.sin(a1) * (R + 16), this.stats.speed);
      } else {
        this.moveToward(hero.x + Math.cos(this.slotAngle) * R, hero.y + Math.sin(this.slotAngle) * R, this.stats.speed, 12);
      }
    } else {
      this.moveToward(t.x, t.y, this.stats.speed);
    }
  }

  /** Steer along the flow field (which leads to the hero) when far away or when detouring round a hut. */
  private followFlow(far: boolean): boolean {
    const t = this.target!;
    const useFlow = (far && t === this.raid.hero) || this.raid.time.now < this.detourUntil;
    if (useFlow && this.raid.flow.direction(this.x, this.y, this.tmp)) {
      this.desired.set(this.tmp.x * this.stats.speed, this.tmp.y * this.stats.speed);
      return true;
    }
    return false;
  }

  private archer() {
    const t = this.target!;
    const s = ENEMIES.archer;
    const d = this.distTo(t);
    const los = hasLineOfSight(this.x, this.y, t.x, t.y);
    if (this.attackTimer <= 0 && los && d <= s.maxDist + 20) { this.beginWindup(); return; }
    if (this.followFlow(d > s.maxDist)) return;
    if (!los) {
      this.moveToward(t.x, t.y, this.stats.speed); // step round the hut for a clean shot
    } else if (d < s.minDist) {
      // back away, keeping the target in front
      this.moveToward(this.x - (t.x - this.x), this.y - (t.y - this.y), this.stats.speed);
    } else if (d > s.maxDist) {
      this.moveToward(t.x, t.y, this.stats.speed);
    } else {
      this.desired.set(0, 0);
    }
  }

  private captain() {
    const t = this.target!;
    const ed = this.edgeDistTo(t);
    if (ed <= this.stats.reach) {
      this.desired.set(0, 0);
      if (this.attackTimer <= 0) this.beginWindup();
      return;
    }
    if (this.followFlow(this.distTo(t) > 100)) return;
    this.moveToward(t.x, t.y, this.stats.speed);
  }

  /** Pushing against a hut for a while? Take the long way round for a moment. */
  private trackStuck(dt: number) {
    // measure real movement — the body's velocity still reads "walking" while it's pinned on a wall
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastPos.x, this.lastPos.y) / Math.max(dt, 1e-3);
    this.lastPos.set(this.x, this.y);
    if (this.desired.lengthSq() > 100 && moved < 8) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > 0.6) { this.stuckTimer = 0; this.detourUntil = this.raid.time.now + 1200; }
  }

  /** The telegraph: stop, flash bright red and swell up before the blow lands. */
  private beginWindup() {
    this.windingUp = true;
    this.windupTimer = this.stats.windup;
    this.baseTint = this.kind === 'captain' ? 0xff5a3c : this.kind === 'archer' ? 0xf0d0ff : 0xffb0a0;
    this.applyTint();
    if (this.kind === 'captain') {
      // a ring on the ground shows exactly how far the spear will reach
      this.telegraph = this.raid.juice.telegraphRing(this.x, this.y, this.stats.reach + this.radius + 14, 0xff3030, this.stats.windup * 1000);
    }
  }

  private finishAttack() {
    this.windingUp = false;
    this.baseTint = null;
    this.applyTint();
    this.setScale(1);
    this.telegraph = null;
    this.attackTimer = this.stats.cooldown;
    const t = this.target;
    if (!t || !t.alive || !this.alive) return;
    if (this.kind === 'archer') { this.raid.fireArrow(this, t); return; }
    const angle = Math.atan2(t.y - this.y, t.x - this.x);
    this.raid.juice.slash(this.x, this.y, angle, 1, this.kind === 'captain' ? 0xff6040 : 0xffb0b0, this.kind === 'captain' ? 0.9 : 0.5);
    // a little forgiveness on reach, but stepping back makes it whiff — and it must be LESS than a
    // militia's width (22px) so the second row of a crowd can't hit you through the first.
    if (this.edgeDistTo(t) <= this.stats.reach + 6) {
      const kb = this.kind === 'captain' ? ENEMIES.captain.knockback : 90;
      dealDamage(this.raid, t, this.damageAmount, this.x, this.y, kb, 'enemy');
    } else {
      this.raid.juice.damageNumber(this.x, this.y - this.radius - 10, 'miss', 0xbbbbbb, 11);
    }
  }

  protected override die() {
    if (this.telegraph) { this.telegraph.destroy(); this.telegraph = null; }
    this.setScale(1);
    super.die();
  }
}

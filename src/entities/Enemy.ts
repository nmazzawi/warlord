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

    if (this.retargetTimer <= 0 || !this.target || !this.target.alive) {
      this.retargetTimer = 0.3;
      this.target = this.pickTarget(hero, troops);
    }
    if (!this.target) { this.desired.set(0, 0); this.applyVelocity(dt); return; }

    if (this.windingUp) {
      this.windupTimer -= dt;
      this.desired.set(0, 0);
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

  /** Nearest player unit, with a preference for the hero. */
  private pickTarget(hero: Hero, troops: Troop[]): Unit | null {
    let best: Unit | null = null, bestScore = Infinity;
    const heroBias = this.kind === 'archer' ? 0.6 : 0.75;
    if (hero.alive) { best = hero; bestScore = this.distTo(hero) * heroBias; }
    for (const t of troops) {
      if (!t.alive) continue;
      const d = this.distTo(t);
      const score = this.edgeDistTo(t) < 18 ? d * 0.5 : d; // a troop pressed against me is in my way
      if (score < bestScore) { best = t; bestScore = score; }
    }
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
    const now = this.raid.time.now;
    const far = this.distTo(t) > 110;
    if ((far || now < this.detourUntil) && this.raid.flow.direction(this.x, this.y, this.tmp) && t === hero) {
      this.desired.set(this.tmp.x * this.stats.speed, this.tmp.y * this.stats.speed);
      return;
    }
    if (t === hero && this.slotAngle !== null) {
      const R = hero.radius + this.radius + SURROUND.slotPadding;
      this.moveToward(hero.x + Math.cos(this.slotAngle) * R, hero.y + Math.sin(this.slotAngle) * R, this.stats.speed, 12);
    } else {
      this.moveToward(t.x, t.y, this.stats.speed);
    }
  }

  private archer() {
    const t = this.target!;
    const s = ENEMIES.archer;
    const d = this.distTo(t);
    if (this.attackTimer <= 0 && d <= s.maxDist + 20) { this.beginWindup(); return; }
    if (d < s.minDist) {
      // back away, keeping the target in front
      this.moveToward(this.x - (t.x - this.x), this.y - (t.y - this.y), this.stats.speed);
    } else if (d > s.maxDist) {
      if (this.raid.flow.direction(this.x, this.y, this.tmp)) this.desired.set(this.tmp.x * this.stats.speed, this.tmp.y * this.stats.speed);
      else this.moveToward(t.x, t.y, this.stats.speed);
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
    if (this.distTo(t) > 100 && this.raid.flow.direction(this.x, this.y, this.tmp)) {
      this.desired.set(this.tmp.x * this.stats.speed, this.tmp.y * this.stats.speed);
    } else {
      this.moveToward(t.x, t.y, this.stats.speed);
    }
  }

  /** Pushing against a hut for a while? Take the long way round for a moment. */
  private trackStuck(dt: number) {
    if (this.desired.lengthSq() > 100 && this.body.speed < 8) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > 0.7) { this.stuckTimer = 0; this.detourUntil = this.raid.time.now + 1200; }
  }

  /** The telegraph: stop, turn red and swell up before the blow lands. */
  private beginWindup() {
    this.windingUp = true;
    this.windupTimer = this.stats.windup;
    this.baseTint = this.kind === 'captain' ? 0xff3030 : 0xff9090;
    this.applyTint();
    const grow = this.kind === 'captain' ? 1.35 : 1.2;
    this.raid.tweens.add({ targets: this, scaleX: grow, scaleY: grow, duration: this.stats.windup * 900, ease: 'Quad.In', yoyo: true });
  }

  private finishAttack() {
    this.windingUp = false;
    this.baseTint = null;
    this.applyTint();
    this.attackTimer = this.stats.cooldown;
    const t = this.target;
    if (!t || !t.alive || !this.alive) return;
    if (this.kind === 'archer') { this.raid.fireArrow(this, t); return; }
    const angle = Math.atan2(t.y - this.y, t.x - this.x);
    this.raid.juice.slash(this.x, this.y, angle, 1, this.kind === 'captain' ? 0xff6040 : 0xffb0b0, this.kind === 'captain' ? 0.9 : 0.5);
    // a little forgiveness on reach, but stepping well back makes it whiff
    if (this.edgeDistTo(t) <= this.stats.reach + 12) {
      const kb = this.kind === 'captain' ? ENEMIES.captain.knockback : 90;
      dealDamage(this.raid, t, this.damageAmount, this.x, this.y, kb, 'enemy');
    } else {
      this.raid.juice.damageNumber(this.x, this.y - this.radius - 10, 'miss', 0xbbbbbb, 11);
    }
  }

  protected override die() {
    this.raid.tweens.killTweensOf(this);
    super.die();
  }
}

// Troop.ts — a member of your warband. Follows in formation, picks fights with nearby enemies,
// breaks off if it strays too far, and sprints back when the War Horn sounds.
import Phaser from 'phaser';
import { Unit } from './Unit';
import type { Enemy } from './Enemy';
import type { Hero } from './Hero';
import type { RaidScene } from '../scenes/RaidScene';
import type { TroopRecord } from '../state/GameState';
import { ABILITIES, RIDER, TROOP } from '../config/balance';
import { unitDef } from '../world/Units';
import { TEX } from '../systems/Textures';
import { formationSlot } from '../systems/Formation';
import { dealDamage } from '../systems/Combat';
import { hasLineOfSight } from '../systems/LineOfSight';

export type TroopState = 'follow' | 'engage' | 'rally';

export class Troop extends Unit {
  readonly record: TroopRecord;
  slot: number;
  state: TroopState = 'follow';
  target: Enemy | null = null;
  private attackTimer = 0;
  private retargetTimer = 0;
  private rallyTimer = 0;
  private boostTimer = 0;
  private label: Phaser.GameObjects.Text;
  private tmp = new Phaser.Math.Vector2();
  private lastPos: Phaser.Math.Vector2;
  private stuckTimer = 0;

  private readonly damageAmount: number;
  private readonly kindTint: number;
  readonly ranged: boolean;
  private mount: Phaser.GameObjects.Image | null = null;

  constructor(scene: RaidScene, x: number, y: number, record: TroopRecord, slot: number) {
    const k = unitDef(record.kind ?? 'raider');
    const ranged = record.kind === 'rider';
    super(scene, x, y, ranged ? TEX.trooprider : TEX.troop, { hp: k.hp, speed: ranged ? RIDER.speed : TROOP.speed, radius: TROOP.radius, team: 'player', barColor: 0x5ec26a, scale: ranged ? RIDER.scale : 1 });
    this.ranged = ranged;
    if (ranged) this.mount = scene.add.image(x, y + 4, TEX.horse).setDepth(19).setScale(RIDER.scale).setTint(0xd9c4a0);
    this.damageAmount = k.damage;
    this.kindTint = ranged ? 0xffffff : k.tint;
    this.applyTint();
    this.record = record;
    this.slot = slot;
    this.lastPos = new Phaser.Math.Vector2(x, y);
    this.label = scene.add.text(x, y, record.name, {
      fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#d8ffd8', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(42).setAlpha(0.9);
  }

  /** War Horn: drop everything and run to the hero, then move faster for a bit. */
  rally() {
    this.rallyTimer = ABILITIES.horn.rallyTime;
    this.boostTimer = ABILITIES.horn.boostTime;
    this.target = null;
    this.baseTint = 0xfff2a8;
    this.applyTint();
    this.raid.time.delayedCall(ABILITIES.horn.rallyTime * 1000, () => { this.baseTint = null; this.applyTint(); });
  }

  update(dt: number, hero: Hero, heading: number) {
    this.attackTimer -= dt;
    this.retargetTimer -= dt;
    this.rallyTimer -= dt;
    this.boostTimer -= dt;
    const distHero = this.distTo(hero);
    // troops are a little slower than the hero, so they get a burst of pace when they fall behind
    const catchUp = this.state !== 'engage' && distHero > 80 ? 1.3 : 1;
    const spd = this.speed * (this.boostTimer > 0 ? ABILITIES.horn.boostMult : 1) * catchUp;
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastPos.x, this.lastPos.y) / Math.max(dt, 1e-3);
    this.lastPos.set(this.x, this.y);

    if (this.rallyTimer > 0) {
      this.state = 'rally';
      this.target = null;
      this.goToSlot(hero, heading, spd * 1.15, distHero);
    } else {
      const leash = this.ranged ? RIDER.leash : TROOP.leash; // riders range wider — horse archers hang back
      if (distHero > leash) { this.target = null; }
      else if (this.retargetTimer <= 0 || !this.target || !this.target.alive) {
        this.retargetTimer = 0.25;
        this.target = this.findTarget(hero);
      }
      // no enemy to fight but a gate to batter? get on it
      const gate = this.raid.gate;
      const gateDuty = !this.target && !!gate && gate.alive && distHero <= TROOP.leash && gate.distTo(this.x, this.y) < TROOP.engageRadius + 60;
      if (gateDuty && gate) {
        this.state = 'engage';
        const d = gate.distTo(this.x, this.y);
        if (d <= TROOP.reach + this.radius) {
          this.desired.set(0, 0);
          if (this.attackTimer <= 0) {
            this.attackTimer = TROOP.cooldown;
            this.raid.juice.slash(this.x, this.y, Math.atan2(gate.y - this.y, gate.x - this.x), 1, 0xb8ffb8, 0.55);
            this.raid.hitGate(this.damageAmount, this.x, this.y, 'troop');
          }
        } else {
          this.moveToward(Phaser.Math.Clamp(this.x, gate.rect.left - 2, gate.rect.right + 2), Phaser.Math.Clamp(this.y, gate.rect.top + 4, gate.rect.bottom - 4), spd);
        }
      } else if (this.target && distHero <= leash && this.ranged) {
        // a steppe rider keeps its distance and shoots
        this.state = 'engage';
        const d = this.distTo(this.target);
        if (d < RIDER.keepDistance - 30) {
          this.moveToward(this.x - (this.target.x - this.x), this.y - (this.target.y - this.y), spd);
        } else if (d > RIDER.range - 20) {
          this.moveToward(this.target.x, this.target.y, spd);
        } else {
          this.desired.set(0, 0);
        }
        if (this.attackTimer <= 0 && d <= RIDER.range && hasLineOfSight(this.x, this.y, this.target.x, this.target.y)) {
          this.attackTimer = RIDER.cooldown;
          this.raid.fireTroopArrow(this, this.target, this.damageAmount);
        }
      } else if (this.target && distHero <= leash) {
        this.state = 'engage';
        const ed = this.edgeDistTo(this.target);
        if (ed <= TROOP.reach) {
          this.desired.set(0, 0);
          if (this.attackTimer <= 0) this.strike(this.target);
        } else {
          this.moveToward(this.target.x, this.target.y, spd);
          // wedged against a hut while chasing? give up on that target for a moment and regroup
          if (moved < 8) this.stuckTimer += dt; else this.stuckTimer = 0;
          if (this.stuckTimer > 0.6) { this.stuckTimer = 0; this.target = null; this.retargetTimer = 0.8; }
        }
      } else {
        this.state = 'follow';
        this.goToSlot(hero, heading, spd, distHero);
      }
    }
    this.applyVelocity(dt);
  }

  /** Walk to my formation slot; if the hero is far or a hut is in the way, follow the flow field round it first. */
  private goToSlot(hero: Hero, heading: number, spd: number, distHero: number) {
    formationSlot(hero.x, hero.y, heading, this.slot, this.tmp);
    const blocked = !hasLineOfSight(this.x, this.y, this.tmp.x, this.tmp.y);
    if ((distHero > 120 || blocked) && this.raid.flow.direction(this.x, this.y, this.tmp)) {
      this.desired.set(this.tmp.x * spd, this.tmp.y * spd);
      return;
    }
    formationSlot(hero.x, hero.y, heading, this.slot, this.tmp);
    const d = this.moveToward(this.tmp.x, this.tmp.y, spd, 40);
    if (d < 6) this.desired.set(0, 0);
  }

  private findTarget(hero: Hero): Enemy | null {
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of this.raid.enemies) {
      if (!e.alive || e.onWall || e.dormant) continue;
      const d = this.distTo(e);
      if (d > (this.ranged ? RIDER.range : TROOP.engageRadius) || e.distTo(hero) > (this.ranged ? RIDER.leash : TROOP.leash)) continue;
      if (!hasLineOfSight(this.x, this.y, e.x, e.y)) continue;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  private strike(e: Enemy) {
    this.attackTimer = TROOP.cooldown;
    const angle = Math.atan2(e.y - this.y, e.x - this.x);
    this.raid.juice.slash(this.x, this.y, angle, 1, 0xb8ffb8, 0.55);
    dealDamage(this.raid, e, this.damageAmount, this.x, this.y, 120, 'troop');
  }

  /** Levies and town guards carry a colour of their own (a flash still overrides it). */
  override applyTint() {
    if (this.baseTint !== null) this.setTintFill(this.baseTint);
    else if (this.kindTint !== 0xffffff) this.setTint(this.kindTint);
    else this.clearTint();
  }

  override syncVisuals(now: number) {
    super.syncVisuals(now);
    this.label.setPosition(this.x, this.y - this.radius - 12).setVisible(this.alive);
    if (this.mount) this.mount.setVisible(this.alive).setPosition(this.x, this.y + 4).setFlipX(this.body.velocity.x < 0);
  }

  override destroyUnit() {
    this.label.destroy();
    this.mount?.destroy();
    super.destroyUnit();
  }
}

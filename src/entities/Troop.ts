// Troop.ts — a member of your warband. Follows in formation, picks fights with nearby enemies,
// breaks off if it strays too far, and sprints back when the War Horn sounds.
import Phaser from 'phaser';
import { Unit } from './Unit';
import type { Enemy } from './Enemy';
import type { Hero } from './Hero';
import type { RaidScene } from '../scenes/RaidScene';
import type { TroopRecord } from '../state/GameState';
import { ABILITIES, TROOP } from '../config/balance';
import { TEX } from '../systems/Textures';
import { formationSlot } from '../systems/Formation';
import { dealDamage } from '../systems/Combat';

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

  constructor(scene: RaidScene, x: number, y: number, record: TroopRecord, slot: number) {
    super(scene, x, y, TEX.troop, { hp: TROOP.hp, speed: TROOP.speed, radius: TROOP.radius, team: 'player', barColor: 0x5ec26a });
    this.record = record;
    this.slot = slot;
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
    const spd = this.speed * (this.boostTimer > 0 ? ABILITIES.horn.boostMult : 1);
    const distHero = this.distTo(hero);

    if (this.rallyTimer > 0) {
      this.state = 'rally';
      this.target = null;
      this.goToSlot(hero, heading, spd * 1.15, distHero);
    } else {
      if (distHero > TROOP.leash) { this.target = null; }
      else if (this.retargetTimer <= 0 || !this.target || !this.target.alive) {
        this.retargetTimer = 0.25;
        this.target = this.findTarget(hero);
      }
      if (this.target && distHero <= TROOP.leash) {
        this.state = 'engage';
        const ed = this.edgeDistTo(this.target);
        if (ed <= TROOP.reach) {
          this.desired.set(0, 0);
          if (this.attackTimer <= 0) this.strike(this.target);
        } else {
          this.moveToward(this.target.x, this.target.y, spd);
        }
      } else {
        this.state = 'follow';
        this.goToSlot(hero, heading, spd, distHero);
      }
    }
    this.applyVelocity(dt);
  }

  /** Walk to my formation slot; if the hero is far, follow the flow field around huts first. */
  private goToSlot(hero: Hero, heading: number, spd: number, distHero: number) {
    // beyond a cell or two, let the flow field steer around huts (straight lines walk into walls)
    if (distHero > 48 && this.raid.flow.direction(this.x, this.y, this.tmp)) {
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
      if (!e.alive) continue;
      const d = this.distTo(e);
      if (d > TROOP.engageRadius || e.distTo(hero) > TROOP.leash) continue;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  private strike(e: Enemy) {
    this.attackTimer = TROOP.cooldown;
    const angle = Math.atan2(e.y - this.y, e.x - this.x);
    this.raid.juice.slash(this.x, this.y, angle, 1, 0xb8ffb8, 0.55);
    dealDamage(this.raid, e, TROOP.damage, this.x, this.y, 120, 'troop');
  }

  override syncVisuals(now: number) {
    super.syncVisuals(now);
    this.label.setPosition(this.x, this.y - this.radius - 12).setVisible(this.alive);
  }

  override destroyUnit() {
    this.label.destroy();
    super.destroyUnit();
  }
}

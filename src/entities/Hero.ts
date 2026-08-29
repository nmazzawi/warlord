// Hero.ts — the warlord. Steered by the player; swings (or shoots, with the bow) automatically at the
// nearest enemy in reach; owns the two abilities (War Horn, Charge) and their cooldowns. Gear from
// the settlements shows up here: defense soaks hits, a horse makes you faster and bigger, the
// halberd is a tier-4 weapon. The ranged rule: the bow only fires when you are (nearly) stopped —
// a horse slows to a walk to shoot.
import Phaser from 'phaser';
import { Unit } from './Unit';
import type { Enemy } from './Enemy';
import type { RaidScene } from '../scenes/RaidScene';
import type { PlayerInput } from '../systems/PlayerInput';
import { ABILITIES, COMPOSITE_BOW, EQUIPMENT, HALBERD_TIER, HERO, RANGED, WEAPONS } from '../config/balance';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { hasLineOfSight } from '../systems/LineOfSight';
import { GameState, type WeaponKind } from '../state/GameState';

export class Hero extends Unit {
  facing = new Phaser.Math.Vector2(1, 0);
  tier = 1;
  weapon = WEAPONS[0];
  mode: WeaponKind = 'sword';
  attackTimer = 0;
  hornCd = 0;
  chargeCd = 0;
  boostTimer = 0;
  dashTimer = 0;
  readonly mounted: boolean;
  private swingSlow = 0;
  private dashDir = new Phaser.Math.Vector2();
  private dashHit = new Set<Unit>();
  private trailTimer = 0;
  private blade: Phaser.GameObjects.Image;
  private mount: Phaser.GameObjects.Image | null = null;
  private shieldMark: Phaser.GameObjects.Image | null = null;
  private tmp = new Phaser.Math.Vector2();

  constructor(scene: RaidScene, x: number, y: number) {
    const scale = GameState.heroScale;
    super(scene, x, y, TEX.hero, {
      hp: GameState.maxHp, speed: HERO.speed * GameState.speedMult, radius: HERO.radius, team: 'player',
      barColor: 0x5ec26a, barWidth: 30, depth: 21, scale,
    });
    this.mounted = GameState.horse !== 'none';
    if (this.mounted) this.mount = scene.add.image(x, y + 4, TEX.horse).setDepth(20).setScale(scale);
    if (GameState.shield !== 'none') this.shieldMark = scene.add.image(x, y, TEX.shield).setDepth(22).setScale(GameState.shield === 'kite' ? 1.3 : 1);
    this.blade = scene.add.image(x, y, TEX.blade).setOrigin(0, 0.5).setDepth(22);
    this.mode = GameState.weaponKind;
    this.setWeapon(this.mode === 'halberd' ? HALBERD_TIER : GameState.weaponTier);
  }

  setWeapon(tier: number) {
    this.tier = Phaser.Math.Clamp(tier, 1, WEAPONS.length);
    this.weapon = WEAPONS[this.tier - 1];
    if (this.mode === 'bow' || this.mode === 'composite') this.blade.setDisplaySize(14, 4).setTint(this.mode === 'composite' ? 0xd9a441 : 0xa0703c);
    else this.blade.setDisplaySize(this.weapon.bladeLen, 4).setTint(this.weapon.tint);
  }

  get boosted() { return this.boostTimer > 0; }
  get dashing() { return this.dashTimer > 0; }
  get usesBow() { return this.mode === 'bow' || this.mode === 'composite'; }
  /** Bow numbers for whichever bow is in hand. */
  get bow() { return this.mode === 'composite' ? COMPOSITE_BOW : EQUIPMENT.bow; }

  update(dt: number, input: PlayerInput) {
    const now = this.raid.time.now;
    this.attackTimer -= dt;
    this.hornCd -= dt;
    this.chargeCd -= dt;
    this.boostTimer -= dt;
    this.swingSlow -= dt;

    const move = input.getMove(this.tmp);
    const moveMag = move.length();
    if (moveMag > 0.001) this.facing.copy(move).normalize();

    if (input.consumeHorn()) this.tryHorn();
    if (input.consumeCharge()) this.tryCharge(move);

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.desired.set(this.dashDir.x * ABILITIES.charge.speed, this.dashDir.y * ABILITIES.charge.speed);
      this.dashHits();
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) { this.trailTimer = 0.03; this.raid.juice.afterImage(this.x, this.y, TEX.hero, 0x9fd8ff); }
    } else {
      let spd = this.speed * (this.boosted ? ABILITIES.horn.boostMult : 1);
      if (this.swingSlow > 0) spd *= HERO.swingSlowMult; // a swing plants your feet for a moment
      if (this.usesBow) {
        const target = this.findBowTarget();
        const gate = !target ? this.gateInBowRange() : null;
        if (target || gate) {
          // THE RANGED RULE: shoot only when (nearly) stopped. A horse drops to a walk while there is
          // something to shoot at — not just on the frame the arrow flies. The composite bow bends the
          // rule: it shoots from a slow ride (or a brisk walk on foot).
          const frac = this.mode === 'composite' ? COMPOSITE_BOW.moveFraction : RANGED.walkFraction;
          if (this.mounted) spd *= frac;
          if (this.attackTimer <= 0 && (this.mounted || moveMag <= frac)) {
            if (target) this.shoot(target); else if (gate) this.shootGate(gate.x, gate.y);
          }
        }
      } else if (this.attackTimer <= 0) {
        this.tryStrike();
      }
      this.desired.set(move.x * spd, move.y * spd);
    }

    // slow recovery when you've pulled back and stopped taking hits
    if (this.hp < this.maxHp && now - this.lastHurtAt > HERO.regenDelay * 1000) {
      this.hp = Math.min(this.maxHp, this.hp + HERO.regenPerSec * dt);
    }
    this.applyVelocity(dt);
  }

  /** Melee can't reach archers on a wall top or sleepers behind it. */
  private meleeTargetable(e: Enemy) { return e.alive && !e.onWall && !e.dormant; }

  /** Auto-attack: hit every enemy inside the weapon's arc, aimed at the nearest one; or batter the gate. */
  private tryStrike() {
    const enemies = this.raid.enemies;
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of enemies) {
      if (!this.meleeTargetable(e)) continue;
      const d = this.edgeDistTo(e);
      if (d <= this.weapon.reach && d < bestD && hasLineOfSight(this.x, this.y, e.x, e.y)) { best = e; bestD = d; }
    }
    const gate = this.raid.gate;
    const gateNear = !!gate && gate.alive && gate.distTo(this.x, this.y) - this.radius <= this.weapon.reach;
    if (!best && !gateNear) return;
    this.attackTimer = HERO.attackCooldown;
    this.swingSlow = HERO.swingSlow;
    const ax = best ? best.x : gate!.x, ay = best ? best.y : Phaser.Math.Clamp(this.y, gate!.rect.top, gate!.rect.bottom);
    const angle = Math.atan2(ay - this.y, ax - this.x);
    this.facing.set(Math.cos(angle), Math.sin(angle));
    const half = Phaser.Math.DegToRad(this.weapon.arcDeg / 2) + 0.12;
    let hits = 0;
    for (const e of enemies) {
      if (!this.meleeTargetable(e) || this.edgeDistTo(e) > this.weapon.reach || !hasLineOfSight(this.x, this.y, e.x, e.y)) continue;
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(Phaser.Math.Angle.Wrap(a - angle)) <= half) {
        this.raid.heroHit(e, this.weapon.damage, this.weapon.knockback);
        hits++;
      }
    }
    if (gateNear) { this.raid.hitGate(this.weapon.damage, this.x, this.y, 'hero'); hits++; }
    this.raid.juice.slash(this.x, this.y, angle, this.tier, this.weapon.tint);
    if (hits > 0) {
      this.raid.juice.hitStop(this.weapon.hitStop);
      this.raid.juice.shake(this.weapon.shake, 70 + this.tier * 15, true);
      Sound.heroHit(Math.min(3, this.tier));
    }
  }

  /** Nearest enemy the bow can reach with a clear line (wall archers are shot over the wall). */
  private findBowTarget(): Enemy | null {
    const bow = this.bow;
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of this.raid.enemies) {
      if (!e.alive || e.dormant) continue;
      const d = this.distTo(e);
      if (d > bow.range || d >= bestD) continue;
      // a wall top is reachable over the wall, but not through a rock or hut in the way
      if (!hasLineOfSight(this.x, this.y, e.x, e.y, e.onWall)) continue;
      best = e; bestD = d;
    }
    return best;
  }

  /** With nothing else to shoot, a bow can still work on the gate. */
  private gateInBowRange(): { x: number; y: number } | null {
    const gate = this.raid.gate;
    if (!gate || !gate.alive) return null;
    const gx = Phaser.Math.Clamp(this.x, gate.rect.left, gate.rect.right), gy = Phaser.Math.Clamp(this.y, gate.rect.top, gate.rect.bottom);
    if (Phaser.Math.Distance.Between(this.x, this.y, gx, gy) > this.bow.range) return null;
    return hasLineOfSight(this.x, this.y, gx, gy, true) ? { x: gx, y: gy } : null;
  }

  private shootGate(gx: number, gy: number) {
    const bow = this.bow;
    this.attackTimer = bow.cooldown;
    this.swingSlow = 0.1;
    this.tmp.set(gx - this.x, gy - this.y).normalize();
    this.facing.copy(this.tmp);
    this.raid.fireHeroArrow(this.x + this.tmp.x * (this.radius + 6), this.y + this.tmp.y * (this.radius + 6), this.tmp, bow.damage, false);
    Sound.bow();
  }

  private shoot(target: Enemy) {
    const bow = this.bow;
    this.attackTimer = bow.cooldown;
    this.swingSlow = 0.1;
    const d = this.distTo(target);
    const t = d / bow.arrowSpeed;
    const px = target.x + target.body.velocity.x * t * 0.6, py = target.y + target.body.velocity.y * t * 0.6;
    this.tmp.set(px - this.x, py - this.y).normalize();
    this.facing.copy(this.tmp);
    this.raid.fireHeroArrow(this.x + this.tmp.x * (this.radius + 6), this.y + this.tmp.y * (this.radius + 6), this.tmp, bow.damage, target.onWall);
    Sound.bow();
  }

  private tryHorn() {
    if (this.hornCd > 0) return;
    this.hornCd = ABILITIES.horn.cooldown;
    this.boostTimer = ABILITIES.horn.boostTime;
    this.raid.warHorn();
  }

  private tryCharge(move: Phaser.Math.Vector2) {
    if (this.chargeCd > 0 || this.dashing) return;
    this.chargeCd = ABILITIES.charge.cooldown;
    this.dashTimer = ABILITIES.charge.duration;
    this.dashDir.copy(move.lengthSq() > 0.001 ? move : this.facing).normalize();
    this.dashHit.clear();
    this.knock.set(0, 0);
    this.trailTimer = 0;
    Sound.charge();
  }

  private dashHits() {
    for (const e of this.raid.enemies) {
      if (!this.meleeTargetable(e) || this.dashHit.has(e)) continue;
      if (this.edgeDistTo(e) <= 8) {
        this.dashHit.add(e);
        this.raid.chargeHit(e);
      }
    }
  }

  override syncVisuals(now: number) {
    super.syncVisuals(now);
    this.blade.setVisible(this.alive)
      .setPosition(this.x + this.facing.x * (this.radius - 3), this.y + this.facing.y * (this.radius - 3))
      .setRotation(Math.atan2(this.facing.y, this.facing.x));
    if (this.mount) this.mount.setVisible(this.alive).setPosition(this.x, this.y + 4 * this.scaleY).setFlipX(this.facing.x < 0);
    if (this.shieldMark) this.shieldMark.setVisible(this.alive).setPosition(this.x - this.facing.y * (this.radius - 1), this.y + this.facing.x * (this.radius - 1));
  }

  override destroyUnit() {
    this.blade.destroy();
    this.mount?.destroy();
    this.shieldMark?.destroy();
    super.destroyUnit();
  }
}

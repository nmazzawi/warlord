// Hero.ts — the warlord. Steered by the player; swings (or shoots, with the bow) automatically at the
// nearest enemy in reach; owns the two abilities (War Horn, Charge) and their cooldowns. Gear from
// the camp shows up here: defense soaks hits, a horse makes you faster and bigger.
import Phaser from 'phaser';
import { Unit } from './Unit';
import type { Enemy } from './Enemy';
import type { RaidScene } from '../scenes/RaidScene';
import type { PlayerInput } from '../systems/PlayerInput';
import { ABILITIES, EQUIPMENT, HERO, WEAPONS } from '../config/balance';
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
    if (GameState.horse !== 'none') this.mount = scene.add.image(x, y + 4, TEX.horse).setDepth(20).setScale(scale);
    if (GameState.owned.shield) this.shieldMark = scene.add.image(x, y, TEX.shield).setDepth(22);
    this.blade = scene.add.image(x, y, TEX.blade).setOrigin(0, 0.5).setDepth(22);
    this.mode = GameState.weaponKind;
    this.setWeapon(GameState.weaponTier);
  }

  setWeapon(tier: number) {
    this.tier = Phaser.Math.Clamp(tier, 1, WEAPONS.length);
    this.weapon = WEAPONS[this.tier - 1];
    if (this.mode === 'bow') this.blade.setDisplaySize(14, 4).setTint(0xa0703c);
    else this.blade.setDisplaySize(this.weapon.bladeLen, 4).setTint(this.weapon.tint);
  }

  get boosted() { return this.boostTimer > 0; }
  get dashing() { return this.dashTimer > 0; }

  update(dt: number, input: PlayerInput) {
    const now = this.raid.time.now;
    this.attackTimer -= dt;
    this.hornCd -= dt;
    this.chargeCd -= dt;
    this.boostTimer -= dt;
    this.swingSlow -= dt;

    const move = input.getMove(this.tmp);
    if (move.lengthSq() > 0.001) this.facing.copy(move).normalize();

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
      this.desired.set(move.x * spd, move.y * spd);
      if (this.attackTimer <= 0) { if (this.mode === 'bow') this.tryShoot(); else this.tryStrike(); }
    }

    // slow recovery when you've pulled back and stopped taking hits
    if (this.hp < this.maxHp && now - this.lastHurtAt > HERO.regenDelay * 1000) {
      this.hp = Math.min(this.maxHp, this.hp + HERO.regenPerSec * dt);
    }
    this.applyVelocity(dt);
  }

  /** Auto-attack: hit every enemy inside the weapon's arc, aimed at the nearest one. */
  private tryStrike() {
    const enemies = this.raid.enemies;
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = this.edgeDistTo(e);
      if (d <= this.weapon.reach && d < bestD && hasLineOfSight(this.x, this.y, e.x, e.y)) { best = e; bestD = d; }
    }
    if (!best) return;
    this.attackTimer = HERO.attackCooldown;
    this.swingSlow = HERO.swingSlow;
    const angle = Math.atan2(best.y - this.y, best.x - this.x);
    this.facing.set(Math.cos(angle), Math.sin(angle));
    const half = Phaser.Math.DegToRad(this.weapon.arcDeg / 2) + 0.12;
    let hits = 0;
    for (const e of enemies) {
      if (!e.alive || this.edgeDistTo(e) > this.weapon.reach || !hasLineOfSight(this.x, this.y, e.x, e.y)) continue;
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(Phaser.Math.Angle.Wrap(a - angle)) <= half) {
        this.raid.heroHit(e, this.weapon.damage, this.weapon.knockback);
        hits++;
      }
    }
    this.raid.juice.slash(this.x, this.y, angle, this.tier, this.weapon.tint);
    if (hits > 0) {
      this.raid.juice.hitStop(this.weapon.hitStop);
      this.raid.juice.shake(this.weapon.shake, 70 + this.tier * 15, true);
      Sound.heroHit(this.tier);
    }
  }

  /** Bow: loose an arrow at the nearest enemy in range with a clear line. Lighter, but from a distance. */
  private tryShoot() {
    const bow = EQUIPMENT.bow;
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of this.raid.enemies) {
      if (!e.alive) continue;
      const d = this.distTo(e);
      if (d <= bow.range && d < bestD && hasLineOfSight(this.x, this.y, e.x, e.y)) { best = e; bestD = d; }
    }
    if (!best) return;
    this.attackTimer = bow.cooldown;
    this.swingSlow = 0.1;
    // lead the shot a little
    const t = bestD / bow.arrowSpeed;
    const px = best.x + best.body.velocity.x * t * 0.6, py = best.y + best.body.velocity.y * t * 0.6;
    this.tmp.set(px - this.x, py - this.y).normalize();
    this.facing.copy(this.tmp);
    this.raid.fireHeroArrow(this.x + this.tmp.x * (this.radius + 6), this.y + this.tmp.y * (this.radius + 6), this.tmp, bow.damage);
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
      if (!e.alive || this.dashHit.has(e)) continue;
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

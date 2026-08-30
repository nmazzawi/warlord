// Unit.ts — the shared body for hero, troops and defenders: HP + a small bar above the head,
// a hit flash, knockback that fades out, and movement helpers.
import Phaser from 'phaser';
import type { RaidScene } from '../scenes/RaidScene';
import { TEX } from '../systems/Textures';

export type Team = 'player' | 'enemy';

export interface UnitOpts {
  hp: number; speed: number; radius: number; team: Team; barColor: number; barWidth?: number; depth?: number;
  /** Visual + collision scale (a mounted hero is bigger). Radius is given unscaled. */
  scale?: number;
}

export class Unit extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly raid: RaidScene;
  readonly team: Team;
  readonly radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  alive = true;
  /** Where the unit wants to go this frame (pixels/sec). AI or input writes this. */
  desired = new Phaser.Math.Vector2();
  /** Extra shove from being hit; decays every frame. */
  knock = new Phaser.Math.Vector2();
  lastHurtAt = -1e9;
  /** Tint shown when not flashing (e.g. red during a wind-up). null = natural color. */
  baseTint: number | null = null;
  /** A colour MULTIPLIED into the sprite rather than replacing it — used for an empire's own men, so
   *  the drawing (helmet, shield, plume) still shows through the colour of their country. */
  liveryTint: number | null = null;
  private flashUntil = 0;
  private barBg: Phaser.GameObjects.Image;
  private barFg: Phaser.GameObjects.Image;
  private barW: number;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: RaidScene, x: number, y: number, texture: string, opts: UnitOpts) {
    super(scene, x, y, texture);
    this.raid = scene;
    this.team = opts.team;
    const scale = opts.scale ?? 1;
    this.radius = opts.radius * scale;
    this.hp = opts.hp;
    this.maxHp = opts.hp;
    this.speed = opts.speed;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(opts.radius, this.width / 2 - opts.radius, this.height / 2 - opts.radius);
    if (scale !== 1) this.setScale(scale);
    this.setCollideWorldBounds(true);
    this.setDepth(opts.depth ?? 20);
    this.barW = opts.barWidth ?? 24;
    this.shadow = scene.add.image(x, y, TEX.shadow).setDepth(15).setAlpha(0.45).setDisplaySize(this.radius * 2.6, this.radius * 1.2);
    this.barBg = scene.add.image(x, y, TEX.px).setTint(0x000000).setAlpha(0.7).setDepth(40).setDisplaySize(this.barW + 2, 5);
    this.barFg = scene.add.image(x, y, TEX.px).setTint(opts.barColor).setOrigin(0, 0.5).setDepth(41).setDisplaySize(this.barW, 3);
    this.syncBars();
  }

  distTo(o: { x: number; y: number }) { return Phaser.Math.Distance.Between(this.x, this.y, o.x, o.y); }
  /** Gap between the two units' edges (negative = overlapping). */
  edgeDistTo(o: Unit) { return this.distTo(o) - this.radius - o.radius; }

  /** Take damage, get shoved away from (srcX, srcY). Returns true if this killed the unit. */
  damage(amount: number, srcX: number, srcY: number, knockback: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.lastHurtAt = this.raid.time.now;
    if (knockback > 0) {
      const dx = this.x - srcX, dy = this.y - srcY;
      const len = Math.hypot(dx, dy) || 1;
      this.knock.x += (dx / len) * knockback;
      this.knock.y += (dy / len) * knockback;
    }
    this.flash(90);
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
    return false;
  }

  /** What a blow of this size actually does to me. Armour, shields and tricks live here so that the
   *  number the player SEES is the number that landed — a mitigation nobody can see teaches nothing. */
  mitigate(amount: number) { return amount; }

  flash(ms: number) {
    this.flashUntil = this.raid.time.now + ms;
    this.setTintFill(0xffffff);
  }

  applyTint() {
    // tintFill replaces the colour outright — a plain tint multiplies and is invisible on dark sprites
    if (this.baseTint !== null) { this.setTintFill(this.baseTint); return; }
    if (this.liveryTint !== null) { this.setTint(this.liveryTint); return; }
    this.clearTint();
  }

  protected die() {
    this.alive = false;
    this.body.enable = false;
    this.setVisible(false);
    this.barBg.setVisible(false);
    this.barFg.setVisible(false);
    this.shadow.setVisible(false);
    this.desired.set(0, 0);
    this.knock.set(0, 0);
    this.raid.onUnitDied(this);
  }

  /** Steer toward a point. Slows down inside slowRadius so arrivals don't overshoot. Returns distance. */
  moveToward(tx: number, ty: number, speed: number, slowRadius = 0) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) { this.desired.set(0, 0); return d; }
    let s = speed;
    if (slowRadius > 0 && d < slowRadius) s = speed * Math.max(0.15, d / slowRadius);
    this.desired.set((dx / d) * s, (dy / d) * s);
    return d;
  }

  /** Push desired movement + knockback into the physics body. */
  applyVelocity(dt: number) {
    this.body.setVelocity(this.desired.x + this.knock.x, this.desired.y + this.knock.y);
    this.knock.scale(Math.exp(-dt * 6));
    if (this.knock.lengthSq() < 4) this.knock.set(0, 0);
  }

  /** Keep bars and flash in sync. Runs every frame, even during hit-pause. */
  syncVisuals(now: number) {
    if (this.flashUntil && now >= this.flashUntil) { this.flashUntil = 0; this.applyTint(); }
    this.syncBars();
  }

  protected syncBars() {
    this.shadow.setPosition(this.x, this.y + this.radius * 0.85);
    const y = this.y - this.radius - 9;
    this.barBg.setPosition(this.x, y);
    this.barFg.setPosition(this.x - this.barW / 2, y);
    this.barFg.displayWidth = Math.max(0, (this.barW * this.hp) / this.maxHp);
  }

  destroyUnit() {
    this.barBg.destroy();
    this.barFg.destroy();
    this.shadow.destroy();
    this.destroy();
  }
}

// Juice.ts — everything that makes rectangles feel like they hit: hit-pause (freeze frames),
// screen shake, floating damage numbers, spark bursts, slash arcs, and the War Horn ring.
import Phaser from 'phaser';
import type { RaidScene } from '../scenes/RaidScene';
import { TEX } from './Textures';

const FONT = '"Arial Black", Arial, Helvetica, sans-serif';
const BASE_SIZE = 16;

export class Juice {
  /** One pool per colour so pooled texts never change font/colour (that re-rasterises them). */
  private pools = new Map<number, Phaser.GameObjects.Text[]>();
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: RaidScene) {
    this.emitter = scene.add.particles(0, 0, TEX.dot, {
      speed: { min: 60, max: 240 },
      lifespan: { min: 120, max: 320 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 1,
      emitting: false,
    }).setDepth(45);
  }

  /** Freeze the world for a few milliseconds so a hit has weight. */
  hitStop(ms: number) { this.scene.freeze(ms); }

  /**
   * Shake by an amount in on-screen pixels, the same on every device. (Phaser's own intensity
   * value scales with viewport width and zoom², which is invisible on phones and nauseating on desktop.)
   * force=true lets the hero's own hits interrupt a running "you got hurt" shake.
   */
  shake(px: number, duration = 80, force = false) {
    const cam = this.scene.cameras.main;
    const dpr = this.scene.scale.displayScale.x || 1;
    const intensity = (px * dpr) / (cam.width * cam.zoom * cam.zoom);
    cam.shake(duration, intensity, force);
  }

  burst(x: number, y: number, tint: number, count: number) {
    this.emitter.setParticleTint(tint);
    this.emitter.explode(count, x, y);
  }

  /** Floating number that pops up and fades. Pooled so it's cheap on phones. */
  damageNumber(x: number, y: number, text: string, color: number, size = 16) {
    let pool = this.pools.get(color);
    if (!pool) { pool = []; this.pools.set(color, pool); }
    let t = pool.find(p => !p.active);
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: `${BASE_SIZE}px`, color: '#' + color.toString(16).padStart(6, '0'),
        stroke: '#000000', strokeThickness: 4, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(50);
      pool.push(t);
    }
    if (t.text !== text) t.setText(text);
    const s = size / BASE_SIZE;
    t.setActive(true).setVisible(true).setPosition(x + Phaser.Math.Between(-6, 6), y).setAlpha(1).setScale(s * 1.3);
    this.scene.tweens.killTweensOf(t);
    this.scene.tweens.add({ targets: t, y: y - 34, scale: s, alpha: 0, duration: 650, ease: 'Cubic.Out',
      onComplete: () => { t!.setActive(false).setVisible(false); } });
  }

  /** The sword swing: a wedge that flashes and fades in the strike direction. Its size IS the hit range. */
  slash(x: number, y: number, angle: number, tier: number, tint: number, scale = 1) {
    const img = this.scene.add.image(x, y, TEX.slash(tier)).setRotation(angle).setTint(tint)
      .setDepth(30).setScale(scale * 0.85).setAlpha(0.95).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: img, scale: scale * 1.0, alpha: 0, duration: 150, ease: 'Quad.Out',
      onComplete: () => img.destroy() });
  }

  /** Expanding ring — used by War Horn so the rally is unmistakable. */
  ringPulse(x: number, y: number, tint: number, toScale = 7, duration = 550) {
    const ring = this.scene.add.image(x, y, TEX.ring).setTint(tint).setDepth(44).setScale(0.3).setAlpha(1);
    this.scene.tweens.add({ targets: ring, scale: toScale, alpha: 0, duration, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  /** A ring on the ground that fills in over `ms` — the captain's "get out of the way" telegraph. */
  telegraphRing(x: number, y: number, radiusPx: number, tint: number, ms: number) {
    const ring = this.scene.add.image(x, y, TEX.ring).setTint(tint).setDepth(15).setScale(0.2).setAlpha(0.9);
    this.scene.tweens.add({ targets: ring, scale: radiusPx / 38, duration: ms, ease: 'Quad.In', onComplete: () => ring.destroy() });
    return ring;
  }

  /** Ghost images left behind by Charge. */
  afterImage(x: number, y: number, texture: string, tint: number) {
    const ghost = this.scene.add.image(x, y, texture).setTint(tint).setAlpha(0.5).setDepth(19);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  /** Short banner in world space (e.g. "Bran has fallen"). */
  banner(x: number, y: number, text: string, color: string, size = 14) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1600, ease: 'Quad.Out', onComplete: () => t.destroy() });
  }
}

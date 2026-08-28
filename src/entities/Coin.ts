// Coin.ts — loot. Pops out of a fallen defender, then gets pulled to the hero when they come near.
import Phaser from 'phaser';
import type { Hero } from './Hero';

export class Coin extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  value = 0;
  private age = 0;

  spawn(x: number, y: number, value: number) {
    this.enableBody(true, x, y, true, true);
    if (!this.body.isCircle) this.setCircle(6);
    this.setDepth(6);
    this.value = value;
    this.age = 0;
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const s = Phaser.Math.Between(70, 150);
    this.setVelocity(Math.cos(a) * s, Math.sin(a) * s);
    this.setDrag(220);
    this.setScale(1);
  }

  tick(dt: number, hero: Hero) {
    if (!this.active) return;
    this.age += dt;
    this.setScale(1 + 0.12 * Math.sin(this.age * 9));
    if (this.age < 0.3 || !hero.alive) return;
    const dx = hero.x - this.x, dy = hero.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 95) {
      const s = 240 + (95 - d) * 5;
      this.setVelocity((dx / d) * s, (dy / d) * s);
    }
  }
}

// Arrow.ts — an archer's shot. Flies straight, hurts the first player unit it touches,
// breaks on huts (so ducking behind a hut is real cover).
import Phaser from 'phaser';

export class Arrow extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  damageAmount = 0;
  life = 0;

  fire(x: number, y: number, vx: number, vy: number, damage: number, life: number) {
    this.enableBody(true, x, y, true, true);
    if (!this.body.isCircle) this.setCircle(4, 4, -2);
    this.setDepth(25);
    this.setVelocity(vx, vy);
    this.setRotation(Math.atan2(vy, vx));
    this.damageAmount = damage;
    this.life = life;
  }

  tick(dt: number) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) this.kill();
  }

  kill() { this.disableBody(true, true); }
}

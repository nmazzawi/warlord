// Arrow.ts — a shot from an archer (hits your side) or from the hero's bow (hits theirs).
// Flies straight, hurts the first enemy it touches, breaks on huts (so ducking behind one is real cover).
import Phaser from 'phaser';
import type { Team } from './Unit';

export class Arrow extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  damageAmount = 0;
  life = 0;
  team: Team = 'enemy';

  fire(x: number, y: number, vx: number, vy: number, damage: number, life: number, team: Team) {
    this.enableBody(true, x, y, true, true);
    if (!this.body.isCircle) this.setCircle(4, 4, -2);
    this.setDepth(25);
    this.setVelocity(vx, vy);
    this.setRotation(Math.atan2(vy, vx));
    this.damageAmount = damage;
    this.life = life;
    this.team = team;
    this.setTint(team === 'player' ? 0xbfe8ff : 0xffffff);
  }

  tick(dt: number) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) this.kill();
  }

  kill() { this.disableBody(true, true); }
}

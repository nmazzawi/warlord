// Gate.ts — the town gate: a solid obstacle with hit points. Swords, troops and arrows chip at it;
// when it breaks the wall opens and the defenders inside pour out.
import Phaser from 'phaser';
import type { RaidScene } from '../scenes/RaidScene';
import type { Obstacle } from '../world/Layouts';
import { TEX } from '../systems/Textures';

export class Gate {
  hp: number;
  readonly maxHp: number;
  alive = true;
  readonly rect: Phaser.Geom.Rectangle;
  private barBg: Phaser.GameObjects.Image;
  private barFg: Phaser.GameObjects.Image;
  private flashUntil = 0;

  constructor(private scene: RaidScene, readonly sprite: Phaser.Physics.Arcade.Sprite, readonly obstacle: Obstacle, hp: number) {
    this.hp = hp; this.maxHp = hp;
    this.rect = new Phaser.Geom.Rectangle(obstacle.x - obstacle.w / 2, obstacle.y - obstacle.h / 2, obstacle.w, obstacle.h);
    const w = 60;
    this.barBg = scene.add.image(obstacle.x, obstacle.y - obstacle.h / 2 - 12, TEX.px).setTint(0x000000).setAlpha(0.7).setDepth(40).setDisplaySize(w + 2, 7);
    this.barFg = scene.add.image(obstacle.x - w / 2, obstacle.y - obstacle.h / 2 - 12, TEX.px).setTint(0xd9a441).setOrigin(0, 0.5).setDepth(41).setDisplaySize(w, 5);
  }

  /** Distance from a point to the gate's edge (0 when touching). */
  distTo(x: number, y: number) {
    const dx = Math.max(this.rect.left - x, 0, x - this.rect.right);
    const dy = Math.max(this.rect.top - y, 0, y - this.rect.bottom);
    return Math.hypot(dx, dy);
  }
  get x() { return this.obstacle.x; }
  get y() { return this.obstacle.y; }

  /** Returns true when this blow breaks the gate. */
  damage(amount: number) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashUntil = this.scene.time.now + 80;
    this.sprite.setTintFill(0xffffff);
    this.barFg.displayWidth = Math.max(0, 60 * this.hp / this.maxHp);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  syncVisuals(now: number) {
    if (this.flashUntil && now >= this.flashUntil) { this.flashUntil = 0; if (this.sprite.active) this.sprite.clearTint(); }
  }

  destroy() {
    this.barBg.destroy();
    this.barFg.destroy();
  }
}

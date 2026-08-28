// Joystick.ts — the floating thumb-stick: appears where the finger lands, drives PlayerInput.joyX/Y.
import Phaser from 'phaser';
import type { PlayerInput } from './PlayerInput';

export class Joystick {
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private id = -1;
  private origin = new Phaser.Math.Vector2();
  private max = 48;

  /** `blocked(p)` lets the owner reserve areas (buttons) that must not start a joystick. */
  constructor(scene: Phaser.Scene, private target: PlayerInput, private blocked: (p: Phaser.Input.Pointer) => boolean = () => false) {
    this.base = scene.add.circle(0, 0, 50, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false).setDepth(100);
    this.knob = scene.add.circle(0, 0, 22, 0xffffff, 0.35).setVisible(false).setDepth(101);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('gameout', this.release, this);
    scene.events.once('shutdown', () => this.release());
    this.release();
  }

  layout(u: number) {
    this.max = 48 * u;
    this.base.setRadius(52 * u);
    this.knob.setRadius(22 * u);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.id !== -1 || this.blocked(p)) return;
    this.id = p.id;
    this.origin.set(p.x, p.y);
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
    this.target.joyX = 0; this.target.joyY = 0;
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.id) return;
    let dx = p.x - this.origin.x, dy = p.y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.max) { dx = (dx / d) * this.max; dy = (dy / d) * this.max; }
    // small dead zone so a resting thumb doesn't drift
    const mag = Math.min(1, d / this.max);
    const scaled = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    const len = Math.hypot(dx, dy) || 1;
    this.target.joyX = (dx / len) * scaled;
    this.target.joyY = (dy / len) * scaled;
    this.knob.setPosition(this.origin.x + dx, this.origin.y + dy);
  }

  private onUp(p: Phaser.Input.Pointer) { if (p.id === this.id) this.release(); }

  release() {
    this.id = -1;
    this.target.joyX = 0; this.target.joyY = 0;
    if (this.base.active) this.base.setVisible(false);
    if (this.knob.active) this.knob.setVisible(false);
  }
}

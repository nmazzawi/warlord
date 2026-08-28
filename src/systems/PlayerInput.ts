// PlayerInput.ts — one place that merges the virtual joystick (touch) and WASD/arrows (keyboard)
// into a single movement vector, plus "the player pressed Horn / Charge / Interact" flags.
import Phaser from 'phaser';

type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;
export type InputMode = 'raid' | 'camp';

export class PlayerInput {
  /** Joystick vector written by the HUD (each axis -1..1). */
  joyX = 0;
  joyY = 0;
  private hornQueued = false;
  private chargeQueued = false;
  private interactQueued = false;
  private keys: KeyMap | null = null;

  attachKeyboard(scene: Phaser.Scene, mode: InputMode = 'raid') {
    const kb = scene.input.keyboard;
    if (!kb) return;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as KeyMap;
    if (mode === 'raid') {
      kb.on('keydown-Q', () => { this.hornQueued = true; });
      kb.on('keydown-E', () => { this.chargeQueued = true; });
      kb.on('keydown-SPACE', () => { this.chargeQueued = true; });
    } else {
      kb.on('keydown-E', () => { this.interactQueued = true; });
      kb.on('keydown-SPACE', () => { this.interactQueued = true; });
      kb.on('keydown-ENTER', () => { this.interactQueued = true; });
    }
  }

  pressHorn() { this.hornQueued = true; }
  pressCharge() { this.chargeQueued = true; }
  pressInteract() { this.interactQueued = true; }
  consumeHorn() { const v = this.hornQueued; this.hornQueued = false; return v; }
  consumeCharge() { const v = this.chargeQueued; this.chargeQueued = false; return v; }
  consumeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; }

  /** Movement direction, length 0..1. Keyboard wins if any key is held. */
  getMove(out: Phaser.Math.Vector2) {
    let x = this.joyX, y = this.joyY;
    if (this.keys) {
      const k = this.keys;
      let kx = 0, ky = 0;
      if (k.A.isDown || k.LEFT.isDown) kx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) kx += 1;
      if (k.W.isDown || k.UP.isDown) ky -= 1;
      if (k.S.isDown || k.DOWN.isDown) ky += 1;
      if (kx !== 0 || ky !== 0) { x = kx; y = ky; }
    }
    out.set(x, y);
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }
}

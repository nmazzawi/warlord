// ui.ts — tiny shared UI helpers: a chunky tappable button and the common font.
import Phaser from 'phaser';
import { Sound } from '../systems/Sound';

export const FONT = '"Arial Black", Arial, Helvetica, sans-serif';

/** Notch / home-indicator insets, in game pixels (index.html exposes env(safe-area-inset-*) as CSS vars). */
export function safeInsets(scene: Phaser.Scene) {
  const dpr = scene.scale.displayScale.x || 1;
  const style = getComputedStyle(document.documentElement);
  const px = (v: string) => (parseFloat(style.getPropertyValue(v)) || 0) * dpr;
  return { top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal') };
}

/**
 * UI scale unit. Sized in CSS pixels (so text is the same physical size on a 1x and a 2x screen),
 * then multiplied by the device pixel ratio. Fits both axes so nothing overflows on landscape phones.
 */
export function uiUnit(w: number, h: number, dpr = 1) {
  const cw = w / dpr, ch = h / dpr;
  return Phaser.Math.Clamp(Math.min(cw / 420, ch / 560), 0.75, 1.6) * (Math.min(cw, ch) > 1000 ? 1.15 : 1) * dpr;
}
export function dprOf(scene: Phaser.Scene) { return scene.scale.displayScale.x || 1; }

export interface ButtonOpts {
  width: number; height: number; label: string; sub?: string; color?: number; fontSize?: number;
  enabled?: boolean; onPress: () => void;
}

/** A rounded rectangle with a label. Scales down on press so taps feel acknowledged. */
export function makeButton(scene: Phaser.Scene, x: number, y: number, o: ButtonOpts) {
  const enabled = o.enabled ?? true;
  const color = enabled ? (o.color ?? 0x8a5a2b) : 0x444444;
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.35).fillRoundedRect(-o.width / 2 + 3, -o.height / 2 + 4, o.width, o.height, 12);
  bg.fillStyle(color, 1).fillRoundedRect(-o.width / 2, -o.height / 2, o.width, o.height, 12);
  bg.lineStyle(3, enabled ? 0xf5deb3 : 0x777777, 1).strokeRoundedRect(-o.width / 2, -o.height / 2, o.width, o.height, 12);
  const fs = o.fontSize ?? Math.round(o.height * 0.36);
  const label = scene.add.text(0, o.sub ? -o.height * 0.13 : 0, o.label, {
    fontFamily: FONT, fontSize: `${fs}px`, color: enabled ? '#fff8e7' : '#999999', fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add([bg, label]);
  if (o.sub) {
    const sub = scene.add.text(0, o.height * 0.22, o.sub, {
      fontFamily: FONT, fontSize: `${Math.round(fs * 0.62)}px`, color: enabled ? '#ffe9a8' : '#888888',
    }).setOrigin(0.5);
    c.add(sub);
  }
  // Note: Phaser hit-tests containers relative to their top-left (it adds the origin offset itself),
  // so the hit rectangle must start at (0, 0) even though the container is drawn centred.
  c.setSize(o.width, o.height);
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, o.width, o.height), Phaser.Geom.Rectangle.Contains);
  // Press = the same pointer goes down AND up on the button (a drag that ends here does not count).
  // Scale is relative to whatever scale the caller set (buttons are often scaled by the UI unit).
  let armed = -1;
  const base = () => (c.getData('baseScale') as number | undefined) ?? c.scaleX;
  c.on('pointerdown', (p: Phaser.Input.Pointer) => {
    c.setData('baseScale', c.scaleX);
    armed = p.id;
    c.setScale(base() * 0.94);
  });
  c.on('pointerup', (p: Phaser.Input.Pointer) => {
    c.setScale(base());
    if (armed !== p.id) return;
    armed = -1;
    if (!enabled) { Sound.deny(); return; }
    Sound.click();
    o.onPress();
  });
  c.on('pointerout', () => { c.setScale(base()); armed = -1; });
  return c;
}

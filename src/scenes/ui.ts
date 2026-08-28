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

/** UI scale unit that fits both axes (so nothing overflows in landscape phones). */
export function uiUnit(w: number, h: number) {
  return Phaser.Math.Clamp(Math.min(w / 420, h / 560), 0.75, 1.6) * (Math.min(w, h) > 1000 ? 1.15 : 1);
}

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
  c.on('pointerdown', () => {
    c.setScale(0.94);
  });
  c.on('pointerup', () => {
    c.setScale(1);
    if (!enabled) { Sound.deny(); return; }
    Sound.click();
    o.onPress();
  });
  c.on('pointerout', () => c.setScale(1));
  return c;
}

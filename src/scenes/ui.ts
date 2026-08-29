// ui.ts — the game's look in one place: palette, fonts, and the shared parchment/iron widgets
// (buttons, panels, text styles). Every screen builds from these so it all reads as one thing.
import Phaser from 'phaser';
import { Sound } from '../systems/Sound';

/** Two self-hosted faces: a strong display serif for titles, a clean sans for everything else. */
export const FONTS = {
  display: '"Cinzel", "Times New Roman", Georgia, serif',
  ui: '"Nunito Sans", "Helvetica Neue", Arial, sans-serif',
};
export const FONT = FONTS.ui;
export const DISPLAY = FONTS.display;

/** One cohesive palette: aged parchment, dark iron, ember/gold accents, muted earth. Red = danger only. */
export const PAL = {
  parchment: 0xe7d8b4, parchmentDeep: 0xcdb78d, parchmentEdge: 0x8f7a52,
  ink: 0x3a2a18, inkSoft: 0x6b5637,
  iron: 0x2a2c32, iron2: 0x3b3e46, ironEdge: 0x121317, ironHi: 0x5c6070,
  ember: 0xf2711c, emberDeep: 0xb84a0c,
  gold: 0xd9a441, goldHi: 0xf1cf6a, goldDeep: 0x9a6f22,
  earth: 0x5b6b42, earthDeep: 0x46552f, earthHi: 0x6a7a4e, dirt: 0x8a7048, dirtDeep: 0x6f5a3c,
  danger: 0xa8231b, dangerHi: 0xd8402f, dangerDeep: 0x6e150f,
  steel: 0x7d7f88, water: 0x3d6a8a, leaf: 0x3b5230, leafDeep: 0x30452a,
};
export const CSS = {
  cream: '#f3e9d2', parchment: '#e7d8b4', ink: '#3a2a18', inkSoft: '#6b5637', muted: '#a89a80',
  gold: '#d9a441', goldHi: '#f1cf6a', ember: '#f2711c', emberDeep: '#8a3a10',
  danger: '#c8362a', dangerHi: '#e0453a', green: '#7fae5a', greenSoft: '#c8f0c8', steel: '#b8bcc6',
};

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

// ---------------------------------------------------------------- text styles
export function displayStyle(px: number, color = CSS.cream, stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: DISPLAY, fontSize: `${Math.round(px)}px`, color, fontStyle: 'bold', stroke: '#000000', strokeThickness: stroke ? Math.max(2, Math.round(px / 6)) : 0 };
}
export function uiStyle(px: number, color = CSS.cream, opts: { bold?: boolean; stroke?: boolean; align?: string; wrap?: number } = {}): Phaser.Types.GameObjects.Text.TextStyle {
  const s: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: FONT, fontSize: `${Math.round(px)}px`, color, fontStyle: opts.bold === false ? 'normal' : 'bold', align: opts.align ?? 'center' };
  if (opts.stroke) { s.stroke = '#000000'; s.strokeThickness = Math.max(2, Math.round(px / 5)); }
  if (opts.wrap) s.wordWrap = { width: opts.wrap };
  return s;
}

// ---------------------------------------------------------------- panels
export interface PanelOpts { tone?: 'parchment' | 'iron'; radius?: number; alpha?: number; }
/** A parchment (or iron) plate with an iron border, a thin gold inner line, and a soft shadow. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: PanelOpts = {}) {
  const r = o.radius ?? 14;
  const parchment = (o.tone ?? 'parchment') === 'parchment';
  g.fillStyle(0x000000, 0.4).fillRoundedRect(x + 3, y + 5, w, h, r);
  g.fillStyle(PAL.ironEdge, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, r + 3);
  g.fillStyle(parchment ? PAL.parchment : PAL.iron, o.alpha ?? 1).fillRoundedRect(x, y, w, h, r);
  if (parchment) {
    g.fillStyle(PAL.parchmentDeep, 0.55).fillRoundedRect(x, y + h - 10, w, 10, { tl: 0, tr: 0, bl: r, br: r });
  } else {
    g.fillStyle(PAL.iron2, 1).fillRoundedRect(x, y, w, 10, { tl: r, tr: r, bl: 0, br: 0 });
  }
  g.lineStyle(1.5, parchment ? PAL.goldDeep : PAL.gold, parchment ? 0.6 : 0.8).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, Math.max(4, r - 4));
  return g;
}
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PanelOpts = {}) {
  return drawPanel(scene.add.graphics(), x, y, w, h, o);
}

// ---------------------------------------------------------------- buttons
export type Tone = 'danger' | 'primary' | 'success' | 'neutral' | 'ghost';
export interface ButtonOpts {
  width: number; height: number; label: string; sub?: string; color?: number; tone?: Tone; fontSize?: number;
  enabled?: boolean; onPress: () => void;
}

/** Old call sites pass a colour; map it to one of the palette tones. */
function toneOf(color: number | undefined, tone: Tone | undefined): Tone {
  if (tone) return tone;
  if (color === undefined) return 'neutral';
  if (color === 0xa0341f || color === 0xc03030) return 'danger';
  if (color === 0x3f7a3f) return 'success';
  if (color === 0x2f6b8a) return 'primary';
  if (color === 0x444444 || color === 0x555555) return 'ghost';
  return 'neutral';
}

const TONES: Record<Tone, { face: number; faceHi: number; edge: number; text: string; sub: string }> = {
  danger:  { face: PAL.danger, faceHi: PAL.dangerHi, edge: PAL.dangerDeep, text: CSS.cream, sub: '#ffd9d0' },
  primary: { face: PAL.goldDeep, faceHi: PAL.gold, edge: 0x5d4212, text: CSS.cream, sub: '#fff1c2' },
  success: { face: PAL.emberDeep, faceHi: PAL.ember, edge: 0x6e2c06, text: CSS.cream, sub: '#ffe3c8' },
  neutral: { face: PAL.parchmentDeep, faceHi: PAL.parchment, edge: PAL.parchmentEdge, text: CSS.ink, sub: CSS.inkSoft },
  ghost:   { face: PAL.iron, faceHi: PAL.iron2, edge: PAL.ironEdge, text: CSS.cream, sub: CSS.muted },
};

/** A chunky button in the house style. Scales down on press so taps feel acknowledged. */
export function makeButton(scene: Phaser.Scene, x: number, y: number, o: ButtonOpts) {
  const enabled = o.enabled ?? true;
  const t = TONES[enabled ? toneOf(o.color, o.tone) : 'ghost'];
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const w = o.width, h = o.height, r = Math.min(12, h * 0.28);
  bg.fillStyle(0x000000, 0.4).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, r);
  bg.fillStyle(t.edge, 1).fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, r + 2);
  bg.fillStyle(t.face, enabled ? 1 : 0.6).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  bg.fillStyle(t.faceHi, enabled ? 1 : 0.4).fillRoundedRect(-w / 2, -h / 2, w, h * 0.45, { tl: r, tr: r, bl: 0, br: 0 });
  bg.lineStyle(1.5, 0xffffff, enabled ? 0.35 : 0.12).strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, Math.max(3, r - 2));
  const fs = o.fontSize ?? Math.round(h * 0.36);
  const label = scene.add.text(0, o.sub ? -h * 0.14 : 0, o.label, {
    fontFamily: FONT, fontSize: `${fs}px`, color: enabled ? t.text : '#9a9a9a', fontStyle: 'bold',
  }).setOrigin(0.5);
  c.add([bg, label]);
  if (o.sub) {
    const sub = scene.add.text(0, h * 0.2, o.sub, {
      fontFamily: FONT, fontSize: `${Math.round(fs * 0.6)}px`, color: enabled ? t.sub : '#8a8a8a', align: 'center', wordWrap: { width: w - 16 },
    }).setOrigin(0.5);
    // a long sub-label wraps to two lines; keep it inside the button
    if (sub.height > h * 0.5) sub.setFontSize(Math.round(fs * 0.5)).setWordWrapWidth(w - 12);
    c.add(sub);
  }
  // Phaser hit-tests containers relative to their top-left (it adds the origin offset itself),
  // so the hit rectangle must start at (0, 0) even though the container is drawn centred.
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
  // Press = the same pointer goes down AND up on the button (a drag that ends here does not count).
  let armed = -1;
  const base = () => (c.getData('baseScale') as number | undefined) ?? c.scaleX;
  c.on('pointerdown', (p: Phaser.Input.Pointer) => { c.setData('baseScale', c.scaleX); armed = p.id; c.setScale(base() * 0.94); });
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

/** A dark iron backdrop with a soft vignette, for menu screens. */
export function ironBackdrop(scene: Phaser.Scene, w: number, h: number) {
  const g = scene.add.graphics();
  g.fillStyle(PAL.iron, 1).fillRect(0, 0, w, h);
  g.fillStyle(PAL.iron2, 0.5);
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, 60 + (i % 5) * 30, 2);
  g.fillStyle(0x000000, 0.35).fillRect(0, 0, w, h * 0.12);
  g.fillStyle(0x000000, 0.45).fillRect(0, h * 0.85, w, h * 0.15);
  return g;
}

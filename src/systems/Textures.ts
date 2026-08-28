// Textures.ts — placeholder art: every sprite is a colored shape drawn in code at boot,
// then baked into a texture so it can be tinted (hit flash) and batched (fast on phones).
import Phaser from 'phaser';
import { HERO, WEAPONS } from '../config/balance';

export const TEX = {
  px: 'px',           // 1x1 white pixel — HP bars, overlays
  hero: 'hero',
  troop: 'troop',
  militia: 'militia',
  archer: 'archer',
  captain: 'captain',
  arrow: 'arrow',
  coin: 'coin',
  ring: 'ring',
  dot: 'dot',
  blade: 'blade',
  slash: (tier: number) => `slash${tier}`,
  hut: (w: number, h: number) => `hut_${w}x${h}`,
};

export const HUT_SIZES: Array<[number, number]> = [[90, 70], [80, 64], [70, 90], [64, 80], [100, 60]];

export const COLORS = {
  hero: 0x3fa9f5,
  troop: 0x5ec26a,
  militia: 0xc44536,
  archer: 0xb06ad9,
  captain: 0x8e1f1f,
  gold: 0xf5c542,
  hurt: 0xff4d4d,
  troopHurt: 0xffa040,
};

function g(scene: Phaser.Scene) {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function roundedUnit(scene: Phaser.Scene, key: string, size: number, fill: number, edge: number, radius = 5) {
  const gr = g(scene);
  gr.fillStyle(edge, 1);
  gr.fillRoundedRect(0, 0, size, size, radius);
  gr.fillStyle(fill, 1);
  gr.fillRoundedRect(2, 2, size - 4, size - 4, radius - 1);
  // a lighter "highlight" band so the shape reads as solid, not flat
  gr.fillStyle(0xffffff, 0.18);
  gr.fillRoundedRect(4, 4, size - 8, (size - 8) * 0.35, 3);
  gr.generateTexture(key, size, size);
  gr.destroy();
}

export function generateTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX.px)) return;

  // 1x1 white pixel
  let gr = g(scene);
  gr.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
  gr.generateTexture(TEX.px, 2, 2);
  gr.destroy();

  roundedUnit(scene, TEX.hero, 26, COLORS.hero, 0x1b4f7a, 6);
  roundedUnit(scene, TEX.troop, 22, COLORS.troop, 0x2b6b35, 5);
  roundedUnit(scene, TEX.militia, 22, COLORS.militia, 0x6b1f18, 3);
  roundedUnit(scene, TEX.captain, 30, COLORS.captain, 0xf5c542, 4);

  // archers are circles so they read differently at a glance
  gr = g(scene);
  gr.fillStyle(0x4a2a63, 1).fillCircle(10, 10, 10);
  gr.fillStyle(COLORS.archer, 1).fillCircle(10, 10, 8);
  gr.fillStyle(0xffffff, 0.2).fillCircle(8, 7, 4);
  gr.generateTexture(TEX.archer, 20, 20);
  gr.destroy();

  // arrow: a thin shaft with a bright tip
  gr = g(scene);
  gr.fillStyle(0xe8dcc0, 1).fillRect(0, 1, 14, 2);
  gr.fillStyle(0xffffff, 1).fillRect(11, 0, 4, 4);
  gr.generateTexture(TEX.arrow, 16, 4);
  gr.destroy();

  // coin
  gr = g(scene);
  gr.fillStyle(0x9a7a1a, 1).fillCircle(6, 6, 6);
  gr.fillStyle(COLORS.gold, 1).fillCircle(6, 6, 4.5);
  gr.fillStyle(0xfff3b0, 1).fillCircle(5, 5, 1.6);
  gr.generateTexture(TEX.coin, 12, 12);
  gr.destroy();

  // ring: for the War Horn pulse
  gr = g(scene);
  gr.lineStyle(4, 0xffffff, 1).strokeCircle(42, 42, 38);
  gr.generateTexture(TEX.ring, 84, 84);
  gr.destroy();

  // dot: particle
  gr = g(scene);
  gr.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
  gr.generateTexture(TEX.dot, 6, 6);
  gr.destroy();

  // blade: the hero's facing marker; scaled by weapon tier
  gr = g(scene);
  gr.fillStyle(0xdddddd, 1).fillRect(0, 0, 10, 4);
  gr.fillStyle(0xffffff, 1).fillRect(7, 0, 3, 4);
  gr.generateTexture(TEX.blade, 10, 4);
  gr.destroy();

  // slash wedges: one per weapon tier — bigger reach and wider arc as the tier goes up
  WEAPONS.forEach((w, i) => {
    const r = w.reach + HERO.radius + 11; // edge-reach + hero radius + a militia radius = where hits actually land
    const size = r * 2 + 4;
    const c = size / 2;
    const half = Phaser.Math.DegToRad(w.arcDeg / 2);
    const s = g(scene);
    s.fillStyle(0xffffff, 0.35);
    s.slice(c, c, r, -half, half, false);
    s.fillPath();
    s.fillStyle(0xffffff, 0.85);
    s.slice(c, c, r, -half, half, false);
    s.lineStyle(3, 0xffffff, 1);
    s.strokePath();
    // inner brighter core so it reads as a swing, not a flat pie
    s.fillStyle(0xffffff, 0.5);
    s.slice(c, c, r * 0.55, -half * 0.8, half * 0.8, false);
    s.fillPath();
    s.generateTexture(TEX.slash(i + 1), size, size);
    s.destroy();
  });

  // huts: several sizes; a body, a darker roof band, and an outline
  for (const [w, h] of HUT_SIZES) {
    const s = g(scene);
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x6b4a2b, 1).fillRect(3, 3, w - 6, h - 6);
    s.fillStyle(0x8b5e34, 1).fillRect(3, 3, w - 6, Math.floor(h * 0.42));
    s.fillStyle(0x3a2716, 1).fillRect(Math.floor(w / 2) - 6, h - 16, 12, 13); // door
    s.generateTexture(TEX.hut(w, h), w, h);
    s.destroy();
  }
}

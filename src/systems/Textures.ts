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
  horse: 'horse',
  shield: 'shield',
  slash: (tier: number) => `slash${tier}`,
  hut: (w: number, h: number) => `hut_${w}x${h}`,
  // overworld
  mapCamp: 'map_camp', mapVillage: 'map_village', mapTown: 'map_town', mapToken: 'map_token', mapCross: 'map_cross', mapPalisade: 'map_palisade',
  // bandit camp
  forge: 'bld_forge', barracks: 'bld_barracks', stables: 'bld_stables', tent: 'tent', campfire: 'campfire', signpost: 'signpost',
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

  for (const [w, h] of HUT_SIZES) obstacleTexture(scene, 'hut', w, h);

  // the horse: an ellipse drawn under a mounted hero so the silhouette reads bigger
  gr = g(scene);
  gr.fillStyle(0x3a2412, 1).fillEllipse(24, 14, 48, 26);
  gr.fillStyle(0x6b4423, 1).fillEllipse(24, 13, 42, 20);
  gr.fillStyle(0x8a5a30, 0.8).fillEllipse(20, 10, 18, 8);
  gr.generateTexture(TEX.horse, 48, 28);
  gr.destroy();

  // shield marker: a small round shield carried beside the hero
  gr = g(scene);
  gr.fillStyle(0x3a2716, 1).fillCircle(7, 7, 7);
  gr.fillStyle(0xc9a86a, 1).fillCircle(7, 7, 5.5);
  gr.fillStyle(0x7a5a33, 1).fillRect(6, 2, 2, 10).fillRect(2, 6, 10, 2);
  gr.generateTexture(TEX.shield, 14, 14);
  gr.destroy();

  mapIcons(scene);
  campBuildings(scene);
}

/** Huts, rocks and palisade walls of any size, baked on first use. */
export function obstacleTexture(scene: Phaser.Scene, kind: 'hut' | 'rock' | 'wall', w: number, h: number): string {
  const key = `${kind}_${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const s = g(scene);
  if (kind === 'hut') {
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x6b4a2b, 1).fillRect(3, 3, w - 6, h - 6);
    s.fillStyle(0x8b5e34, 1).fillRect(3, 3, w - 6, Math.floor(h * 0.42));
    s.fillStyle(0x3a2716, 1).fillRect(Math.floor(w / 2) - 6, h - 16, 12, 13); // door
  } else if (kind === 'rock') {
    s.fillStyle(0x2e302c, 1).fillEllipse(w / 2, h / 2 + 2, w, h - 2);
    s.fillStyle(0x6f726b, 1).fillEllipse(w / 2, h / 2, w - 4, h - 6);
    s.fillStyle(0x9a9d94, 0.7).fillEllipse(w / 2 - w * 0.15, h / 2 - h * 0.18, w * 0.4, h * 0.28);
  } else {
    // palisade: sharpened logs, stripes across the short axis
    s.fillStyle(0x2b1c10, 1).fillRect(0, 0, w, h);
    s.fillStyle(0x7a5a33, 1).fillRect(1, 1, w - 2, h - 2);
    s.fillStyle(0x4a3218, 1);
    if (w < h) { for (let y = 2; y < h; y += 10) s.fillRect(1, y, w - 2, 3); }
    else { for (let x = 2; x < w; x += 10) s.fillRect(x, 1, 3, h - 2); }
  }
  s.generateTexture(key, w, h);
  s.destroy();
  return key;
}

function mapIcons(scene: Phaser.Scene) {
  // camp: a tent and a fire
  let s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillTriangle(4, 40, 44, 40, 24, 6);
  s.fillStyle(0x8a6a3c, 1).fillTriangle(8, 38, 40, 38, 24, 10);
  s.fillStyle(0x3a2716, 1).fillTriangle(18, 38, 30, 38, 24, 22);
  s.fillStyle(0xff8a2a, 1).fillCircle(46, 36, 5);
  s.fillStyle(0xffd060, 1).fillCircle(46, 35, 2.5);
  s.generateTexture(TEX.mapCamp, 54, 44);
  s.destroy();
  // village: three little huts
  s = g(scene);
  const hutIcon = (x: number, y: number, w: number, h: number) => {
    s.fillStyle(0x2b1c10, 1).fillRect(x, y, w, h);
    s.fillStyle(0x6b4a2b, 1).fillRect(x + 2, y + 2, w - 4, h - 4);
    s.fillStyle(0x8b5e34, 1).fillRect(x + 2, y + 2, w - 4, Math.floor(h * 0.42));
  };
  hutIcon(2, 14, 22, 18); hutIcon(28, 4, 24, 20); hutIcon(34, 26, 20, 16);
  s.generateTexture(TEX.mapVillage, 58, 44);
  s.destroy();
  // town: walls with towers and a gate
  s = g(scene);
  s.fillStyle(0x2a2a2e, 1).fillRect(0, 12, 66, 40);
  s.fillStyle(0x7d7f88, 1).fillRect(3, 15, 60, 34);
  s.fillStyle(0x55575f, 1).fillRect(0, 6, 14, 46).fillRect(52, 6, 14, 46);
  s.fillStyle(0x9a9ca6, 1).fillRect(2, 8, 10, 42).fillRect(54, 8, 10, 42);
  s.fillStyle(0x2a2a2e, 1).fillRect(27, 32, 12, 18);
  s.fillStyle(0xc03030, 1).fillTriangle(7, 6, 7, 0, 15, 3).fillTriangle(59, 6, 59, 0, 67, 3);
  s.generateTexture(TEX.mapTown, 68, 54);
  s.destroy();
  // the warband token: hero square with a banner
  s = g(scene);
  s.fillStyle(0x1b4f7a, 1).fillRoundedRect(2, 14, 26, 26, 6);
  s.fillStyle(0x3fa9f5, 1).fillRoundedRect(4, 16, 22, 22, 5);
  s.fillStyle(0xffffff, 0.25).fillRoundedRect(6, 18, 18, 8, 3);
  s.fillStyle(0xeeeeee, 1).fillRect(26, 0, 2, 22);
  s.fillStyle(0xc03030, 1).fillTriangle(28, 1, 28, 13, 40, 7);
  s.generateTexture(TEX.mapToken, 42, 42);
  s.destroy();
  // crossroads dot
  s = g(scene);
  s.fillStyle(0x6f5a3c, 1).fillCircle(6, 6, 6);
  s.fillStyle(0x8a7048, 1).fillCircle(6, 6, 4);
  s.generateTexture(TEX.mapCross, 12, 12);
  s.destroy();
  // palisade badge: a ring of stakes
  s = g(scene);
  s.lineStyle(4, 0x7a5a33, 1).strokeCircle(30, 30, 24);
  s.fillStyle(0x4a3218, 1);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; s.fillCircle(30 + Math.cos(a) * 24, 30 + Math.sin(a) * 24, 3); }
  s.generateTexture(TEX.mapPalisade, 60, 60);
  s.destroy();
}

function campBuildings(scene: Phaser.Scene) {
  // forge: stone, chimney, a glowing hearth
  let s = g(scene);
  s.fillStyle(0x1e1b1b, 1).fillRect(0, 0, 160, 110);
  s.fillStyle(0x4a4646, 1).fillRect(3, 3, 154, 104);
  s.fillStyle(0x2e2a2a, 1).fillRect(3, 3, 154, 40);
  s.fillStyle(0x3a3636, 1).fillRect(120, -0, 22, 30);
  s.fillStyle(0xff6a1a, 1).fillRect(60, 60, 40, 44);
  s.fillStyle(0xffc247, 1).fillRect(68, 70, 24, 30);
  s.fillStyle(0x2b2b2b, 1).fillRect(20, 80, 30, 14); // anvil
  s.generateTexture(TEX.forge, 160, 110);
  s.destroy();
  // barracks: timber with a green banner
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillRect(0, 0, 170, 110);
  s.fillStyle(0x6b4a2b, 1).fillRect(3, 3, 164, 104);
  s.fillStyle(0x8b5e34, 1).fillRect(3, 3, 164, 42);
  s.fillStyle(0x3f7a3f, 1).fillRect(76, 40, 18, 46);
  s.fillStyle(0x2b6b35, 1).fillTriangle(76, 86, 94, 86, 85, 98);
  s.fillStyle(0x3a2716, 1).fillRect(30, 76, 22, 30).fillRect(118, 76, 22, 30);
  s.generateTexture(TEX.barracks, 170, 110);
  s.destroy();
  // stables: open front, fence, hay
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillRect(0, 0, 180, 110);
  s.fillStyle(0x7a5a33, 1).fillRect(3, 3, 174, 104);
  s.fillStyle(0x9a7040, 1).fillRect(3, 3, 174, 36);
  s.fillStyle(0x3a2716, 1).fillRect(20, 44, 60, 62).fillRect(100, 44, 60, 62);
  s.fillStyle(0xd9b24a, 1).fillCircle(50, 90, 12).fillCircle(130, 90, 12);
  s.fillStyle(0xc9a86a, 1);
  for (let x = 8; x < 180; x += 20) s.fillRect(x, 96, 4, 14);
  s.generateTexture(TEX.stables, 180, 110);
  s.destroy();
  // tent
  s = g(scene);
  s.fillStyle(0x2b1c10, 1).fillTriangle(0, 50, 60, 50, 30, 4);
  s.fillStyle(0x8a6a3c, 1).fillTriangle(4, 48, 56, 48, 30, 8);
  s.fillStyle(0x3a2716, 1).fillTriangle(22, 48, 38, 48, 30, 28);
  s.generateTexture(TEX.tent, 60, 52);
  s.destroy();
  // campfire
  s = g(scene);
  s.fillStyle(0x3a2716, 1).fillRect(2, 20, 26, 5).fillRect(6, 24, 20, 4);
  s.fillStyle(0xff6a1a, 1).fillCircle(15, 14, 10);
  s.fillStyle(0xffc247, 1).fillCircle(15, 15, 6);
  s.fillStyle(0xfff3b0, 1).fillCircle(15, 16, 2.5);
  s.generateTexture(TEX.campfire, 30, 30);
  s.destroy();
  // signpost
  s = g(scene);
  s.fillStyle(0x3a2716, 1).fillRect(10, 8, 6, 34);
  s.fillStyle(0x8a6a3c, 1).fillRect(0, 6, 30, 14);
  s.fillStyle(0x2b1c10, 1).fillTriangle(30, 6, 30, 20, 36, 13);
  s.generateTexture(TEX.signpost, 36, 42);
  s.destroy();
}

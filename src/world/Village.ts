// Village.ts — the raid map. You start in a dead-end street walled by huts (the funnel: defenders
// can only come at you two abreast from the east). It opens onto a plaza ringed by more huts with
// alleys between them, and open fields to the north-west where you can be surrounded.
import Phaser from 'phaser';
import type { RaidScene } from '../scenes/RaidScene';
import { TEX } from '../systems/Textures';
import { mulberry32 } from '../utils/rng';

export const WORLD = { w: 1280, h: 960 };

export interface HutDef { x: number; y: number; w: number; h: number; }

/** Hut centers and sizes. Sizes must exist in HUT_SIZES (Textures.ts). */
export const HUTS: HutDef[] = [
  // the street: two solid rows with a 56px lane between them (y 752..808), sealed at the west end
  { x: 130, y: 780, w: 64, h: 80 },
  { x: 220, y: 722, w: 100, h: 60 }, { x: 330, y: 722, w: 100, h: 60 }, { x: 440, y: 722, w: 100, h: 60 }, { x: 550, y: 722, w: 100, h: 60 },
  { x: 220, y: 838, w: 100, h: 60 }, { x: 330, y: 838, w: 100, h: 60 }, { x: 440, y: 838, w: 100, h: 60 }, { x: 550, y: 838, w: 100, h: 60 },
  // the plaza ring (alleys of 60-85px between neighbours)
  { x: 700, y: 330, w: 90, h: 70 }, { x: 820, y: 250, w: 80, h: 64 }, { x: 960, y: 260, w: 100, h: 60 },
  { x: 1090, y: 360, w: 70, h: 90 }, { x: 1110, y: 520, w: 64, h: 80 }, { x: 1040, y: 660, w: 90, h: 70 },
  { x: 890, y: 700, w: 80, h: 64 }, { x: 740, y: 640, w: 70, h: 90 }, { x: 680, y: 490, w: 64, h: 80 },
  // scattered cover in the north-west and south-east
  { x: 300, y: 300, w: 90, h: 70 }, { x: 480, y: 250, w: 80, h: 64 }, { x: 1000, y: 850, w: 100, h: 60 },
  { x: 180, y: 480, w: 64, h: 80 },
];

export const PLAZA = { x: 880, y: 480, r: 200 };

export const SPAWNS = {
  hero: { x: 205, y: 780 },
  militia: [
    { x: 830, y: 430 }, { x: 930, y: 440 }, { x: 880, y: 520 }, { x: 800, y: 560 }, { x: 960, y: 560 }, { x: 760, y: 420 },
    { x: 1000, y: 440 }, { x: 880, y: 380 }, { x: 720, y: 560 }, { x: 1020, y: 600 }, { x: 640, y: 420 }, { x: 900, y: 620 },
    { x: 600, y: 620 }, { x: 760, y: 300 }, { x: 1000, y: 330 }, { x: 1160, y: 450 }, { x: 640, y: 560 }, { x: 1150, y: 620 },
  ],
  archers: [
    { x: 880, y: 300 }, { x: 1040, y: 500 }, { x: 800, y: 710 }, { x: 1100, y: 290 }, { x: 640, y: 350 }, { x: 960, y: 770 },
  ],
  captains: [{ x: 880, y: 470 }, { x: 780, y: 480 }, { x: 1060, y: 560 }],
};

/** Paints the ground once into a texture (grass, dirt plaza, the street) — one draw call per frame. */
export function generateGroundTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('ground')) return;
  const rnd = mulberry32(1337);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x4f5e36, 1).fillRect(0, 0, WORLD.w, WORLD.h);
  // grass texture: darker/lighter blotches
  for (let i = 0; i < 160; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h, r = 10 + rnd() * 40;
    g.fillStyle(rnd() > 0.5 ? 0x46552f : 0x58683d, 0.5).fillCircle(x, y, r);
  }
  // dirt plaza and the street
  g.fillStyle(0x8a7048, 1).fillCircle(PLAZA.x, PLAZA.y, PLAZA.r);
  g.fillStyle(0x8a7048, 1).fillRect(120, 752, 560, 56);
  g.fillStyle(0x7a6240, 1).fillRect(120, 796, 560, 12);
  // trampled path from the street to the plaza
  g.lineStyle(44, 0x8a7048, 1);
  g.beginPath(); g.moveTo(620, 780); g.lineTo(700, 700); g.lineTo(760, 600); g.strokePath();
  // pebbles
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * PLAZA.r;
    g.fillStyle(0x6f5a3c, 0.8).fillCircle(PLAZA.x + Math.cos(a) * d, PLAZA.y + Math.sin(a) * d, 1.5 + rnd() * 2);
  }
  g.generateTexture('ground', WORLD.w, WORLD.h);
  g.destroy();
}

/** Places the ground and the huts (solid obstacles). */
export function buildVillage(scene: RaidScene): Phaser.Physics.Arcade.StaticGroup {
  scene.add.image(0, 0, 'ground').setOrigin(0).setDepth(0);
  const huts = scene.physics.add.staticGroup();
  for (const h of HUTS) {
    const img = huts.create(h.x, h.y, TEX.hut(h.w, h.h)) as Phaser.Physics.Arcade.Sprite;
    img.setDepth(10);
  }
  return huts;
}

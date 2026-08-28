// Layouts.ts — every battle map as data: obstacles (huts, rocks, palisade walls), where the hero
// starts, where defenders stand, and how the ground is painted. Four villages + the open road.
import Phaser from 'phaser';
import { obstacleTexture } from '../systems/Textures';
import { mulberry32 } from '../utils/rng';

export type ObstacleKind = 'hut' | 'rock' | 'wall';
export interface Obstacle { x: number; y: number; w: number; h: number; kind: ObstacleKind; }
export interface Post { x: number; y: number; }
export interface GroundSpec {
  base: number;
  plazas: Array<{ x: number; y: number; r: number }>;
  rects: Array<{ x: number; y: number; w: number; h: number }>;   // top-left based, dirt
  paths: Array<{ pts: Array<[number, number]>; width: number }>;
}
export interface PalisadeSpec { x0: number; y0: number; x1: number; y1: number; gaps: Array<{ side: 'n' | 's' | 'e' | 'w'; from: number; to: number }>; }
export interface LayoutDef {
  id: string; w: number; h: number; heroStart: Post;
  obstacles: Obstacle[];
  posts: { militia: Post[]; archers: Post[]; captains: Post[] };
  ground: GroundSpec;
  palisade?: PalisadeSpec;
  hint: string;
}

const hut = (x: number, y: number, w: number, h: number): Obstacle => ({ x, y, w, h, kind: 'hut' });
const rock = (x: number, y: number, w: number, h: number): Obstacle => ({ x, y, w, h, kind: 'rock' });
const P = (x: number, y: number): Post => ({ x, y });

export const LAYOUTS: Record<string, LayoutDef> = {
  // ---- Ashford: dead-end street (the funnel) opening onto a plaza ring
  ashford: {
    id: 'ashford', w: 1280, h: 960, heroStart: P(205, 780),
    obstacles: [
      hut(130, 780, 64, 80),
      hut(220, 722, 100, 60), hut(330, 722, 100, 60), hut(440, 722, 100, 60), hut(550, 722, 100, 60),
      hut(220, 838, 100, 60), hut(330, 838, 100, 60), hut(440, 838, 100, 60), hut(550, 838, 100, 60),
      hut(700, 330, 90, 70), hut(820, 250, 80, 64), hut(960, 260, 100, 60),
      hut(1090, 360, 70, 90), hut(1110, 520, 64, 80), hut(1040, 660, 90, 70),
      hut(890, 700, 80, 64), hut(740, 640, 70, 90), hut(680, 490, 64, 80),
      hut(300, 300, 90, 70), hut(480, 250, 80, 64), hut(1000, 850, 100, 60), hut(180, 480, 64, 80),
    ],
    posts: {
      militia: [P(830, 430), P(930, 440), P(880, 520), P(800, 560), P(960, 560), P(760, 420), P(1000, 440), P(880, 380), P(720, 560),
        P(1020, 600), P(640, 420), P(900, 620), P(600, 620), P(760, 300), P(1000, 330), P(1160, 450), P(640, 560), P(1150, 620)],
      archers: [P(880, 300), P(1040, 500), P(800, 710), P(1100, 290), P(640, 350), P(960, 770)],
      captains: [P(880, 470), P(780, 480), P(1060, 560)],
    },
    ground: {
      base: 0x4f5e36, plazas: [{ x: 880, y: 480, r: 200 }],
      rects: [{ x: 120, y: 752, w: 560, h: 56 }],
      paths: [{ pts: [[620, 780], [700, 700], [760, 600]], width: 44 }],
    },
    palisade: { x0: 610, y0: 190, x1: 1180, y1: 800, gaps: [{ side: 'w', from: 730, to: 820 }, { side: 'n', from: 780, to: 860 }] },
    hint: 'Hold the street: they can only come two at a time.\nIn the open they will surround you.',
  },

  // ---- Millbrook: three narrow lanes between hut rows lead to a plaza with a longhouse
  millbrook: {
    id: 'millbrook', w: 1280, h: 960, heroStart: P(140, 494),
    obstacles: [
      hut(500, 320, 100, 60), hut(610, 320, 100, 60), hut(720, 320, 100, 60),
      hut(500, 436, 100, 60), hut(610, 436, 100, 60), hut(720, 436, 100, 60),
      hut(500, 552, 100, 60), hut(610, 552, 100, 60), hut(720, 552, 100, 60),
      hut(500, 668, 100, 60), hut(610, 668, 100, 60), hut(720, 668, 100, 60),
      hut(1000, 500, 90, 70), hut(300, 280, 90, 70), hut(880, 180, 80, 64), hut(1080, 760, 90, 70),
      rock(250, 700, 80, 56), rock(400, 820, 60, 44), rock(1160, 300, 50, 50),
      // a low wall makes the start a pocket open only to the east
      hut(140, 410, 64, 80), hut(140, 580, 64, 80),
    ],
    posts: {
      militia: [P(900, 420), P(1000, 420), P(900, 580), P(1000, 580), P(860, 500), P(1060, 440), P(1060, 560), P(940, 340), P(940, 660),
        P(820, 380), P(820, 620), P(1120, 500), P(880, 470), P(1020, 530), P(760, 500), P(1100, 380), P(1100, 620), P(960, 720)],
      archers: [P(960, 330), P(1080, 470), P(880, 640), P(1120, 560), P(840, 360), P(1000, 700)],
      captains: [P(940, 500), P(1040, 500), P(900, 560)],
    },
    ground: {
      base: 0x536338, plazas: [{ x: 960, y: 500, r: 170 }],
      rects: [{ x: 450, y: 350, w: 320, h: 56 }, { x: 450, y: 466, w: 320, h: 56 }, { x: 450, y: 582, w: 320, h: 56 }],
      paths: [{ pts: [[770, 378], [860, 460]], width: 40 }, { pts: [[770, 610], [860, 540]], width: 40 }, { pts: [[160, 494], [450, 494]], width: 36 }],
    },
    palisade: { x0: 430, y0: 250, x1: 1200, y1: 770, gaps: [{ side: 'w', from: 350, to: 406 }, { side: 'w', from: 466, to: 522 }, { side: 'w', from: 582, to: 638 }, { side: 'n', from: 900, to: 1000 }] },
    hint: 'Three lanes lead in. Pick one and hold it —\nthe field outside the lanes is open ground.',
  },

  // ---- Thornhill: a warren of alleys between a grid of huts, plaza to the north
  thornhill: {
    id: 'thornhill', w: 1280, h: 960, heroStart: P(640, 900),
    obstacles: [
      ...[0, 1, 2, 3, 4].flatMap(i => [0, 1, 2].map(j => {
        const x = 380 + 130 * i, y = 470 + 130 * j;
        return (i + j) % 2 === 0 ? hut(x, y, 64, 80) : hut(x, y, 80, 64);
      })),
      hut(575, 900, 64, 80), hut(705, 900, 64, 80),
      hut(300, 250, 90, 70), hut(980, 250, 90, 70), hut(200, 700, 80, 64), hut(1080, 700, 80, 64),
      rock(200, 380, 60, 44), rock(1090, 420, 50, 50),
    ],
    posts: {
      militia: [P(560, 220), P(720, 220), P(640, 300), P(560, 320), P(720, 320), P(500, 260), P(780, 260), P(640, 180), P(460, 340),
        P(820, 340), P(600, 380), P(680, 380), P(520, 180), P(760, 180), P(640, 120), P(440, 220), P(840, 220), P(640, 400)],
      archers: [P(640, 140), P(500, 200), P(780, 200), P(560, 360), P(720, 360), P(640, 340)],
      captains: [P(640, 250), P(580, 280), P(700, 280)],
    },
    ground: {
      base: 0x4b5a35, plazas: [{ x: 640, y: 250, r: 160 }],
      rects: [],
      paths: [{ pts: [[640, 900], [640, 420]], width: 40 }, { pts: [[445, 600], [835, 600]], width: 36 }, { pts: [[445, 470], [835, 470]], width: 30 }],
    },
    palisade: { x0: 290, y0: 110, x1: 990, y1: 810, gaps: [{ side: 's', from: 580, to: 700 }, { side: 'e', from: 560, to: 640 }, { side: 'w', from: 560, to: 640 }] },
    hint: 'The alleys are one-wide. Bait them in and\nnever fight on the plaza.',
  },

  // ---- Greywater: a huge open plaza ringed by far-apart huts — the open-ground test
  greywater: {
    id: 'greywater', w: 1280, h: 960, heroStart: P(150, 830),
    obstacles: [
      hut(980, 470, 64, 80), hut(880, 230, 90, 70), hut(640, 130, 100, 60), hut(400, 230, 90, 70),
      hut(300, 470, 64, 80), hut(400, 710, 90, 70), hut(640, 810, 100, 60), hut(880, 710, 90, 70),
      hut(150, 740, 100, 60), hut(240, 830, 64, 80),
      rock(560, 480, 80, 56), rock(720, 440, 50, 50), rock(1150, 150, 60, 44), rock(1100, 860, 80, 56),
    ],
    posts: {
      militia: [P(540, 380), P(740, 380), P(540, 560), P(740, 560), P(640, 330), P(640, 620), P(480, 470), P(800, 470), P(600, 420),
        P(680, 520), P(520, 300), P(760, 300), P(520, 640), P(760, 640), P(440, 400), P(840, 400), P(440, 560), P(840, 560)],
      archers: [P(640, 280), P(800, 350), P(480, 350), P(800, 600), P(480, 600), P(640, 680)],
      captains: [P(640, 470), P(580, 500), P(700, 440)],
    },
    ground: {
      base: 0x5a6a3c, plazas: [{ x: 640, y: 470, r: 260 }],
      rects: [],
      paths: [{ pts: [[200, 880], [400, 700], [500, 600]], width: 40 }],
    },
    palisade: { x0: 250, y0: 90, x1: 1030, y1: 860, gaps: [{ side: 's', from: 560, to: 720 }, { side: 'w', from: 560, to: 700 }] },
    hint: 'Nowhere to hide. Use the rocks and the huts\nat the edge — the plaza is a killing ground.',
  },

  // ---- The open road: a patrol battle with a few boulders for cover
  field: {
    id: 'field', w: 1280, h: 960, heroStart: P(220, 480),
    obstacles: [
      rock(500, 300, 80, 56), rock(760, 640, 60, 44), rock(640, 470, 50, 50), rock(900, 300, 44, 60),
      rock(420, 700, 80, 56), rock(1000, 720, 60, 44), rock(300, 250, 50, 50),
    ],
    posts: {
      militia: [P(900, 420), P(950, 480), P(900, 540), P(1000, 400), P(1000, 560), P(1050, 480), P(960, 340), P(960, 620), P(1100, 420),
        P(1100, 540), P(850, 480), P(1150, 480), P(1050, 360), P(1050, 600), P(1180, 420), P(1180, 540), P(820, 420), P(820, 540)],
      archers: [P(1050, 380), P(1050, 580), P(1120, 480), P(980, 300), P(980, 660), P(1180, 400)],
      captains: [P(1000, 480), P(1080, 440), P(1080, 520)],
    },
    ground: {
      base: 0x5c6e3e, plazas: [],
      rects: [{ x: 0, y: 450, w: 1280, h: 60 }],
      paths: [],
    },
    hint: 'Open road. Put a rock at your back\nand keep them in front of you.',
  },
};

/** Palisade wall segments (14px thick) around the village core, leaving the listed gates open. */
export function palisadeFor(l: LayoutDef): Obstacle[] {
  const p = l.palisade;
  if (!p) return [];
  const T = 14;
  const out: Obstacle[] = [];
  const run = (side: 'n' | 's' | 'e' | 'w', from: number, to: number) => {
    const gaps = p.gaps.filter(g => g.side === side).sort((a, b) => a.from - b.from);
    let cursor = from;
    const seg = (a: number, b: number) => {
      if (b - a < 8) return;
      if (side === 'n' || side === 's') out.push({ x: (a + b) / 2, y: side === 'n' ? p.y0 : p.y1, w: b - a, h: T, kind: 'wall' });
      else out.push({ x: side === 'w' ? p.x0 : p.x1, y: (a + b) / 2, w: T, h: b - a, kind: 'wall' });
    };
    for (const g of gaps) { seg(cursor, g.from); cursor = g.to; }
    seg(cursor, to);
  };
  run('n', p.x0, p.x1); run('s', p.x0, p.x1); run('w', p.y0, p.y1); run('e', p.y0, p.y1);
  return out;
}

function hashId(s: string) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** Paints the ground for a layout once into a texture — one draw call per frame. */
export function groundTexture(scene: Phaser.Scene, l: LayoutDef): string {
  const key = `ground_${l.id}`;
  if (scene.textures.exists(key)) return key;
  const rnd = mulberry32(hashId(l.id));
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const gs = l.ground;
  g.fillStyle(gs.base, 1).fillRect(0, 0, l.w, l.h);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * l.w, y = rnd() * l.h, r = 10 + rnd() * 40;
    g.fillStyle(rnd() > 0.5 ? 0x46552f : 0x62724a, 0.45).fillCircle(x, y, r);
  }
  for (const p of gs.plazas) g.fillStyle(0x8a7048, 1).fillCircle(p.x, p.y, p.r);
  for (const r of gs.rects) { g.fillStyle(0x8a7048, 1).fillRect(r.x, r.y, r.w, r.h); g.fillStyle(0x7a6240, 1).fillRect(r.x, r.y + r.h - 12, r.w, 12); }
  for (const path of gs.paths) {
    g.lineStyle(path.width, 0x8a7048, 1);
    g.beginPath();
    path.pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.strokePath();
  }
  for (const p of gs.plazas) {
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * p.r;
      g.fillStyle(0x6f5a3c, 0.8).fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1.5 + rnd() * 2);
    }
  }
  g.generateTexture(key, l.w, l.h);
  g.destroy();
  return key;
}

/** Places the ground and every solid obstacle. Returns the static physics group of obstacles. */
export function buildLayout(scene: Phaser.Scene, l: LayoutDef, obstacles: Obstacle[]): Phaser.Physics.Arcade.StaticGroup {
  scene.add.image(0, 0, groundTexture(scene, l)).setOrigin(0).setDepth(0);
  const group = scene.physics.add.staticGroup();
  for (const o of obstacles) {
    const img = group.create(o.x, o.y, obstacleTexture(scene, o.kind, o.w, o.h)) as Phaser.Physics.Arcade.Sprite;
    img.setDepth(o.kind === 'wall' ? 11 : 10);
  }
  return group;
}

/** Is a circle clear of every obstacle? Used to nudge spawns out of walls. */
export function clearOf(obstacles: Obstacle[], x: number, y: number, r: number) {
  for (let tries = 0; tries < 8; tries++) {
    const hit = obstacles.find(h => x + r > h.x - h.w / 2 && x - r < h.x + h.w / 2 && y + r > h.y - h.h / 2 && y - r < h.y + h.h / 2);
    if (!hit) break;
    const dx = x - hit.x, dy = y - hit.y;
    const len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 30; y += (dy / len) * 30;
  }
  return { x, y };
}

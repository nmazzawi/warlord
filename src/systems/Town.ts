// Town.ts — a settlement seen from the hillside above it. Not an elevation of four shopfronts but a
// piece of country: contoured ground in banded greens, a water edge where there is one, dirt paths
// wandering between clusters of small roofs, and the few big buildings that matter standing where the
// paths meet. The ground, the water, the paths and the houses are baked into one picture; only the
// buildings you can walk into are separate, because only they need to be tapped.
import Phaser from 'phaser';
import { mulberry32 } from '../utils/rng';
import type { ArchSet } from './Architecture';

const dark = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).darken(Math.round(k * 45)).color;
const lite = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).lighten(Math.round(k * 40)).color;

/** The ground each country stands on, in bands from the far hills to the near grass. */
const GROUND: Record<ArchSet, { bands: number[]; water: number; path: number; roof: number; wall: number }> = {
  classical: { bands: [0x7d8f5c, 0x8b9c63, 0x9aab6e, 0xa9b87a], water: 0x4f7f9a, path: 0xbfa887, roof: 0xb4553f, wall: 0xe8dfc8 },
  pagoda:    { bands: [0x5d7a54, 0x6b8a5c, 0x7c9a68, 0x8daa76], water: 0x4b7f8e, path: 0xb09a78, roof: 0x6e5560, wall: 0xd9cbb0 },
  dome:      { bands: [0x9a9563, 0xa8a06c, 0xb9ae7a, 0xc9bd8a], water: 0x3f8a92, path: 0xd0b483, roof: 0x3f7f86, wall: 0xe3d3a8 },
  longhouse: { bands: [0x4f6a48, 0x5c7852, 0x6b875e, 0x7a966b], water: 0x51748c, path: 0x8f7c58, roof: 0x5f7247, wall: 0x7a5a3a },
  yurt:      { bands: [0x7f8d55, 0x8d9a60, 0x9ca86d, 0xabb67b], water: 0x5b86a0, path: 0xb3a279, roof: 0xb9a882, wall: 0xe0d6c0 },
  adobe:     { bands: [0x9a8a5c, 0xa89566, 0xb8a374, 0xc7b184], water: 0x3f86a8, path: 0xd6bc8c, roof: 0xbf9060, wall: 0xd9b482 },
  timber:    { bands: [0x63764c, 0x718455, 0x7f9262, 0x8ea070], water: 0x51748c, path: 0xa8916a, roof: 0x5a4a30, wall: 0x8a6a44 },
};
export function groundOf(set: ArchSet) { return GROUND[set] ?? GROUND.timber; }

export interface TownPlan {
  /** Where each functional building stands, in scene pixels, and how big it is drawn. */
  plots: Array<{ x: number; y: number; scale: number }>;
  key: string;
}

/**
 * Bake the whole vignette except the buildings you can enter. Everything is deterministic from the
 * settlement's own id, so a town looks the same every time you walk into it.
 */
export function townScene(scene: Phaser.Scene, set: ArchSet, seedKey: string, w: number, h: number,
  grand: number, coastal: boolean, slots: number): TownPlan {
  const key = `town2_${set}_${seedKey}_${slots}_${coastal ? 'c' : 'i'}_${w}x${h}`;
  const plan = layout(w, h, slots, seedKey, coastal);
  if (scene.textures.exists(key)) return { plots: plan, key };

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const p = groundOf(set);
  const rnd = mulberry32(hash(seedKey));

  // 1. the land, in bands from the far hills down to the near grass. Each band is an organic contour,
  //    not a straight line, so the ground reads as country rather than as a gradient.
  g.fillStyle(p.bands[0], 1).fillRect(0, 0, w, h);
  for (let i = 1; i < p.bands.length; i++) {
    const y = h * (0.10 + i * 0.20);
    g.fillStyle(p.bands[i], 1);
    contour(g, w, h, y, 16 + i * 5, rnd);
  }
  // a few soft rises, so the hillside has shape
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w, y = h * (0.16 + rnd() * 0.7), r = w * (0.06 + rnd() * 0.12);
    g.fillStyle(rnd() > 0.5 ? lite(p.bands[3], 0.35) : dark(p.bands[2], 0.2), 0.28);
    g.fillEllipse(x, y, r * 2, r * 0.8);
  }

  // 2. water down one edge, if this place has any
  if (coastal) {
    g.fillStyle(dark(p.water, 0.35), 1);
    waterEdge(g, w, h, 0);
    g.fillStyle(p.water, 1);
    waterEdge(g, w, h, h * 0.012);
    // the line of surf, and two boats drawn up on it
    g.fillStyle(lite(p.water, 0.8), 0.5);
    waterEdge(g, w, h, h * 0.012, true);
    for (let i = 0; i < 2; i++) boat(g, w * (0.07 + i * 0.10), h * (0.30 + i * 0.16), w * 0.05, rnd);
  }

  // 3. the paths: one along the near rank, one along the far, and a spur joining them
  const near = plan.filter((_q, i) => i % 2 === 1);
  const far = plan.filter((_q, i) => i % 2 === 0);
  const road = (pts: Array<[number, number]>) => {
    if (pts.length < 2) return;
    g.lineStyle(Math.max(9, h * 0.030), dark(p.path, 0.28), 0.85); path(g, pts);
    g.lineStyle(Math.max(6, h * 0.020), p.path, 0.95); path(g, pts);
    g.lineStyle(Math.max(2, h * 0.006), lite(p.path, 0.6), 0.5); path(g, pts);
  };
  road([[w * (coastal ? 0.18 : 0.01), h * 0.90], ...near.map(q => [q.x, q.y + h * 0.015] as [number, number]), [w * 1.01, h * 0.86]]);
  road([[w * (coastal ? 0.20 : 0.02), h * 0.60], ...far.map(q => [q.x, q.y + h * 0.015] as [number, number]), [w * 1.01, h * 0.56]]);
  if (near.length && far.length) road([[far[0].x, far[0].y + h * 0.02], [near[0].x, near[0].y - h * 0.02]]);
  const spine: Array<[number, number]> = plan.map(q => [q.x, q.y] as [number, number]);

  // 4. the town itself: small roofs clustered along the paths, none of them anything you can enter
  // 4. the town: roofs everywhere the big buildings are not, thicker where the paths run, drawn back
  //    to front so the near ones overlap the far ones the way a hillside view does
  const houses = Math.round(26 + grand * 44);
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < houses; i++) {
    const nearPath = rnd() < 0.6 && spine.length;
    const seg = nearPath ? spine[Math.floor(rnd() * spine.length)] : null;
    const x = seg ? Phaser.Math.Clamp(seg[0] + (rnd() - 0.5) * w * 0.22, w * (coastal ? 0.2 : 0.02), w * 0.98)
      : w * ((coastal ? 0.2 : 0.02) + rnd() * (coastal ? 0.78 : 0.96));
    const y = seg ? Phaser.Math.Clamp(seg[1] + (rnd() - 0.5) * h * 0.2, h * 0.30, h * 0.97)
      : h * (0.30 + rnd() * 0.67);
    spots.push([x, y, (h * 0.042) * (0.55 + (y / h) * 0.85)]);
  }
  spots.sort((a, b) => a[1] - b[1]);
  for (const [x, y, sz] of spots) hut(g, set, x, y, sz, p, rnd);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return { plots: plan, key };
}

/**
 * Where the buildings you can enter stand. TWO ranks, not one: the odd ones sit further up the slope,
 * smaller, and the even ones nearer and larger. That is what stops six big roofs from being a row of
 * six big roofs, and it gives every name plate somewhere to live that is not on top of another one.
 */
function layout(w: number, h: number, slots: number, seedKey: string, coastal: boolean): TownPlan['plots'] {
  const rnd = mulberry32(hash(seedKey) ^ 0x5bf03);
  const out: TownPlan['plots'] = [];
  // keep every plot clear of the edges HERE, so a building, its plate and its tap target never have
  // to be nudged apart from each other later
  const left = coastal ? 0.32 : 0.13, right = 0.87;
  const far = Math.ceil(slots / 2), near = slots - far;
  const place = (i: number, count: number, row: 0 | 1) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const inset = row === 0 ? 0.04 : 0;                       // the far rank is set in a little
    const x = w * (left + inset + t * (right - left - inset * 2));
    const y = h * (row === 0 ? 0.55 : 0.83) + (rnd() - 0.5) * h * 0.03;
    out.push({ x, y, scale: row === 0 ? 0.74 : 1 });
  };
  for (let i = 0; i < far; i++) place(i, far, 0);
  for (let i = 0; i < near; i++) place(i, near, 1);
  // interleave so the two ranks alternate left to right rather than splitting the list in half
  const woven: TownPlan['plots'] = [];
  for (let i = 0; i < slots; i++) woven.push(i % 2 === 0 ? out[Math.floor(i / 2)] : out[far + Math.floor(i / 2)]);
  return woven.filter(Boolean);
}

/** One band of ground, with a wandering edge. */
function contour(g: Phaser.GameObjects.Graphics, w: number, h: number, y: number, amp: number, rnd: () => number) {
  g.beginPath();
  g.moveTo(-4, h + 4);
  g.lineTo(-4, y);
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    g.lineTo(w * t, y + Math.sin(t * Math.PI * (2 + rnd() * 2)) * amp + (rnd() - 0.5) * amp * 0.6);
  }
  g.lineTo(w + 4, h + 4);
  g.closePath();
  g.fillPath();
}

/** The sea, down the left-hand side. */
function waterEdge(g: Phaser.GameObjects.Graphics, w: number, h: number, inset: number, lineOnly = false) {
  const pts: Array<[number, number]> = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([w * (0.10 + Math.sin(t * Math.PI * 1.6) * 0.05) + inset, h * t]);
  }
  if (lineOnly) {
    g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.lineStyle(Math.max(2, h * 0.006), 0xffffff, 0.35);
    g.strokePath();
    return;
  }
  g.beginPath();
  g.moveTo(-4, -4);
  pts.forEach(q => g.lineTo(q[0], q[1]));
  g.lineTo(-4, h + 4);
  g.closePath();
  g.fillPath();
}

function boat(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rnd: () => number) {
  g.fillStyle(0x6b4a2b, 1);
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x + s, y);
  g.lineTo(x + s * 0.6, y + s * 0.42);
  g.lineTo(x - s * 0.6, y + s * 0.42);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x8a6a44, 1).fillRect(x - s * 0.06, y - s * (0.7 + rnd() * 0.4), s * 0.12, s * 0.8);
}

/** A house too small to enter: a roof, and the hint of a wall under it. */
function hut(g: Phaser.GameObjects.Graphics, set: ArchSet, x: number, y: number, s: number,
  p: { roof: number; wall: number }, rnd: () => number) {
  g.fillStyle(0x000000, 0.14).fillEllipse(x, y + s * 0.16, s * 1.5, s * 0.42);
  g.fillStyle(dark(p.wall, 0.25), 1).fillRect(x - s * 0.6, y - s * 0.34, s * 1.2, s * 0.5);
  g.fillStyle(p.wall, 1).fillRect(x - s * 0.55, y - s * 0.34, s * 1.05, s * 0.46);
  const r = rnd();
  if (set === 'yurt') {
    g.fillStyle(p.wall, 1).fillEllipse(x, y - s * 0.2, s * 1.35, s * 0.9);
    g.fillStyle(p.roof, 1);
    g.beginPath(); g.arc(x, y - s * 0.34, s * 0.68, Math.PI, 0); g.fillPath();
  } else if (set === 'adobe') {
    g.fillStyle(p.roof, 1).fillRect(x - s * 0.68, y - s * 0.62, s * 1.36, s * 0.3);
  } else if (set === 'pagoda') {
    g.fillStyle(p.roof, 1);
    g.beginPath();
    g.moveTo(x - s * 0.85, y - s * 0.3); g.lineTo(x, y - s * 0.95); g.lineTo(x + s * 0.85, y - s * 0.3);
    g.lineTo(x + s * 0.6, y - s * 0.42); g.lineTo(x, y - s * 0.72); g.lineTo(x - s * 0.6, y - s * 0.42);
    g.closePath(); g.fillPath();
  } else {
    g.fillStyle(p.roof, 1);
    g.fillTriangle(x - s * (0.75 + r * 0.1), y - s * 0.3, x + s * (0.75 + r * 0.1), y - s * 0.3, x, y - s * (0.9 + r * 0.2));
  }
}

function path(g: Phaser.GameObjects.Graphics, pts: Array<[number, number]>) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    g.lineTo((px + cx) / 2, (py + cy) / 2 + 8);
    g.lineTo(cx, cy);
  }
  g.strokePath();
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * A building you can walk into, drawn LARGE and at three-quarters: a roof plane you can see the top
 * of, a lit wall facing you and a shadowed one turned away. This is the shape that makes a town read
 * as something you are looking DOWN on rather than standing in front of.
 */
export function landmark(scene: Phaser.Scene, set: ArchSet, kind: string, w: number, h: number, seed: number) {
  const key = `lm_${set}_${kind}_${Math.round(w)}x${Math.round(h)}_${seed}`;
  if (scene.textures.exists(key)) return key;
  const p = groundOf(set);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = w / 2, base = h * 0.94;
  const bw = w * 0.72, bh = h * 0.34, depth = w * 0.2;

  g.fillStyle(0x000000, 0.2).fillEllipse(cx, base + h * 0.01, bw * 1.25, h * 0.09);

  // the two wall faces
  g.fillStyle(dark(p.wall, 0.45), 1);
  g.beginPath();
  g.moveTo(cx + bw / 2, base - bh); g.lineTo(cx + bw / 2 + depth, base - bh - depth * 0.42);
  g.lineTo(cx + bw / 2 + depth, base - depth * 0.42); g.lineTo(cx + bw / 2, base);
  g.closePath(); g.fillPath();
  g.fillStyle(p.wall, 1).fillRect(cx - bw / 2, base - bh, bw, bh);
  g.fillStyle(lite(p.wall, 0.5), 0.22).fillRect(cx - bw / 2, base - bh, bw * 0.3, bh);

  roof(g, set, cx, base - bh, bw, h, depth, p);

  // the door, so it reads as somewhere you go in
  g.fillStyle(dark(p.wall, 0.75), 1).fillRect(cx - bw * 0.1, base - bh * 0.52, bw * 0.2, bh * 0.52);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return key;
}

function roof(g: Phaser.GameObjects.Graphics, set: ArchSet, cx: number, top: number, bw: number, h: number,
  depth: number, p: { roof: number; wall: number }) {
  const eave = bw * 0.10;
  switch (set) {
    case 'classical': {
      // a pediment facing you and a tiled slope running back
      g.fillStyle(dark(p.roof, 0.4), 1);
      g.beginPath();
      g.moveTo(cx + bw / 2 + eave, top); g.lineTo(cx + bw / 2 + eave + depth, top - depth * 0.42);
      g.lineTo(cx + depth, top - h * 0.2 - depth * 0.42); g.lineTo(cx, top - h * 0.2);
      g.closePath(); g.fillPath();
      g.fillStyle(p.roof, 1).fillTriangle(cx - bw / 2 - eave, top, cx + bw / 2 + eave, top, cx, top - h * 0.2);
      g.fillStyle(lite(p.wall, 0.6), 1);
      for (let i = -2; i <= 2; i++) g.fillRect(cx + i * bw * 0.2 - bw * 0.035, top, bw * 0.07, h * 0.3);
      break;
    }
    case 'pagoda': {
      let y = top, w2 = bw + eave * 2;
      for (let i = 0; i < 3; i++) {
        g.fillStyle(i % 2 ? dark(p.roof, 0.25) : p.roof, 1);
        g.beginPath();
        g.moveTo(cx - w2 / 2, y); g.lineTo(cx, y - h * 0.10); g.lineTo(cx + w2 / 2, y);
        g.lineTo(cx + w2 / 2 + depth * 0.5, y - depth * 0.24); g.lineTo(cx, y - h * 0.10 - depth * 0.24);
        g.lineTo(cx - w2 / 2 + depth * 0.5, y - depth * 0.24);
        g.closePath(); g.fillPath();
        y -= h * 0.11; w2 *= 0.82;
      }
      break;
    }
    case 'dome': {
      g.fillStyle(dark(p.roof, 0.35), 1).fillEllipse(cx + depth * 0.3, top - depth * 0.2, bw * 0.92, h * 0.36);
      g.fillStyle(p.roof, 1).fillEllipse(cx, top - h * 0.02, bw * 0.88, h * 0.34);
      g.fillStyle(lite(p.roof, 0.6), 0.35).fillEllipse(cx - bw * 0.18, top - h * 0.08, bw * 0.3, h * 0.12);
      break;
    }
    case 'longhouse': {
      g.fillStyle(dark(p.roof, 0.4), 1);
      g.beginPath();
      g.moveTo(cx + bw / 2 + eave, top); g.lineTo(cx + bw / 2 + eave + depth, top - depth * 0.42);
      g.lineTo(cx + depth, top - h * 0.28 - depth * 0.42); g.lineTo(cx, top - h * 0.28);
      g.closePath(); g.fillPath();
      g.fillStyle(p.roof, 1).fillTriangle(cx - bw / 2 - eave, top, cx + bw / 2 + eave, top, cx, top - h * 0.28);
      break;
    }
    case 'yurt': {
      g.fillStyle(p.roof, 1);
      g.beginPath(); g.arc(cx, top + h * 0.02, bw * 0.62, Math.PI, 0); g.fillPath();
      g.fillStyle(dark(p.roof, 0.3), 1).fillEllipse(cx, top - bw * 0.6, bw * 0.22, h * 0.05);
      break;
    }
    case 'adobe': {
      g.fillStyle(dark(p.roof, 0.3), 1);
      g.beginPath();
      g.moveTo(cx - bw / 2 - eave, top); g.lineTo(cx + bw / 2 + eave, top);
      g.lineTo(cx + bw / 2 + eave + depth, top - depth * 0.42); g.lineTo(cx - bw / 2 - eave + depth, top - depth * 0.42);
      g.closePath(); g.fillPath();
      g.fillStyle(p.roof, 1).fillRect(cx - bw * 0.34, top - h * 0.13, bw * 0.68, h * 0.13);
      break;
    }
    default: {
      g.fillStyle(dark(p.roof, 0.4), 1);
      g.beginPath();
      g.moveTo(cx + bw / 2 + eave, top); g.lineTo(cx + bw / 2 + eave + depth, top - depth * 0.42);
      g.lineTo(cx + depth, top - h * 0.2 - depth * 0.42); g.lineTo(cx, top - h * 0.2);
      g.closePath(); g.fillPath();
      g.fillStyle(p.roof, 1).fillTriangle(cx - bw / 2 - eave, top, cx + bw / 2 + eave, top, cx, top - h * 0.2);
      break;
    }
  }
}

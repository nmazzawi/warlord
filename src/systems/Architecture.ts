// Architecture.ts — a settlement drawn instead of listed. Every culture builds differently, and the
// silhouette is the whole point: a tiered roof with upturned eaves is Japan before you have read a
// word of it, and a stepped stone platform is not a longhouse. Seven sets cover fourteen countries,
// because neighbours really did build alike, and each one is composed from the same parts so a
// village and a capital of the same culture are recognisably the same people at different scales.
import Phaser from 'phaser';
import { mulberry32 } from '../utils/rng';

export type ArchSet = 'classical' | 'pagoda' | 'dome' | 'longhouse' | 'yurt' | 'adobe' | 'timber';

/** Which country builds which way. */
export const ARCH_OF: Record<string, ArchSet> = {
  rome: 'classical', greece: 'classical',
  japan: 'pagoda', china: 'pagoda',
  arabia: 'dome', persia: 'dome', india: 'dome',
  viking: 'longhouse', rus: 'longhouse',
  mongolia: 'yurt', steppe: 'yurt',
  egypt: 'adobe', kush: 'adobe', aztecs: 'adobe', inca: 'adobe',
  homeland: 'timber',
};

/** The colours each set is built out of: wall, roof, trim, and the ground it stands on. */
const PALETTE: Record<ArchSet, { wall: number; roof: number; trim: number; ground: number; sky: number }> = {
  classical: { wall: 0xe8dfc8, roof: 0xb4553f, trim: 0xd8c08a, ground: 0xbfae86, sky: 0x8fa9bd },
  pagoda:    { wall: 0xd9cbb0, roof: 0x6e5560, trim: 0xb4443a, ground: 0x8a9a72, sky: 0x9db4c0 },
  dome:      { wall: 0xe3d3a8, roof: 0x3f7f86, trim: 0xd8b45a, ground: 0xd0b483, sky: 0xc9b98d },
  longhouse: { wall: 0x7a5a3a, roof: 0x5f7247, trim: 0x9a7a4a, ground: 0x6f7a52, sky: 0x9aa8b4 },
  yurt:      { wall: 0xe0d6c0, roof: 0xb9a882, trim: 0x8a5a3a, ground: 0x9aa46a, sky: 0xa8bcc8 },
  adobe:     { wall: 0xd9b482, roof: 0xbf9060, trim: 0xc4703a, ground: 0xc8a877, sky: 0xd8c898 },
  timber:    { wall: 0x8a6a44, roof: 0x5a4a30, trim: 0xa88a55, ground: 0x7a7050, sky: 0x8f9aa8 },
};

const dark = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).darken(Math.round(k * 45)).color;
const lite = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).lighten(Math.round(k * 40)).color;

export function archOf(territory: string): ArchSet { return ARCH_OF[territory] ?? 'timber'; }
export function paletteOf(set: ArchSet) { return PALETTE[set]; }

/**
 * The backdrop: sky, a far skyline of this culture's own roofs, and the ground the buildings stand on.
 * Baked once per settlement per size, because it never changes while you are looking at it.
 */
export function backdrop(scene: Phaser.Scene, set: ArchSet, seedKey: string, w: number, h: number, grand: number) {
  const key = `town_${set}_${seedKey}_${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const p = PALETTE[set];
  const rnd = mulberry32(hash(seedKey));
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const horizon = h * 0.46;

  // sky, graded down to the haze at the horizon
  g.fillStyle(dark(p.sky, 0.35), 1).fillRect(0, 0, w, horizon);
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    g.fillStyle(lite(p.sky, t * 0.9), 0.09).fillRect(0, horizon * (0.35 + t * 0.65), w, horizon * 0.06);
  }
  // the far skyline: the same roofs, small and hazy, so the place has a size
  for (let i = 0; i < 22 + Math.round(grand * 10); i++) {
    const bw = w * (0.05 + rnd() * 0.07), bh = horizon * (0.10 + rnd() * (0.16 + grand * 0.2));
    const x = rnd() * (w + bw) - bw / 2, y = horizon - bh;
    g.fillStyle(dark(p.wall, 0.55), 0.5);
    silhouette(g, set, x, y, bw, bh, rnd);
  }
  // ground
  g.fillStyle(p.ground, 1).fillRect(0, horizon, w, h - horizon);
  g.fillStyle(dark(p.ground, 0.3), 0.5).fillRect(0, horizon, w, h * 0.012);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * w, y = horizon + rnd() * (h - horizon);
    g.fillStyle(rnd() > 0.5 ? lite(p.ground, 0.4) : dark(p.ground, 0.35), 0.22);
    g.fillEllipse(x, y, 8 + rnd() * 26, 3 + rnd() * 7);
  }
  // a swept road across the front, where the buildings face
  g.fillStyle(dark(p.ground, 0.18), 0.55).fillRect(0, h * 0.74, w, h * 0.12);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** One building, drawn at whatever size the plot allows. Returns the texture key. */
export function building(scene: Phaser.Scene, set: ArchSet, kind: string, w: number, h: number, seed: number) {
  const key = `bld_${set}_${kind}_${Math.round(w)}x${Math.round(h)}_${seed}`;
  if (scene.textures.exists(key)) return key;
  const p = PALETTE[set];
  const rnd = mulberry32(seed * 977 + hash(kind));
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // a shadow on the ground so it stands ON something
  g.fillStyle(0x000000, 0.18).fillEllipse(w / 2, h - h * 0.03, w * 0.86, h * 0.09);
  body(g, set, p, w, h, rnd);
  sign(g, p, kind, w, h);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return key;
}

/** The mass of a building in this set — the part that reads at a glance. */
function body(g: Phaser.GameObjects.Graphics, set: ArchSet, p: { wall: number; roof: number; trim: number }, w: number, h: number, rnd: () => number) {
  const bw = w * 0.9, bx = (w - bw) / 2, base = h * 0.94;
  switch (set) {
    case 'classical': {
      const bh = h * 0.52, top = base - bh;
      g.fillStyle(dark(p.wall, 0.35), 1).fillRect(bx, top, bw, bh);
      g.fillStyle(p.wall, 1).fillRect(bx + bw * 0.03, top, bw * 0.94, bh);
      const cols = 4 + Math.floor(rnd() * 3);
      g.fillStyle(lite(p.wall, 0.5), 1);
      for (let i = 0; i < cols; i++) {
        const cw = bw * 0.09, cx = bx + bw * 0.08 + i * ((bw * 0.84 - cw) / (cols - 1));
        g.fillRect(cx, top + h * 0.03, cw, bh - h * 0.03);
        g.fillStyle(dark(p.wall, 0.2), 1).fillRect(cx, top + h * 0.03, cw * 0.25, bh - h * 0.03);
        g.fillStyle(lite(p.wall, 0.5), 1);
      }
      // pediment
      g.fillStyle(p.roof, 1).fillTriangle(bx - bw * 0.04, top, bx + bw + bw * 0.04, top, bx + bw / 2, top - h * 0.20);
      g.fillStyle(dark(p.roof, 0.4), 1).fillRect(bx - bw * 0.04, top - h * 0.01, bw * 1.08, h * 0.035);
      g.fillStyle(p.trim, 1).fillRect(bx + bw * 0.4, base - bh * 0.5, bw * 0.2, bh * 0.5);
      break;
    }
    case 'pagoda': {
      const tiers = 2 + Math.floor(rnd() * 2);
      let y = base, tw = bw;
      g.fillStyle(dark(p.wall, 0.3), 1).fillRect(bx, base - h * 0.4, bw, h * 0.4);
      g.fillStyle(p.wall, 1).fillRect(bx + bw * 0.04, base - h * 0.4, bw * 0.92, h * 0.4);
      y = base - h * 0.4;
      for (let i = 0; i < tiers; i++) {
        const rw = tw * (1.12 - i * 0.06), rx = w / 2 - rw / 2, rh = h * 0.16;
        // upturned eaves: the curve is the whole signature
        g.fillStyle(dark(p.roof, 0.35), 1);
        g.beginPath();
        g.moveTo(rx - rw * 0.06, y + rh * 0.55);
        g.lineTo(w / 2, y - rh * 0.75);
        g.lineTo(rx + rw + rw * 0.06, y + rh * 0.55);
        g.lineTo(rx + rw * 0.9, y + rh * 0.2);
        g.lineTo(w / 2, y - rh * 0.3);
        g.lineTo(rx + rw * 0.1, y + rh * 0.2);
        g.closePath();
        g.fillPath();
        y -= h * 0.085;              // the tiers OVERLAP; a gap between them is not a roof
        tw *= 0.88;
      }
      g.fillStyle(p.trim, 1).fillRect(w / 2 - bw * 0.06, base - h * 0.22, bw * 0.12, h * 0.22);
      break;
    }
    case 'dome': {
      const bh = h * 0.44, top = base - bh;
      g.fillStyle(dark(p.wall, 0.3), 1).fillRect(bx, top, bw, bh);
      g.fillStyle(p.wall, 1).fillRect(bx + bw * 0.04, top, bw * 0.92, bh);
      g.fillStyle(p.roof, 1).fillEllipse(w / 2, top, bw * 0.78, h * 0.38);
      g.fillStyle(lite(p.roof, 0.4), 0.4).fillEllipse(w / 2 - bw * 0.12, top - h * 0.06, bw * 0.28, h * 0.12);
      g.fillStyle(p.trim, 1).fillRect(w / 2 - bw * 0.012, top - h * 0.24, bw * 0.024, h * 0.09);
      // a horseshoe arch for a door
      g.fillStyle(dark(p.wall, 0.6), 1);
      g.fillRect(w / 2 - bw * 0.1, base - bh * 0.55, bw * 0.2, bh * 0.55);
      g.fillEllipse(w / 2, base - bh * 0.55, bw * 0.2, bh * 0.3);
      break;
    }
    case 'longhouse': {
      const bh = h * 0.34, top = base - bh;
      g.fillStyle(dark(p.wall, 0.35), 1).fillRect(bx, top, bw, bh);
      g.fillStyle(p.wall, 1).fillRect(bx + bw * 0.03, top, bw * 0.94, bh);
      // a steep turf roof running the length of it
      g.fillStyle(dark(p.roof, 0.4), 1);
      g.fillTriangle(bx - bw * 0.05, top + h * 0.02, bx + bw + bw * 0.05, top + h * 0.02, w / 2, top - h * 0.30);
      g.fillStyle(p.roof, 1);
      g.fillTriangle(bx - bw * 0.02, top + h * 0.02, bx + bw + bw * 0.02, top + h * 0.02, w / 2, top - h * 0.26);
      // crossed gable beams
      g.lineStyle(Math.max(2, w * 0.02), p.trim, 1);
      g.lineBetween(w / 2 - bw * 0.14, top - h * 0.20, w / 2 + bw * 0.06, top - h * 0.34);
      g.lineBetween(w / 2 + bw * 0.14, top - h * 0.20, w / 2 - bw * 0.06, top - h * 0.34);
      break;
    }
    case 'yurt': {
      const r = bw * 0.46, cy = base - r * 0.62;
      g.fillStyle(dark(p.wall, 0.3), 1).fillEllipse(w / 2, cy + r * 0.5, r * 2.1, r * 1.5);
      g.fillStyle(p.wall, 1).fillEllipse(w / 2, cy + r * 0.45, r * 2, r * 1.4);
      g.fillStyle(p.roof, 1);
      g.beginPath();
      g.arc(w / 2, cy + r * 0.1, r, Math.PI, 0);
      g.fillPath();
      g.fillStyle(p.trim, 1).fillEllipse(w / 2, cy - r * 0.86, r * 0.34, r * 0.16);
      g.fillStyle(dark(p.wall, 0.6), 1).fillRect(w / 2 - r * 0.2, base - r * 0.9, r * 0.4, r * 0.9);
      break;
    }
    case 'adobe': {
      // stepped mudbrick: three shrinking blocks
      let bwv = bw, y = base;
      for (let i = 0; i < 3; i++) {
        const bh = h * (0.20 - i * 0.03);
        g.fillStyle(dark(p.wall, 0.28 + i * 0.06), 1).fillRect(w / 2 - bwv / 2, y - bh, bwv, bh);
        g.fillStyle(i === 0 ? p.wall : lite(p.wall, 0.15 * i), 1).fillRect(w / 2 - bwv / 2 + bwv * 0.03, y - bh, bwv * 0.94, bh * 0.94);
        y -= bh;
        bwv *= 0.76;
      }
      g.fillStyle(p.trim, 1).fillRect(w / 2 - bw * 0.06, y - h * 0.06, bw * 0.12, h * 0.06);
      g.fillStyle(dark(p.wall, 0.65), 1).fillRect(w / 2 - bw * 0.09, base - h * 0.14, bw * 0.18, h * 0.14);
      break;
    }
    default: {  // timber
      const bh = h * 0.40, top = base - bh;
      g.fillStyle(dark(p.wall, 0.35), 1).fillRect(bx, top, bw, bh);
      g.fillStyle(p.wall, 1).fillRect(bx + bw * 0.04, top, bw * 0.92, bh);
      g.fillStyle(dark(p.wall, 0.15), 0.5);
      for (let i = 1; i < 5; i++) g.fillRect(bx + bw * 0.04, top + (bh / 5) * i, bw * 0.92, Math.max(1, h * 0.006));
      g.fillStyle(p.roof, 1).fillTriangle(bx - bw * 0.06, top, bx + bw + bw * 0.06, top, w / 2, top - h * 0.22);
      g.fillStyle(dark(p.wall, 0.7), 1).fillRect(w / 2 - bw * 0.09, base - bh * 0.6, bw * 0.18, bh * 0.6);
      break;
    }
  }
}

/** A hanging board over the door, so you know what you are walking into. */
function sign(g: Phaser.GameObjects.Graphics, p: { trim: number }, kind: string, w: number, h: number) {
  // a small board hung beside the door, not a banner across the front of the house
  const sw = w * 0.2, sh = h * 0.048, x = w / 2 + w * 0.16, y = h * 0.80 - sh;
  g.fillStyle(0x2b2118, 0.35).fillRoundedRect(x - 1, y + 1, sw + 2, sh + 2, sh * 0.3);
  g.fillStyle(lite(p.trim, 0.55), 1).fillRoundedRect(x, y, sw, sh, sh * 0.3);
  // a mark on the board, different per trade — read as a glyph, not as letters
  g.fillStyle(0x2b2118, 0.85);
  const cx = x + sw / 2, cy = y + sh / 2, m = sh * 0.32;
  if (kind === 'forge') { g.fillRect(cx - m, cy - m * 0.25, m * 1.4, m * 0.5); g.fillRect(cx + m * 0.4, cy - m, m * 0.6, m * 2); }
  else if (kind === 'barracks') { g.fillRect(cx - m * 0.15, cy - m, m * 0.3, m * 2); g.fillRect(cx - m, cy - m * 0.3, m * 2, m * 0.35); }
  else if (kind === 'stables') { g.fillEllipse(cx, cy, m * 1.8, m * 1.1); g.fillRect(cx + m * 0.5, cy - m, m * 0.4, m); }
  else if (kind === 'inn') { g.fillRect(cx - m * 0.7, cy - m * 0.8, m * 1.4, m * 1.4); g.fillRect(cx + m * 0.6, cy - m * 0.3, m * 0.5, m * 0.6); }
  else if (kind === 'market') { g.fillTriangle(cx - m * 1.1, cy + m * 0.5, cx + m * 1.1, cy + m * 0.5, cx, cy - m); }
  else if (kind === 'harbor') { g.fillRect(cx - m * 0.12, cy - m, m * 0.24, m * 1.8); g.fillRect(cx - m * 0.8, cy - m * 0.5, m * 1.6, m * 0.24); }
  else g.fillCircle(cx, cy, m * 0.8);
}

/** The same roofs again, far off and flat: enough shape to say which country this is. */
function silhouette(g: Phaser.GameObjects.Graphics, set: ArchSet, x: number, y: number, w: number, h: number, rnd: () => number) {
  switch (set) {
    case 'classical':
      g.fillRect(x, y + h * 0.25, w, h * 0.75);
      g.fillTriangle(x - w * 0.06, y + h * 0.25, x + w + w * 0.06, y + h * 0.25, x + w / 2, y);
      break;
    case 'pagoda':
      g.fillRect(x + w * 0.18, y + h * 0.45, w * 0.64, h * 0.55);
      for (let i = 0; i < 3; i++) {
        const rw = w * (1 - i * 0.16), ry = y + h * (0.42 - i * 0.16);
        g.fillTriangle(x + (w - rw) / 2 - rw * 0.08, ry, x + (w + rw) / 2 + rw * 0.08, ry, x + w / 2, ry - h * 0.14);
      }
      break;
    case 'dome':
      g.fillRect(x, y + h * 0.4, w, h * 0.6);
      g.fillEllipse(x + w / 2, y + h * 0.42, w * 0.86, h * 0.7);
      if (rnd() > 0.5) g.fillRect(x + w * 0.86, y - h * 0.4, w * 0.1, h * 1.4);
      break;
    case 'longhouse':
      g.fillRect(x, y + h * 0.55, w, h * 0.45);
      g.fillTriangle(x - w * 0.05, y + h * 0.55, x + w + w * 0.05, y + h * 0.55, x + w / 2, y);
      break;
    case 'yurt':
      g.fillEllipse(x + w / 2, y + h * 0.8, w, h * 0.7);
      g.fillTriangle(x, y + h * 0.6, x + w, y + h * 0.6, x + w / 2, y + h * 0.1);
      break;
    case 'adobe': {
      let bw = w, yy = y + h;
      for (let i = 0; i < 3; i++) { const bh = h * (0.34 - i * 0.06); g.fillRect(x + (w - bw) / 2, yy - bh, bw, bh); yy -= bh; bw *= 0.72; }
      break;
    }
    default:
      g.fillRect(x, y + h * 0.4, w, h * 0.6);
      g.fillTriangle(x - w * 0.06, y + h * 0.4, x + w + w * 0.06, y + h * 0.4, x + w / 2, y);
      break;
  }
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

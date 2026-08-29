// ChartPainter.ts — paints the world chart into a canvas, for ONE view: a rectangle of the world at a
// given number of pixels per world unit. That is the whole trick behind a chart that stays sharp: the
// map is not one bitmap that gets magnified, it is re-drawn at whatever zoom you are looking at it from.
// Everything here is measured in screen pixels and converted, so a coastline is two pixels of ink at the
// world view and two pixels of ink when you are down among the villages — it just follows a finer line.
import Phaser from 'phaser';
import { mulberry32 } from '../utils/rng';
import { COASTS, COVER, EXTRA_CREATURES, RANGES, RIVERS, SEAS, TRADE_LANES } from './AtlasData';
import { bbox, COMPASS, pointInPoly, REGIONS, SEA_CREATURES, SEA_ROUTES, type Pt, type Region } from './WorldChart';
import { CHART, ll } from './geo';

export interface View {
  /** The world rectangle being drawn. */
  x: number; y: number; w: number; h: number;
  /** Pixels per world unit — i.e. how magnified this view is. */
  scale: number;
}

export const SEA = 0xa6bcb6, SEA_DEEP = 0x8ea8a4, PARCH = 0xe4d3ad, INK = 0x3a2a18;
const FOG = 0x8a7346, RIVER_INK = 0x4f7d86;
const RHUMB_HUBS: Array<[number, number]> = [[-35, 20], [-28, -26], [72, -8], [138, -14], [-95, 40]];

export const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

// ---------------------------------------------------------------- geometry, jittered once and cached
/** Jitter a ring so it looks inked by hand, keeping every real cape exactly where it belongs. Cached,
 *  so every view draws the SAME coastline — otherwise the detail layer would shimmer against the base. */
const inkCache = new Map<string, Pt[]>();
function inked(key: string, pts: Pt[], amp: number, seed: number): Pt[] {
  const hit = inkCache.get(key);
  if (hit) return hit;
  const rnd = mulberry32(seed);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    out.push([ax + (rnd() - 0.5) * amp, ay + (rnd() - 0.5) * amp]);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.min(6, Math.floor(len / 45));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t + (rnd() - 0.5) * amp * 1.8, ay + (by - ay) * t + (rnd() - 0.5) * amp * 1.8]);
    }
  }
  inkCache.set(key, out);
  return out;
}
const coastRings = () => COASTS.map(c => inked(`coast:${c.id}`, c.pts, 2.4, 777));
const regionRing = (r: Region) => inked(`realm:${r.id}`, r.poly, 7, 9);
const seaRings = () => SEAS.map(s => inked(`sea:${s.id}`, s.pts, 2, 5));

const shoelace = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
};
/** Every coastline is wound the same way; a ring wound the other way SUBTRACTS under the nonzero rule,
 *  which is how the fog gets its holes. Reversing blindly would be a coin toss, so measure it. */
const holeCache = new Map<string, Pt[]>();
function hole(key: string, pts: Pt[]): Pt[] {
  let h = holeCache.get(key);
  if (!h) { h = shoelace(pts) > 0 ? [...pts].reverse() : pts; holeCache.set(key, h); }
  return h;
}

/** A river drawn straight between its named towns is a zigzag; a river wants to meander. Catmull-Rom
 *  through the real points gives a course that still passes through every one of them. */
const smoothCache = new Map<string, Pt[]>();
function smooth(key: string, pts: Pt[], per = 6): Pt[] {
  const hit = smoothCache.get(key);
  if (hit) return hit;
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], [x2, y2] = p[i + 1], [x3, y3] = p[i + 2];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  smoothCache.set(key, out);
  return out;
}

/** Scatter points for ground cover: one deterministic cloud per area, drawn a few at a time when you
 *  are far away and more and more of them as you come down, so the density on screen stays even. */
const scatterCache = new Map<string, Pt[]>();
function scatter(key: string, poly: Pt[], want: number): Pt[] {
  const hit = scatterCache.get(key);
  if (hit) return hit;
  const b = bbox(poly);
  const rnd = mulberry32(key.length * 7919 + poly.length);
  const out: Pt[] = [];
  for (let i = 0; i < want * 40 && out.length < want; i++) {
    const x = b.x0 + rnd() * b.w, y = b.y0 + rnd() * b.h;
    if (pointInPoly(x, y, poly)) out.push([x, y]);
  }
  scatterCache.set(key, out);
  return out;
}

const boxCache = new Map<string, ReturnType<typeof bbox>>();
function box(key: string, pts: Pt[]) {
  let b = boxCache.get(key);
  if (!b) { b = bbox(pts); boxCache.set(key, b); }
  return b;
}
const hits = (b: { x0: number; y0: number; x1: number; y1: number }, v: View, pad = 0) =>
  b.x1 >= v.x - pad && b.x0 <= v.x + v.w + pad && b.y1 >= v.y - pad && b.y0 <= v.y + v.h + pad;

// ---------------------------------------------------------------- painting
function trace(ctx: CanvasRenderingContext2D, pts: Pt[], close = true) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
function mix(a: number, b: number, t: number) {
  const ca = Phaser.Display.Color.ValueToColor(a), cb = Phaser.Display.Color.ValueToColor(b);
  return Phaser.Display.Color.GetColor(
    Math.round(ca.red + (cb.red - ca.red) * t), Math.round(ca.green + (cb.green - ca.green) * t), Math.round(ca.blue + (cb.blue - ca.blue) * t));
}

/**
 * Paint one view of the chart. `ctx` must be sized to `view.w * view.scale` by `view.h * view.scale`.
 * Every width and spacing below is written in SCREEN pixels and divided by the scale, which is what
 * keeps the ink the same weight however far in you are — and lets borders thin down onto the terrain.
 */
export function paintChart(ctx: CanvasRenderingContext2D, view: View) {
  const s = view.scale;
  const px = (n: number) => n / s;                  // n screen pixels, in world units
  const rnd = mulberry32(777);
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. the sea, its deeps, its hatching and a portolan's rhumb lines
  ctx.fillStyle = css(SEA);
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = css(SEA_DEEP, 0.16);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * CHART.w, y = rnd() * CHART.h, rx = 100 + rnd() * 420, ry = 50 + rnd() * 220, rot = rnd() * 3;
    if (x + rx < view.x || x - rx > view.x + view.w || y + ry < view.y || y - ry > view.y + view.h) continue;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  const hatch = px(9);                              // the hatch keeps its spacing on screen
  ctx.strokeStyle = css(INK, 0.11);
  ctx.lineWidth = px(0.8);
  ctx.beginPath();
  for (let y = Math.floor(view.y / hatch) * hatch; y < view.y + view.h; y += hatch) {
    const row = Math.round(y / hatch);
    for (let x = Math.floor(view.x / (hatch * 4)) * hatch * 4 + (row % 2 ? hatch * 2 : 0); x < view.x + view.w; x += hatch * 4) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + hatch * 1.5, y + px(0.8));
    }
  }
  ctx.stroke();
  ctx.strokeStyle = css(INK, 0.05);
  ctx.lineWidth = px(0.7);
  ctx.beginPath();
  for (const [lon, lat] of RHUMB_HUBS) {
    const [hx, hy] = ll(lon, lat);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(a) * 2400, hy + Math.sin(a) * 2400);
    }
  }
  ctx.stroke();

  // 2. the land
  const coasts = coastRings();
  const near = coasts.filter((pts, i) => hits(box(`coast:${COASTS[i].id}`, pts), view, 40));
  const landPath = (c: CanvasRenderingContext2D) => { c.beginPath(); for (const pts of near) trace(c, pts); };
  // the shallows: two soft bands of darker water hugging every coast, which is what makes a strait
  // read as a strait and the Red Sea read as sea rather than as a gap between two countries
  ctx.strokeStyle = css(SEA_DEEP, 0.16);
  ctx.lineWidth = px(9);
  landPath(ctx);
  ctx.stroke();
  ctx.strokeStyle = css(SEA_DEEP, 0.26);
  ctx.lineWidth = px(3.5);
  landPath(ctx);
  ctx.stroke();
  landPath(ctx);
  ctx.fillStyle = css(PARCH);
  ctx.fill();

  // 3. terra incognita — land, minus every realm's claim. Two clips, not one: first the land, then
  //    everything outside the realms. Doing it in a single winding path counts a strait where two
  //    realms both overshoot the water (the Red Sea) as land, and fogs the sea.
  ctx.save();
  landPath(ctx);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(view.x - 1, view.y - 1, view.w + 2, view.h + 2);
  for (const r of REGIONS) {
    const ring = regionRing(r);
    if (!hits(box(`realm:${r.id}`, ring), view, 40)) continue;
    trace(ctx, hole(`hole:${r.id}`, ring));
  }
  ctx.clip();
  ctx.fillStyle = css(FOG, 0.4);
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = css(0x6b5a38, 0.14);
  const grit = px(3.2), stride = px(26);
  for (let y = Math.floor(view.y / stride) * stride; y < view.y + view.h; y += stride) {
    for (let x = Math.floor(view.x / stride) * stride; x < view.x + view.w; x += stride) {
      const j = ((Math.round(x / stride) * 73856093) ^ (Math.round(y / stride) * 19349663)) >>> 0;
      ctx.fillRect(x + ((j >>> 4) % 17) * grit * 0.4, y + ((j >>> 9) % 17) * grit * 0.4, grit, grit);
    }
  }
  ctx.restore();

  // 4. the realms, clipped inside the coast — which is what makes a border trace a coastline
  ctx.save();
  landPath(ctx);
  ctx.clip();
  for (const r of REGIONS) {
    const ring = regionRing(r);
    if (!hits(box(`realm:${r.id}`, ring), view, 40)) continue;
    ctx.fillStyle = css(mix(PARCH, r.tint, r.enterable ? 0.88 : 0.76), r.enterable ? 0.9 : 0.84);
    ctx.beginPath();
    trace(ctx, ring);
    ctx.fill();
  }
  ctx.restore();

  // 5. the geography under everyone's feet: ground cover, rivers, the crests of the ranges
  ctx.save();
  landPath(ctx);
  ctx.clip();
  for (const c of COVER) {
    const b = box(`cover:${c.name}`, c.pts);
    if (!hits(b, view)) continue;
    groundCover(ctx, c, view, px);
  }
  for (const r of RIVERS) {
    const line = smooth(`river:${r.name}`, r.pts, s > 0.6 ? 10 : 4);
    if (!hits(box(`river:${r.name}`, r.pts), view, 30)) continue;
    river(ctx, line, r.size, px);
  }
  for (const r of RANGES) {
    if (!hits(box(`range:${r.name}`, r.pts), view, 60)) continue;
    range(ctx, r, px);
  }
  ctx.restore();

  // 6. the borders, thinning as you come down so they hug the ground instead of smothering it
  ctx.save();
  landPath(ctx);
  ctx.clip();
  for (const r of REGIONS) {
    const ring = regionRing(r);
    if (!hits(box(`realm:${r.id}`, ring), view, 40)) continue;
    ctx.beginPath();
    trace(ctx, ring);
    ctx.strokeStyle = css(INK, r.enterable ? 0.85 : 0.6);
    ctx.lineWidth = px(r.enterable ? 2.6 : 2);
    ctx.stroke();
  }
  ctx.restore();

  // 7. inland seas punched back out of the land, drawn exactly like the ocean
  for (const [i, w] of seaRings().entries()) {
    if (!hits(box(`sea:${SEAS[i].id}`, w), view, 20)) continue;
    ctx.beginPath();
    trace(ctx, w);
    ctx.fillStyle = css(SEA);
    ctx.fill();
    ctx.strokeStyle = css(SEA_DEEP, 0.26);
    ctx.lineWidth = px(3.5);
    ctx.stroke();
    ctx.strokeStyle = css(INK, 0.9);
    ctx.lineWidth = px(2.6);
    ctx.stroke();
  }

  // 8. the coast, over everything
  ctx.strokeStyle = css(0xfff3d0, 0.3);
  ctx.lineWidth = px(1.6);
  ctx.beginPath();
  for (const pts of near) trace(ctx, pts.map(([x, y]) => [x + px(1.8), y + px(1.8)] as Pt));
  ctx.stroke();
  ctx.strokeStyle = css(INK, 0.9);
  ctx.lineWidth = px(2.6);
  ctx.beginPath();
  for (const pts of near) trace(ctx, pts);
  ctx.stroke();

  // 9. the roads no ship of yours can sail yet, and the things that live out there
  ctx.setLineDash([px(11), px(9)]);
  ctx.strokeStyle = css(INK, 0.45);
  ctx.lineWidth = px(1.1);
  ctx.beginPath();
  for (const r of SEA_ROUTES) if (hits(box(`route:${r.id}`, r.pts), view, 30)) trace(ctx, r.pts, false);
  ctx.stroke();
  ctx.setLineDash([px(5), px(7)]);
  ctx.strokeStyle = css(INK, 0.3);
  ctx.lineWidth = px(0.9);
  ctx.beginPath();
  for (const l of TRADE_LANES) if (hits(box(`lane:${l.name}`, l.pts), view, 30)) trace(ctx, l.pts, false);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const c of SEA_CREATURES) creature(ctx, c.xy[0], c.xy[1], c.kind, c.scale * 2.2, view);
  for (const c of EXTRA_CREATURES) creature(ctx, c.xy[0], c.xy[1], c.kind as 'serpent', c.scale * 2.2, view);
  compass(ctx, COMPASS.xy[0], COMPASS.xy[1], COMPASS.r, view, px);

  // 10. and where the fog is widest, the old warning
  dragons(ctx, view, px);

  // 11. the worn frame of the chart itself
  ctx.strokeStyle = css(INK, 0.5);
  ctx.lineWidth = px(7);
  ctx.strokeRect(px(3.5), px(3.5), CHART.w - px(7), CHART.h - px(7));
  ctx.lineWidth = px(1.6);
  ctx.strokeStyle = css(INK, 0.4);
  ctx.strokeRect(px(15), px(15), CHART.w - px(30), CHART.h - px(30));
}

/** A river: broad at the mouth, a hair at its source. */
function river(ctx: CanvasRenderingContext2D, line: Pt[], size: number, px: (n: number) => number) {
  const w0 = px(0.9 + size * 1.1);
  ctx.strokeStyle = css(RIVER_INK, 0.6);
  ctx.beginPath();
  for (let i = 1; i < line.length; i++) {
    const t = i / (line.length - 1);
    ctx.lineWidth = Math.max(px(0.5), w0 * (1 - t * 0.8));
    ctx.beginPath();
    ctx.moveTo(line[i - 1][0], line[i - 1][1]);
    ctx.lineTo(line[i][0], line[i][1]);
    ctx.stroke();
  }
}

/** A mountain chain: little peaks marching along the crest, spaced by eye on screen. */
function range(ctx: CanvasRenderingContext2D, r: { size: number; pts: Pt[] }, px: (n: number) => number) {
  const h = px(3.2 + r.size * 1.8), step = px(6 + r.size * 2);
  ctx.strokeStyle = css(INK, 0.34);
  ctx.lineWidth = px(0.7 + r.size * 0.16);
  ctx.beginPath();
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / (len || 1), uy = (by - ay) / (len || 1);
    for (let d = 0; d < len; d += step) {
      const x = ax + ux * d, y = ay + uy * d;
      ctx.moveTo(x - h * 0.7, y + h * 0.35);
      ctx.lineTo(x, y - h * 0.65);
      ctx.lineTo(x + h * 0.7, y + h * 0.35);
    }
  }
  ctx.stroke();
}

/** Desert stipple, forest scatter, steppe ticks, marsh reeds — more of them as you come down. */
function groundCover(ctx: CanvasRenderingContext2D, c: { name: string; kind: string; pts: Pt[] }, view: View, px: (n: number) => number) {
  const b = box(`cover:${c.name}`, c.pts);
  const cloud = scatter(`cover:${c.name}`, c.pts, 2600);
  // how many marks the visible part of this area deserves, at about one every 30 screen pixels
  const onScreen = Math.max(0, Math.min(b.x1, view.x + view.w) - Math.max(b.x0, view.x)) *
    Math.max(0, Math.min(b.y1, view.y + view.h) - Math.max(b.y0, view.y)) * view.scale * view.scale;
  const share = onScreen / Math.max(1, (b.w * b.h * view.scale * view.scale));
  const want = Phaser.Math.Clamp(Math.round((onScreen / 900) / Math.max(share, 0.001) * share), 20, cloud.length);
  const m = px(2.6);
  ctx.strokeStyle = css(INK, c.kind === 'forest' ? 0.34 : 0.28);
  ctx.lineWidth = px(0.75);
  ctx.beginPath();
  for (let i = 0; i < want; i++) {
    const [x, y] = cloud[i];
    if (x < view.x - m * 4 || x > view.x + view.w + m * 4 || y < view.y - m * 4 || y > view.y + view.h + m * 4) continue;
    if (c.kind === 'desert') {
      ctx.moveTo(x - m, y); ctx.lineTo(x + m, y);
      ctx.moveTo(x - m * 1.8, y + m * 1.2); ctx.lineTo(x - m * 0.2, y + m * 1.2);
    } else if (c.kind === 'forest') {
      ctx.moveTo(x, y + m); ctx.lineTo(x, y - m * 0.6);
      ctx.moveTo(x - m * 0.8, y + m * 0.2); ctx.lineTo(x, y - m * 1.2); ctx.lineTo(x + m * 0.8, y + m * 0.2);
    } else if (c.kind === 'steppe') {
      ctx.moveTo(x - m * 0.8, y + m * 0.6); ctx.lineTo(x, y - m * 0.6);
      ctx.moveTo(x + m * 0.8, y + m * 0.6); ctx.lineTo(x + m * 0.2, y - m * 0.4);
    } else {
      ctx.moveTo(x - m * 1.4, y); ctx.lineTo(x + m * 1.4, y);
      ctx.moveTo(x - m * 0.8, y + m); ctx.lineTo(x + m * 0.8, y + m);
    }
  }
  ctx.stroke();
}

/** Sparse warnings in the widest fog. Their places are worked out once and then kept. */
let dragonSpots: Pt[] | null = null;
function dragonPlaces(): Pt[] {
  if (dragonSpots) return dragonSpots;
  const coasts = coastRings();
  const onLand = (x: number, y: number) => {
    let w = 0;
    for (const poly of coasts) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi <= y) { if (yj > y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) > 0) w++; }
        else if (yj <= y && (xj - xi) * (y - yi) - (x - xi) * (yj - yi) < 0) w--;
      }
    }
    return w !== 0;
  };
  const free = (x: number, y: number) => onLand(x, y) && !REGIONS.some(r => pointInPoly(x, y, r.poly));
  const room = (x: number, y: number, r: number) => {
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      if (!free(x + Math.cos(t) * r, y + Math.sin(t) * r)) return false;
    }
    return true;
  };
  const out: Pt[] = [];
  for (let x = 520; x < CHART.w - 520; x += 80) {
    for (let y = 420; y < CHART.h - 420; y += 80) {
      if (!free(x, y) || !room(x, y, 240)) continue;
      if (out.some(([px2, py]) => Math.hypot(px2 - x, py - y) < 900)) continue;
      out.push([x, y]);
    }
  }
  dragonSpots = out;
  return out;
}

function dragons(ctx: CanvasRenderingContext2D, view: View, px: (n: number) => number) {
  const spots = dragonPlaces();
  ctx.textAlign = 'center';
  spots.forEach(([x, y], i) => {
    if (x < view.x - 400 || x > view.x + view.w + 400 || y < view.y - 300 || y > view.y + view.h + 300) return;
    if (i % 3 === 1) {
      ctx.fillStyle = css(INK, 0.3);
      ctx.font = `italic ${px(13)}px Cinzel, Georgia, serif`;
      ctx.fillText('HIC SVNT DRACONES', x, y);
    } else {
      dragon(ctx, x, y, px(9) * (1 + (i % 3) * 0.25), INK);
    }
  });
}

function dragon(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, ink: number) {
  ctx.strokeStyle = css(ink, 0.4);
  ctx.fillStyle = css(ink, 0.4);
  ctx.lineWidth = k * 0.1;
  ctx.beginPath();
  ctx.moveTo(x - k * 1.6, y + k * 0.5);
  ctx.quadraticCurveTo(x - k * 0.6, y - k * 0.9, x + k * 0.2, y);
  ctx.quadraticCurveTo(x + k * 0.9, y + k * 0.8, x + k * 1.7, y - k * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - k * 0.2, y - k * 0.15);
  ctx.lineTo(x - k * 0.5, y - k * 1.1);
  ctx.lineTo(x + k * 0.45, y - k * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + k * 1.7, y - k * 0.2);
  ctx.lineTo(x + k * 2.2, y - k * 0.55);
  ctx.lineTo(x + k * 1.75, y - k * 0.6);
  ctx.closePath();
  ctx.fill();
}

function creature(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'serpent' | 'kraken' | 'whale', s: number, view: View) {
  if (x < view.x - 400 || x > view.x + view.w + 400 || y < view.y - 300 || y > view.y + view.h + 300) return;
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  };
  ctx.strokeStyle = css(INK, 0.7);
  ctx.lineWidth = 2.2 * s;
  if (kind === 'serpent') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(x + i * 48 * s - 22 * s, y); ctx.arc(x + i * 48 * s, y, 22 * s, Math.PI, 0, false); }
    ctx.stroke();
    ctx.fillStyle = css(INK, 0.7);
    tri(x - 30 * s, y - 4 * s, x - 22 * s, y - 26 * s, x - 6 * s, y - 8 * s);
  } else if (kind === 'kraken') {
    ctx.fillStyle = css(INK, 0.65);
    ctx.beginPath(); ctx.ellipse(x, y - 10 * s, 20 * s, 17 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) { ctx.moveTo(x + i * 12 * s - 14 * s, y + 18 * s); ctx.arc(x + i * 12 * s, y + 18 * s, 14 * s, Math.PI, i % 2 ? 0 : Math.PI * 1.9, i % 2 === 0); }
    ctx.stroke();
    ctx.fillStyle = css(0xe4d3ad);
    ctx.beginPath(); ctx.arc(x - 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = css(INK, 0.6);
    ctx.beginPath(); ctx.ellipse(x, y, 30 * s, 11 * s, 0, 0, Math.PI * 2); ctx.fill();
    tri(x + 26 * s, y, x + 44 * s, y - 14 * s, x + 44 * s, y + 12 * s);
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y - 12 * s); ctx.lineTo(x - 6 * s, y - 30 * s);
    ctx.lineTo(x - 16 * s, y - 40 * s); ctx.moveTo(x - 6 * s, y - 30 * s); ctx.lineTo(x + 4 * s, y - 40 * s);
    ctx.stroke();
  }
}

function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, view: View, px: (n: number) => number) {
  if (x + r < view.x || x - r > view.x + view.w || y + r < view.y || y - r > view.y + view.h) return;
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  };
  ctx.strokeStyle = css(INK, 0.55);
  ctx.lineWidth = px(1.4);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = px(0.7);
  ctx.strokeStyle = css(INK, 0.42);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
  const star = (len: number, col: number, rot: number) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2, b = a + Math.PI / 2;
      ctx.fillStyle = css(col, 0.85);
      tri(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos((a + b) / 2) * len * 0.22, y + Math.sin((a + b) / 2) * len * 0.22);
      ctx.fillStyle = css(col, 0.5);
      tri(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, x + Math.cos(a - Math.PI / 4) * len * 0.22, y + Math.sin(a - Math.PI / 4) * len * 0.22);
    }
  };
  star(r * 0.55, INK, Math.PI / 4);
  star(r * 0.9, INK, 0);
  ctx.fillStyle = css(0xa0341f, 0.85);
  tri(x, y, x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5);
  tri(x - r * 0.08, y - r * 0.5, x + r * 0.08, y - r * 0.5, x, y - r * 0.95);
}

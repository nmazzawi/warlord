// ChartPainter.ts — paints the world chart into a canvas, for ONE view: a rectangle of the world at a
// given number of pixels per world unit. That is the whole trick behind a chart that stays sharp: the
// map is not one bitmap that gets magnified, it is re-drawn at whatever zoom you are looking at it from.
// Everything here is measured in screen pixels and converted, so a coastline is two pixels of ink at the
// world view and two pixels of ink when you are down among the villages — it just follows a finer line.
import Phaser from 'phaser';
import { mulberry32 } from '../utils/rng';
import { COASTS, COVER, RANGES, RIVERS, SEAS, TRADE_LANES } from './AtlasData';
import { bbox, COMPASS, pointInPoly, REGIONS, SEA_ROUTES, type Pt, type Region } from './WorldChart';
import { CHART, ll, lly } from './geo';
import { SEA_NAMES } from './SeaNames';

export interface View {
  /** The world rectangle being drawn. */
  x: number; y: number; w: number; h: number;
  /** Pixels per world unit — i.e. how magnified this view is. */
  scale: number;
}

export const SEA = 0x9fbcc4, SEA_DEEP = 0x85a4ae, PARCH = 0xe4d3ad, INK = 0x3a2a18;
/** What each kind of ground looks like under the parchment — the planet has to read as Earth. */
const BIOME: Record<string, number> = {
  plains: 0xc9cf92, forest: 0x8fb173, jungle: 0x74a862, desert: 0xe8d5a2,
  steppe: 0xd8cf92, marsh: 0x93ab8b, mountain: 0xc0b49a, ice: 0xeef2f2,
};
/** Latitude bands, north to south: ice, taiga, temperate, dry, tropical, and back again. */
const BANDS: Array<[number, number]> = [
  [78, 0xeef2f2], [66, 0xe4ebea], [58, 0xa8bd8c], [48, 0xb9c98a], [38, 0xc9cf92],
  [28, 0xdcd39a], [18, 0xa9c47e], [4, 0x86b46a], [-12, 0xa9c47e], [-26, 0xd8cf95], [-38, 0xbcc98d], [-52, 0xdfe7e4],
];
const FOG = 0x8a7346, RIVER_INK = 0x4f7d86;
const RHUMB_HUBS: Array<[number, number]> = [[-35, 20], [-28, -26], [72, -8], [138, -14], [-95, 40]];

export const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

// ---------------------------------------------------------------- geometry, jittered once and cached
/**
 * A closed ring, run through Catmull-Rom so it FLOWS. The atlas is authored as real capes and ports,
 * and joining them with straight lines makes Italy a wedge and the Peloponnese a spearhead; the same
 * points read as a coast the moment the line curves through them. Wraps around, so the ring closes
 * without a corner.
 */
const curveCache = new Map<string, Pt[]>();
function curved(key: string, pts: Pt[], per = 4): Pt[] {
  const hit = curveCache.get(key);
  if (hit) return hit;
  const n = pts.length;
  const out: Pt[] = [];
  if (n < 4) { curveCache.set(key, pts); return pts; }
  const at = (i: number) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = at(i - 1), [x1, y1] = at(i), [x2, y2] = at(i + 1), [x3, y3] = at(i + 2);
    // a long leg gets more of the curve than a short one, so a fjord is not spent on the same budget
    const steps = Math.max(2, Math.min(per, Math.round(Math.hypot(x2 - x1, y2 - y1) / 12)));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      ]);
    }
  }
  curveCache.set(key, out);
  return out;
}

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
    // A real coast is crinkled at every size. Points are laid down far more finely than the authored
    // capes, and each one is pushed ALONG THE NORMAL of its segment — sideways wobble reads as a bay
    // or a headland, where the old square jitter just read as a shaky hand.
    const steps = Math.min(6, Math.max(1, Math.floor(len / 9)));
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      // two octaves: a slow swell for bays, a fast one for the rocks in them
      const w = Math.sin(t * Math.PI * 2) * (rnd() - 0.5) + (rnd() - 0.5) * 0.55;
      const j = w * amp * 2.4;
      out.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j]);
    }
  }
  inkCache.set(key, out);
  return out;
}
// curve first so the shape is right, THEN ink it so the line looks drawn rather than plotted
const coastRings = () => COASTS.map(c => inked(`coast:${c.id}`, curved(`cc:${c.id}`, c.pts, 5), 1.5, 777));
const regionRing = (r: Region) => inked(`realm:${r.id}`, curved(`rc:${r.id}`, r.poly, 3), 5, 9);
const seaRings = () => SEAS.map(s => inked(`sea:${s.id}`, curved(`sc:${s.id}`, s.pts, 4), 1.3, 5));

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

  // the ground itself: broad latitude bands washed across the land, then the deserts, forests, steppe
  // and marshes painted over them as real shapes — smooth at any zoom, never a grid of squares
  ctx.save();
  landPath(ctx);
  ctx.clip();
  const band = ctx.createLinearGradient(0, lly(78), 0, lly(-52));
  for (const [lat, col] of BANDS) {
    const t = Phaser.Math.Clamp((lly(lat) - lly(78)) / (lly(-52) - lly(78)), 0, 1);
    band.addColorStop(t, css(col, 0.5));
  }
  ctx.fillStyle = band;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  for (const c of COVER) {
    const b = box(`cover:${c.name}`, c.pts);
    if (!hits(b, view)) continue;
    const col = BIOME[c.kind];
    if (!col) continue;
    ctx.fillStyle = css(col, c.kind === 'desert' ? 0.55 : 0.45);
    ctx.beginPath();
    trace(ctx, inked(`coverEdge:${c.name}`, c.pts, 5, 31));
    ctx.fill();
  }
  ctx.restore();

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
    ctx.fillStyle = css(mix(PARCH, r.tint, r.enterable ? 0.92 : 0.88), r.enterable ? 0.58 : 0.5);
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
  ctx.textAlign = 'center';
  for (const n of SEA_NAMES) {
    const [x, y] = ll(n.lon, n.lat);
    if (x < view.x - 300 || x > view.x + view.w + 300 || y < view.y - 200 || y > view.y + view.h + 200) continue;
    const size = px(n.size ?? 12);
    if (size * s < 7) continue;                      // too small to read: leave it off
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((n.tilt ?? 0) * Math.PI) / 180);
    ctx.font = `italic ${size}px Cinzel, Georgia, serif`;
    // letter-spaced the way a plate spaces a sea, and set into the water rather than printed on it:
    // a hair of parchment behind each letter lifts it off the hatching without boxing it in
    const label = n.name.toUpperCase().split('').join('\u2009\u2009');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(PARCH, 0.34);
    ctx.lineWidth = px(2.6);
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = css(INK, 0.33);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  // The oceans carry NOTHING but water, its names and the rose: no serpents, no krakens, no whales.
  // A real atlas plate keeps its empty sea empty, and every one of those sketches was a thing the eye
  // caught instead of the coastline.
  compass(ctx, COMPASS.xy[0], COMPASS.xy[1], COMPASS.r, view, px);

  // 10. and where the fog is widest ON LAND, the old warning and the beast that belongs there
  dragons(ctx, view, px);

  // 11. the paper itself. A plate is printed on something with a tooth: a fine, even speckle laid over
  //     everything at a CONSTANT size on screen, so it stays paper at every zoom instead of becoming
  //     boulders when you come down. Cheap, and it is what stops the flat fills reading as plastic.
  grain(ctx, view, px);
}

/** The tooth of the paper: one deterministic speckle field, sampled for whatever you are looking at. */
const grainCache: Array<[number, number, number]> = [];
function grain(ctx: CanvasRenderingContext2D, view: View, px: (n: number) => number) {
  if (!grainCache.length) {
    const rnd = mulberry32(4242);
    for (let i = 0; i < 1400; i++) grainCache.push([rnd(), rnd(), rnd()]);
  }
  const cell = px(26);                      // one speckle per 26 screen pixels, whatever the zoom
  const cols = Math.ceil(view.w / cell) + 1, rows = Math.ceil(view.h / cell) + 1;
  if (cols * rows > 26000) return;          // a whole-world repaint does not need the tooth
  const x0 = Math.floor(view.x / cell) * cell, y0 = Math.floor(view.y / cell) * cell;
  ctx.fillStyle = css(0x6b5636, 0.075);
  ctx.beginPath();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const g = grainCache[(i * 71 + j * 37) % grainCache.length];
      if (g[2] < 0.45) continue;
      const x = x0 + (i + g[0]) * cell, y = y0 + (j + g[1]) * cell;
      const r = px(0.55 + g[2] * 0.9);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
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

/**
 * A mountain chain, drawn the way an atlas plate draws one: every peak is a solid little pyramid with
 * a lit face and a shadowed face, sitting on its own soft shadow. The light comes from the north-west
 * across the whole map — one direction for every range on the plate, which is what makes the relief
 * read as terrain rather than as a row of chevrons.
 */
function range(ctx: CanvasRenderingContext2D, r: { size: number; pts: Pt[] }, px: (n: number) => number) {
  const h = px(3.4 + r.size * 2.0), step = px(5 + r.size * 1.7);
  const peaks: Array<[number, number, number]> = [];
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / (len || 1), uy = (by - ay) / (len || 1);
    for (let d = 0; d < len; d += step) {
      // stagger every other peak off the crest so the chain has depth instead of being a single file
      const off = ((peaks.length % 3) - 1) * h * 0.34;
      peaks.push([ax + ux * d - uy * off, ay + uy * d + ux * off, 0.75 + ((peaks.length * 7) % 5) * 0.12]);
    }
  }
  // the ground shadow each one throws to the south-east
  ctx.fillStyle = css(INK, 0.10);
  ctx.beginPath();
  for (const [x, y, k] of peaks) {
    // moveTo before EVERY ellipse: without it the path runs a line from one to the next and the fill
    // joins the whole chain into one long smear across the country
    ctx.moveTo(x + h * 1.04 * k, y + h * 0.44 * k);
    ctx.ellipse(x + h * 0.22 * k, y + h * 0.44 * k, h * 0.82 * k, h * 0.3 * k, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  // the shadowed (south-east) face
  ctx.fillStyle = css(INK, 0.30);
  ctx.beginPath();
  for (const [x, y, k] of peaks) {
    ctx.moveTo(x, y - h * 0.72 * k);
    ctx.lineTo(x + h * 0.72 * k, y + h * 0.36 * k);
    ctx.lineTo(x, y + h * 0.36 * k);
  }
  ctx.fill();
  // the lit (north-west) face
  ctx.fillStyle = css(0xf0e6cd, 0.55);
  ctx.beginPath();
  for (const [x, y, k] of peaks) {
    ctx.moveTo(x, y - h * 0.72 * k);
    ctx.lineTo(x - h * 0.72 * k, y + h * 0.36 * k);
    ctx.lineTo(x, y + h * 0.36 * k);
  }
  ctx.fill();
  // and the crest line over both, so the ridge keeps a drawn edge at any zoom
  ctx.strokeStyle = css(INK, 0.42);
  ctx.lineWidth = px(0.6 + r.size * 0.14);
  ctx.beginPath();
  for (const [x, y, k] of peaks) {
    ctx.moveTo(x - h * 0.72 * k, y + h * 0.36 * k);
    ctx.lineTo(x, y - h * 0.72 * k);
    ctx.lineTo(x + h * 0.72 * k, y + h * 0.36 * k);
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
  // Under the marks, a mottle: soft blotches of the biome's own colour, so a forest reads as a mass of
  // trees and a desert as drifting sand rather than as a flat wash with dots on it.
  const mott = c.kind === 'forest' ? 0x4e6b3a : c.kind === 'desert' ? 0xc9a86a
    : c.kind === 'steppe' ? 0x9aa964 : c.kind === 'jungle' ? 0x3f6b3a : 0x6f8a86;
  const blobs = Math.min(Math.round(want * 0.45), 260);
  ctx.fillStyle = css(mott, c.kind === 'desert' ? 0.16 : 0.20);
  ctx.beginPath();
  for (let i = 0; i < blobs; i++) {
    const [x, y] = cloud[(i * 3 + 1) % cloud.length];
    if (x < view.x - 60 || x > view.x + view.w + 60 || y < view.y - 60 || y > view.y + view.h + 60) continue;
    const rr = px(7 + ((i * 13) % 9));
    ctx.moveTo(x + rr, y);
    ctx.ellipse(x, y, rr, rr * 0.62, ((i % 7) - 3) * 0.3, 0, Math.PI * 2);
  }
  ctx.fill();
  // a desert also carries the long grain of its dunes
  if (c.kind === 'desert') {
    ctx.strokeStyle = css(0xb08d55, 0.22);
    ctx.lineWidth = px(1.1);
    ctx.beginPath();
    for (let i = 0; i < blobs; i += 2) {
      const [x, y] = cloud[(i * 5 + 2) % cloud.length];
      if (x < view.x - 60 || x > view.x + view.w + 60 || y < view.y - 60 || y > view.y + view.h + 60) continue;
      const w = px(16 + ((i * 11) % 14));
      ctx.moveTo(x - w, y + px(2));
      ctx.quadraticCurveTo(x, y - px(3), x + w, y + px(2));
    }
    ctx.stroke();
  }

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
      beast(ctx, x, y, px(9) * (1 + (i % 3) * 0.25), i);
    }
  });
}

/** What lives out in the Wilds: the beast a cartographer would sketch for that part of the world. */
function beast(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, seed: number) {
  const lon = -125 + ((x - 70) / (5330 - 70)) * 270;
  const lat = latitudeAt(y);
  ctx.strokeStyle = css(INK, 0.42);
  ctx.fillStyle = css(INK, 0.42);
  ctx.lineWidth = k * 0.1;
  const legs = (x0: number, w: number, top: number, h: number) => {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const lx = x0 + (w * (i + 0.5)) / 4; ctx.moveTo(lx, top); ctx.lineTo(lx + (i % 2 ? k * 0.1 : -k * 0.1), top + h); }
    ctx.stroke();
  };
  if (lat > 55) {                                   // the northern forests: a bear
    ctx.beginPath();
    ctx.ellipse(x, y, k * 1.25, k * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + k * 1.35, y - k * 0.35, k * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + k * 1.55, y - k * 0.7, k * 0.16, 0, Math.PI * 2);
    ctx.fill();
    legs(x - k, k * 2, y + k * 0.55, k * 0.6);
  } else if (lon > 108 && lat < -8) {               // the southern land: a kangaroo
    ctx.beginPath();
    ctx.ellipse(x, y, k * 0.55, k * 0.85, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + k * 0.35, y - k * 1.05, k * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - k * 0.4, y + k * 0.5);
    ctx.quadraticCurveTo(x - k * 1.7, y + k * 0.6, x - k * 1.9, y + k * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + k * 0.2, y + k * 0.8); ctx.lineTo(x + k * 0.6, y + k * 1.35); ctx.lineTo(x + k * 1.1, y + k * 1.35);
    ctx.stroke();
  } else if (lon > -20 && lon < 60 && lat < 12) {   // the great southern continent: an elephant
    ctx.beginPath();
    ctx.ellipse(x, y, k * 1.15, k * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + k * 1.25, y - k * 0.15, k * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + k * 1.6, y + k * 0.1);
    ctx.quadraticCurveTo(x + k * 2.1, y + k * 0.6, x + k * 1.8, y + k * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + k * 0.95, y - k * 0.55); ctx.lineTo(x + k * 0.35, y - k * 0.95); ctx.lineTo(x + k * 0.5, y - k * 0.2);
    ctx.closePath();
    ctx.fill();
    legs(x - k * 0.9, k * 1.8, y + k * 0.6, k * 0.7);
  } else if (lon < -30) {                            // the far west: a bison
    ctx.beginPath();
    ctx.ellipse(x, y, k * 1.1, k * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - k * 0.6, y - k * 0.35, k * 0.62, k * 0.5, 0, 0, Math.PI * 2);   // the hump
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - k * 1.35, y - k * 0.1, k * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - k * 1.6, y - k * 0.45); ctx.lineTo(x - k * 1.9, y - k * 0.75);
    ctx.moveTo(x - k * 1.1, y - k * 0.45); ctx.lineTo(x - k * 0.9, y - k * 0.85);
    ctx.stroke();
    legs(x - k * 0.9, k * 1.8, y + k * 0.5, k * 0.6);
  } else {
    dragon(ctx, x, y, k, INK);
    return;
  }
  void seed;
}

/** Latitude from a chart y — the inverse of the projection, for deciding what beast belongs here. */
function latitudeAt(y: number) {
  const MY0 = Math.log(Math.tan(Math.PI / 4 + (72 * Math.PI) / 360));
  const KY = (3170 - 70) / (MY0 - Math.log(Math.tan(Math.PI / 4 + (-49 * Math.PI) / 360)));
  const m = MY0 - (y - 70) / KY;
  return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI);
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

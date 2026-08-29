// ChartLayer.ts — keeps the chart sharp. Two layers: a small picture of the whole world that is always
// there (so panning never shows a hole), and a detail layer the size of your screen that is REPAINTED at
// whatever zoom you are looking from, once your hands come off the map. That is why a coastline is a
// clean line at the world view and still a clean line when you are down among your own villages: it is
// not one bitmap being magnified, it is the same geography drawn again at the scale you asked for.
import Phaser from 'phaser';
import { paintChart, type View } from './ChartPainter';
import { CHART } from './geo';

/** The whole world, small: a fallback that costs little and is only seen at the edge of a fast pan. */
const BASE_SCALE = 0.2;
/** How much bigger than the screen the detail layer is painted, so small drags need no repaint. */
const MARGIN = 1.08;
/** Ceiling on the detail canvas, in pixels — a phone cannot afford a full device-resolution sheet. */
const MAX_PIXELS = 2_200_000;
/** How still the view must be, in milliseconds, before it is worth repainting. */
const SETTLE = 130;
const DETAIL_KEY = 'world_chart_detail';

export function baseTexture(scene: Phaser.Scene): string {
  const key = 'world_chart_base';
  if (scene.textures.exists(key)) return key;
  const w = Math.ceil(CHART.w * BASE_SCALE), h = Math.ceil(CHART.h * BASE_SCALE);
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return key;
  paintChart(canvas.getContext(), { x: 0, y: 0, w: CHART.w, h: CHART.h, scale: BASE_SCALE });
  canvas.refresh();
  return key;
}

export class ChartLayer {
  private base: Phaser.GameObjects.Image;
  private detail: Phaser.GameObjects.Image;
  private tex: Phaser.Textures.CanvasTexture | null = null;
  view: View = { x: 0, y: 0, w: 0, h: 0, scale: 0 };
  /** How many times the sheet has been repainted — the smoke test watches this for runaway redraws. */
  paints = 0;
  private sx = NaN; private sy = NaN; private sz = NaN;
  private movedAt = 0;

  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.image(0, 0, baseTexture(scene)).setOrigin(0).setDisplaySize(CHART.w, CHART.h).setDepth(0);
    this.detail = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(0.1).setVisible(false);
    // the detail sheet is the biggest texture in the game; hand it back when we leave the map, so a
    // raid is not carrying several megabytes of parchment it cannot see
    scene.events.once('shutdown', () => {
      this.tex = null;
      if (scene.textures.exists(DETAIL_KEY)) scene.textures.remove(DETAIL_KEY);
    });
  }

  /** Called every frame. Repaints once the view has been still for a moment — repainting while a pinch
   *  is still moving would only stutter, and repainting on a timer that keeps being reset never happens
   *  at all, so this watches for the view to STOP rather than for it to change. */
  tick(cam: Phaser.Cameras.Scene2D.Camera) {
    if (cam.scrollX !== this.sx || cam.scrollY !== this.sy || cam.zoom !== this.sz) {
      this.sx = cam.scrollX; this.sy = cam.scrollY; this.sz = cam.zoom;
      this.movedAt = this.scene.time.now;
    }
    const v = cam.worldView;
    const covered = v.x >= this.view.x && v.y >= this.view.y &&
      v.right <= this.view.x + this.view.w && v.bottom <= this.view.y + this.view.h;
    // the whole world underneath is only worth drawing when the sheet does not cover what you can see
    this.base.setVisible(!covered);
    const sharp = Math.abs(cam.zoom * this.quality() - this.view.scale) < 0.0005;
    if (covered && sharp) return;
    if (this.scene.time.now - this.movedAt < SETTLE) return;
    this.repaint(cam);
  }

  /** Repaint now (when the map opens, so the very first frame is already sharp). */
  refresh(cam: Phaser.Cameras.Scene2D.Camera) {
    this.repaint(cam);
  }

  private quality() {
    const { width, height } = this.scene.scale;
    const want = width * height * MARGIN * MARGIN;
    return Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, want)));
  }

  private repaint(cam: Phaser.Cameras.Scene2D.Camera) {
    this.paints++;
    const q = this.quality();
    const pw = Math.ceil(this.scene.scale.width * MARGIN * q);
    const ph = Math.ceil(this.scene.scale.height * MARGIN * q);
    const key = DETAIL_KEY;
    if (this.tex && (this.tex.width !== pw || this.tex.height !== ph)) {
      this.scene.textures.remove(key);
      this.tex = null;
    }
    if (!this.tex) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      this.tex = this.scene.textures.createCanvas(key, pw, ph);
      if (!this.tex) return;                       // no canvas: the base layer alone still draws the world
      this.detail.setTexture(key);
    }
    const scale = cam.zoom * q;                    // pixels per world unit in the painted sheet
    const w = pw / scale, h = ph / scale;
    const x = cam.worldView.centerX - w / 2, y = cam.worldView.centerY - h / 2;
    this.view = { x, y, w, h, scale };
    const ctx = this.tex.getContext();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    paintChart(ctx, this.view);
    this.tex.refresh();
    this.detail.setPosition(x, y).setDisplaySize(w, h).setVisible(true);
    this.base.setVisible(false);
  }
}

// LineOfSight.ts — "can A see B?" against the huts. Used so swords and arrows don't pass through walls.
import Phaser from 'phaser';
import { HUTS } from '../world/Village';

const rects = HUTS.map(h => new Phaser.Geom.Rectangle(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h));
const line = new Phaser.Geom.Line();

export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
  line.setTo(x1, y1, x2, y2);
  for (const r of rects) if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
  return true;
}

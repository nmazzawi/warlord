// LineOfSight.ts — "can A see B?" against the current map's obstacles. Swords and arrows don't pass
// through walls. The raid scene sets the obstacle list when it builds the map.
import Phaser from 'phaser';

let rects: Phaser.Geom.Rectangle[] = [];
const line = new Phaser.Geom.Line();

export function setLineOfSightObstacles(obstacles: Array<{ x: number; y: number; w: number; h: number }>) {
  rects = obstacles.map(h => new Phaser.Geom.Rectangle(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h));
}

export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
  line.setTo(x1, y1, x2, y2);
  for (const r of rects) if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
  return true;
}

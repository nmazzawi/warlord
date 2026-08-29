// LineOfSight.ts — "can A see B?" against the current map's obstacles. Swords and arrows don't pass
// through walls. The raid scene sets the obstacle list when it builds the map. Shots at archers on a
// wall top ignore the wall itself (the arrow arcs over it) but not the rocks and huts in between.
import Phaser from 'phaser';

interface Ob { x: number; y: number; w: number; h: number; kind?: string; }
let rects: Phaser.Geom.Rectangle[] = [];
let lowRects: Phaser.Geom.Rectangle[] = [];
const line = new Phaser.Geom.Line();

export function setLineOfSightObstacles(obstacles: Ob[]) {
  rects = obstacles.map(h => new Phaser.Geom.Rectangle(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h));
  lowRects = obstacles.filter(h => h.kind !== 'wall' && h.kind !== 'stone' && h.kind !== 'gate')
    .map(h => new Phaser.Geom.Rectangle(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h));
}

export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number, overWalls = false): boolean {
  line.setTo(x1, y1, x2, y2);
  for (const r of overWalls ? lowRects : rects) if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
  return true;
}

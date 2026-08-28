// Surround.ts — militia ring the hero: each gets an evenly spaced angle slot around them.
// In the open, 8 slots means 8 attackers. Between huts, most slots are unreachable — that's
// the whole point of fighting in an alley.
import Phaser from 'phaser';
import { SURROUND } from '../config/balance';
import type { Enemy } from '../entities/Enemy';
import type { Hero } from '../entities/Hero';

export class SurroundManager {
  private timer = 0;

  update(dt: number, hero: Hero, militia: Enemy[]) {
    this.timer -= dt;
    const needs = militia.some(m => m.slotAngle === null);
    if (this.timer > 0 && !needs) return;
    this.timer = SURROUND.reassignEvery;
    const n = militia.length;
    if (n === 0) return;

    // current angle of each militia around the hero
    const sorted = militia.slice().sort((a, b) =>
      Math.atan2(a.y - hero.y, a.x - hero.x) - Math.atan2(b.y - hero.y, b.x - hero.x));
    const angles = sorted.map(m => Math.atan2(m.y - hero.y, m.x - hero.x));
    const step = (Math.PI * 2) / n;
    const base = angles[0];

    // try every rotation of the slot ring; keep the one that moves everyone the least
    let bestOffset = 0, bestCost = Infinity;
    for (let o = 0; o < n; o++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const slot = base + ((i + o) % n) * step;
        cost += Math.abs(Phaser.Math.Angle.Wrap(slot - angles[i]));
      }
      if (cost < bestCost) { bestCost = cost; bestOffset = o; }
    }
    for (let i = 0; i < n; i++) sorted[i].slotAngle = base + ((i + bestOffset) % n) * step;
  }
}

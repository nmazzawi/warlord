// Formation.ts — where each troop wants to stand relative to the hero: a loose wedge behind them.
// "Forward" (+x) is the direction the hero is facing; the whole shape rotates with it.
import Phaser from 'phaser';

const SLOTS: Array<[number, number]> = [
  [-34, -30], [-34, 30], [-62, 0], [-62, -58], [-62, 58], [-90, -30], [-90, 30], [-118, 0],
];

export function formationSlot(heroX: number, heroY: number, heading: number, index: number, out: Phaser.Math.Vector2) {
  const [lx, ly] = SLOTS[index % SLOTS.length];
  const c = Math.cos(heading), s = Math.sin(heading);
  out.set(heroX + lx * c - ly * s, heroY + lx * s + ly * c);
  return out;
}

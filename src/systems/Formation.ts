// Formation.ts — where each troop wants to stand relative to the hero, and the one choice you make
// before a fight starts. "Forward" (+x) is the direction the hero is facing; the whole shape turns
// with them, so a line stays a line whichever way you walk.
import Phaser from 'phaser';

export type FormationKind = 'line' | 'wedge' | 'guard';

/** Eight slots per shape. A warband is at most six, so the last two are only ever a reserve. */
const SHAPES: Record<FormationKind, Array<[number, number]>> = {
  // LINE — they go in front and you fight behind them. Nothing reaches you that they have not met.
  line: [[52, -30], [52, 30], [78, 0], [52, -76], [52, 76], [96, -44], [96, 44], [24, 0]],
  // WEDGE — they go wide to both sides, so a crowd coming at you gets hit from the flanks.
  wedge: [[6, -66], [6, 66], [-26, -96], [-26, 96], [38, -96], [38, 96], [-58, -66], [-58, 66]],
  // GUARD — they ring you. Slow, safe, and the archers behind cannot get a clean line on you.
  guard: [[-44, 0], [-30, -42], [-30, 42], [16, -46], [16, 46], [44, -22], [44, 22], [-62, 0]],
};

export const FORMATIONS: Array<{ id: FormationKind; label: string; note: string }> = [
  { id: 'line', label: 'LINE', note: 'They form up ahead of you. Everything comes through them first.' },
  { id: 'wedge', label: 'WEDGE', note: 'They spread to both sides and take the crowd on its flanks.' },
  { id: 'guard', label: 'GUARD', note: 'They ring you. Slower, and nothing gets behind you.' },
];

export function formationSlot(heroX: number, heroY: number, heading: number, index: number, out: Phaser.Math.Vector2, kind: FormationKind = 'line') {
  const slots = SHAPES[kind] ?? SHAPES.line;
  const [lx, ly] = slots[index % slots.length];
  const c = Math.cos(heading), s = Math.sin(heading);
  out.set(heroX + lx * c - ly * s, heroY + lx * s + ly * c);
  return out;
}

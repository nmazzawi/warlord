// FlowField.ts — cheap pathfinding around huts. The map is a coarse grid; from the hero's cell
// we flood outward once every few frames, and every unit simply steps "downhill" toward the hero.
// Dozens of units share one computation, which keeps phones happy.
import Phaser from 'phaser';

export interface Rect { x: number; y: number; w: number; h: number; } // centered

export class FlowField {
  readonly cell = 32;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private dist: Int32Array;
  private queue: Int32Array;
  private lastX = -9999;
  private lastY = -9999;
  private timer = 0;

  constructor(worldW: number, worldH: number, obstacles: Rect[], inflate = 13) {
    this.cols = Math.ceil(worldW / this.cell);
    this.rows = Math.ceil(worldH / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.dist = new Int32Array(this.cols * this.rows).fill(-1);
    this.queue = new Int32Array(this.cols * this.rows);
    for (const o of obstacles) {
      const x0 = o.x - o.w / 2 - inflate, x1 = o.x + o.w / 2 + inflate;
      const y0 = o.y - o.h / 2 - inflate, y1 = o.y + o.h / 2 + inflate;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cx = c * this.cell + this.cell / 2, cy = r * this.cell + this.cell / 2;
          if (cx > x0 && cx < x1 && cy > y0 && cy < y1) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  /** Recompute if the target moved enough or enough time passed. */
  update(dt: number, targetX: number, targetY: number) {
    this.timer -= dt;
    const moved = Math.abs(targetX - this.lastX) > 10 || Math.abs(targetY - this.lastY) > 10;
    if (this.timer > 0 && !moved) return;
    if (!moved && this.lastX !== -9999) { this.timer = 0.25; return; }
    this.timer = 0.15;
    this.lastX = targetX; this.lastY = targetY;
    this.compute(targetX, targetY);
  }

  private idx(x: number, y: number) {
    const c = Phaser.Math.Clamp(Math.floor(x / this.cell), 0, this.cols - 1);
    const r = Phaser.Math.Clamp(Math.floor(y / this.cell), 0, this.rows - 1);
    return r * this.cols + c;
  }

  private compute(tx: number, ty: number) {
    const dist = this.dist, blocked = this.blocked, cols = this.cols, rows = this.rows, q = this.queue;
    dist.fill(-1);
    let head = 0, tail = 0;
    const start = this.idx(tx, ty);
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const cur = q[head++];
      const cr = (cur / cols) | 0, cc = cur - cr * cols;
      const d = dist[cur] + 1;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          if (blocked[ni] || dist[ni] !== -1) continue;
          // no cutting corners around a hut
          if (dr !== 0 && dc !== 0 && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue;
          dist[ni] = d;
          q[tail++] = ni;
        }
      }
    }
  }

  /**
   * Direction to move from (x, y) to get closer to the target. Returns false when the unit is
   * already in the target's cell (caller should then walk straight at it).
   */
  direction(x: number, y: number, out: Phaser.Math.Vector2): boolean {
    const cols = this.cols, rows = this.rows, dist = this.dist;
    const c = Phaser.Math.Clamp(Math.floor(x / this.cell), 0, cols - 1);
    const r = Phaser.Math.Clamp(Math.floor(y / this.cell), 0, rows - 1);
    const own = dist[r * cols + c];
    if (own === 0) return false;
    let best = own === -1 ? Infinity : own, br = -1, bc = -1;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const d = dist[nr * cols + nc];
        if (d === -1) continue;
        if (dr !== 0 && dc !== 0 && (this.blocked[r * cols + nc] || this.blocked[nr * cols + c])) continue;
        if (d < best) { best = d; br = nr; bc = nc; }
      }
    }
    if (br === -1) return false;
    out.set(bc * this.cell + this.cell / 2 - x, br * this.cell + this.cell / 2 - y);
    if (out.lengthSq() < 1) return false;
    out.normalize();
    return true;
  }
}

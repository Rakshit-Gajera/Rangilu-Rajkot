import type { RoadGraph } from '../world/roadgraph';

const CELL = 250;
const STYLE: Record<number, [string, number]> = {
  9: ['#f59e0b', 4.5], 8: ['#f59e0b', 4.5], 7: ['#fbbf24', 3.6], 6: ['#fde68a', 3], 5: ['#e7e5e4', 2.4],
  4: ['#a8a29e', 1.8], 3: ['#a8a29e', 1.5], 2: ['#78716c', 1.1], 1: ['#57534e', 0.9],
};

/** Typical carriageway width by road rank, metres. */
const REAL_W: Record<number, number> = { 9: 14, 8: 14, 7: 12, 6: 9, 5: 7, 4: 6, 3: 5, 2: 4, 1: 3 };

/** Spatial index of graph edges in 250 m cells, so a view only touches nearby roads. */
export class EdgeIndex {
  private cells = new Map<number, number[]>();
  constructor(readonly graph: RoadGraph) {
    const e = graph.data.edges, p = graph.data.pts;
    for (let k = 0; k < e.a.length; k++) {
      const seen = new Set<number>();
      for (let q = e.start[k]; q < e.start[k + 1]; q++) {
        const key = cellKey(Math.floor(p[2 * q] / CELL), Math.floor(p[2 * q + 1] / CELL));
        if (seen.has(key)) continue;
        seen.add(key);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(k);
      }
    }
  }

  /** Edge ids touching the axis-aligned box. */
  query(x0: number, n0: number, x1: number, n1: number): number[] {
    const out = new Set<number>();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(n0 / CELL); j <= Math.floor(n1 / CELL); j++) {
        for (const k of this.cells.get(cellKey(i, j)) ?? []) out.add(k);
      }
    }
    return [...out];
  }
}

const cellKey = (i: number, j: number) => (i + 1000) * 4096 + (j + 1000);

export interface View {
  /** Map centre (metres from origin, x east, n north). */
  cx: number;
  cn: number;
  /** Pixels per metre. */
  scale: number;
  /** Rotation (radians); the minimap turns with the camera. */
  rot: number;
  w: number;
  h: number;
}

export function toScreen(v: View, x: number, n: number): [number, number] {
  const dx = (x - v.cx) * v.scale, dy = -(n - v.cn) * v.scale;
  const c = Math.cos(v.rot), s = Math.sin(v.rot);
  return [v.w / 2 + dx * c - dy * s, v.h / 2 + dx * s + dy * c];
}

export function toWorld(v: View, px: number, py: number): [number, number] {
  const dx = px - v.w / 2, dy = py - v.h / 2;
  const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
  const rx = dx * c - dy * s, ry = dx * s + dy * c;
  return [v.cx + rx / v.scale, v.cn - ry / v.scale];
}

/** Draw roads (minor first), then an optional route on top. */
export function drawRoads(ctx: CanvasRenderingContext2D, idx: EdgeIndex, v: View, minRank = 1, widthScale = 1) {
  const r = Math.hypot(v.w, v.h) / 2 / v.scale;
  const ids = idx.query(v.cx - r, v.cn - r, v.cx + r, v.cn + r);
  const e = idx.graph.data.edges, p = idx.graph.data.pts;
  const byRank = new Map<number, number[]>();
  for (const k of ids) {
    if (e.rank[k] < minRank) continue;
    let l = byRank.get(e.rank[k]);
    if (!l) byRank.set(e.rank[k], (l = []));
    l.push(k);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const [col, w] = STYLE[rank] ?? STYLE[3];
    ctx.strokeStyle = col;
    // Zoomed in, roads take their real carriageway width (metres × pixels per metre).
    ctx.lineWidth = Math.max(0.6, w * widthScale, (REAL_W[rank] ?? 5) * v.scale);
    ctx.beginPath();
    for (const k of byRank.get(rank)!) {
      for (let q = e.start[k]; q < e.start[k + 1]; q++) {
        const [sx, sy] = toScreen(v, p[2 * q], p[2 * q + 1]);
        if (q === e.start[k]) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  }
}

export function drawRoute(ctx: CanvasRenderingContext2D, v: View, pts: number[] | null, width: number) {
  if (!pts || pts.length < 4) return;
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let q = 0; q < pts.length; q += 2) {
    const [sx, sy] = toScreen(v, pts[q], pts[q + 1]);
    if (q === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
}

export function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.66, size * 0.8);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.66, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#a855f7';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 14, 7, Math.PI, 0);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

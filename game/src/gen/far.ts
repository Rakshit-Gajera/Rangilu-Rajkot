import earcut from 'earcut';
import { AREA_WATER, type Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';
import { triangulate } from './polys';

/** Average facade colour per style zone at a distance (sRGB): plaster darkened by windows. */
const ZONE_FAR: number[][] = [
  [0.72, 0.62, 0.46], [0.74, 0.66, 0.54], [0.80, 0.74, 0.64], [0.70, 0.70, 0.68],
  [0.78, 0.76, 0.72], [0.58, 0.60, 0.62], [0.74, 0.68, 0.58],
];
const MIN_AREA = 30; // small buildings are dropped far away (PROMPT §8.3 LOD2)
const STEP = 2; // 20 m terrain

export interface FarBuild {
  key: string;
  i: number;
  j: number;
  swx: number;
  swn: number;
  heights: Float32Array;
  hn: number;
  /** One merged mesh: attributes color (3, linear) and glow (1 = lit windows at night). */
  mesh: GeoBuf;
  stats: { triangles: number; ms: number };
}

function area(o: Float32Array) {
  let a = 0;
  const m = o.length / 2;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    a += o[2 * k] * o[2 * j + 1] - o[2 * j] * o[2 * k + 1];
  }
  return a / 2;
}

/** Cheap far-distance version of a tile: 20 m terrain, road ribbons, water, building prisms. */
export function farMesh(tile: Tile): GeoBuf {
  const b = new Builder(false, { color: 3, glow: 1 });
  const n = tile.hn, h = tile.heights;

  // Terrain at 20 m.
  const cols = Math.floor((n - 1) / STEP) + 1;
  const ground = [0.62, 0.53, 0.40];
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const rr = Math.min(r * STEP, n - 1), cc = Math.min(c * STEP, n - 1);
      b.vertex(cc * 10, h[rr * n + cc], -rr * 10, 0, 1, 0, 0, 0, { color: ground, glow: [0] });
    }
  }
  for (let r = 0; r < cols - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      b.tri(a, a + 1, a + cols + 1);
      b.tri(a, a + cols + 1, a + cols);
    }
  }

  // Roads as flat ribbons slightly above the coarse ground.
  for (const r of tile.roads) {
    if (r.tunnel) continue;
    const p = r.points, half = Math.max(r.width / 2, 1.5);
    const col = r.surface === 3 ? [0.55, 0.45, 0.33] : r.surface === 1 ? [0.62, 0.61, 0.58] : [0.36, 0.36, 0.37];
    for (let k = 0; k + 5 < p.length; k += 3) {
      const x0 = p[k], n0 = p[k + 1], y0 = p[k + 2] + 0.5, x1 = p[k + 3], n1 = p[k + 4], y1 = p[k + 5] + 0.5;
      const len = Math.hypot(x1 - x0, n1 - n0);
      if (len < 1e-3) continue;
      const rx = ((n1 - n0) / len) * half, rn = (-(x1 - x0) / len) * half;
      const v0 = b.vertex(x0 - rx, y0, -(n0 - rn), 0, 1, 0, 0, 0, { color: col, glow: [0] });
      const v1 = b.vertex(x0 + rx, y0, -(n0 + rn), 0, 1, 0, 0, 0, { color: col, glow: [0] });
      const v2 = b.vertex(x1 + rx, y1, -(n1 + rn), 0, 1, 0, 0, 0, { color: col, glow: [0] });
      const v3 = b.vertex(x1 - rx, y1, -(n1 - rn), 0, 1, 0, 0, 0, { color: col, glow: [0] });
      b.quad(v0, v1, v2, v3);
    }
  }

  // Lakes (flat at their water level).
  for (const e of tile.areas) {
    if (e.code !== AREA_WATER) continue;
    const m = triangulate(e);
    const base = b.vertexCount;
    for (let k = 0; k < m.vertices.length; k += 2) {
      b.vertex(m.vertices[k], e.level ?? 0, -m.vertices[k + 1], 0, 1, 0, 0, 0, { color: [0.24, 0.35, 0.36], glow: [0] });
    }
    for (let k = 0; k < m.indices.length; k += 3) {
      const [a, c, d] = [m.indices[k], m.indices[k + 1], m.indices[k + 2]];
      const v = m.vertices;
      const cross = (v[2 * c] - v[2 * a]) * (v[2 * d + 1] - v[2 * a + 1]) - (v[2 * d] - v[2 * a]) * (v[2 * c + 1] - v[2 * a + 1]);
      if (cross < 0) b.tri(base + a, base + d, base + c); else b.tri(base + a, base + c, base + d);
    }
  }

  // Buildings: prisms with a flat roof.
  for (const bl of tile.buildings) {
    const o = bl.outline, m = o.length / 2;
    if (m < 3 || Math.abs(area(o)) < MIN_AREA) continue;
    const top = bl.baseY + bl.height;
    const wall = ZONE_FAR[Math.min(Math.max(bl.zone, 1), 7) - 1];
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m;
      const x0 = o[2 * k], n0 = o[2 * k + 1], x1 = o[2 * j], n1 = o[2 * j + 1];
      const len = Math.hypot(x1 - x0, n1 - n0);
      if (len < 1e-3) continue;
      const nx = (n1 - n0) / len, nz = (x1 - x0) / len;
      const g = [0.35];
      const a0 = b.vertex(x0, bl.baseY - 1, -n0, nx, 0, nz, 0, 0, { color: wall, glow: g });
      const a1 = b.vertex(x1, bl.baseY - 1, -n1, nx, 0, nz, 0, 0, { color: wall, glow: g });
      const a2 = b.vertex(x1, top, -n1, nx, 0, nz, 0, 0, { color: wall, glow: g });
      const a3 = b.vertex(x0, top, -n0, nx, 0, nz, 0, 0, { color: wall, glow: g });
      b.quad(a0, a1, a2, a3);
    }
    const tris = earcut(Array.from(o));
    const base = b.vertexCount;
    for (let k = 0; k < m; k++) b.vertex(o[2 * k], top, -o[2 * k + 1], 0, 1, 0, 0, 0, { color: [0.66, 0.65, 0.62], glow: [0] });
    for (let t = 0; t < tris.length; t += 3) {
      let a = tris[t], c = tris[t + 1], d = tris[t + 2];
      const cross = (o[2 * c] - o[2 * a]) * (o[2 * d + 1] - o[2 * a + 1]) - (o[2 * d] - o[2 * a]) * (o[2 * c + 1] - o[2 * a + 1]);
      if (cross < 0) [c, d] = [d, c];
      b.tri(base + a, base + c, base + d);
    }
  }
  const out = b.build();
  const c = out.attrs.color[0];
  for (let k = 0; k < c.length; k++) c[k] = Math.pow(c[k], 2.2); // sRGB -> linear
  return out;
}

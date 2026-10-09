import earcut from 'earcut';
import type { MeshEntry, PolyEntry } from '../world/rtile';

/**
 * Triangulate polygons with holes and, if `cell` is given, cut every triangle on the terrain grid
 * so each piece lies inside one grid cell and can be draped exactly on the terrain mesh.
 */
export function triangulate(entry: PolyEntry, cell?: number, extent = 500): MeshEntry {
  const verts: number[] = [];
  const idx: number[] = [];
  const emit = (poly: number[]) => {
    // poly: convex x, n list -> fan.
    const n = poly.length / 2;
    if (n < 3) return;
    const base = verts.length / 2;
    for (const v of poly) verts.push(v);
    for (let k = 1; k < n - 1; k++) idx.push(base, base + k, base + k + 1);
  };
  for (const rings of entry.polygons) {
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((r, k) => {
      if (k > 0) holes.push(flat.length / 2);
      for (const v of r) flat.push(v);
    });
    const tris = earcut(flat, holes.length ? holes : undefined);
    for (let t = 0; t < tris.length; t += 3) {
      const tri = [flat[2 * tris[t]], flat[2 * tris[t] + 1], flat[2 * tris[t + 1]], flat[2 * tris[t + 1] + 1],
        flat[2 * tris[t + 2]], flat[2 * tris[t + 2] + 1]];
      if (!cell) { emit(tri); continue; }
      const xs = [tri[0], tri[2], tri[4]], ns = [tri[1], tri[3], tri[5]];
      const max = Math.round(extent / cell) - 1;
      const c0 = Math.max(0, Math.floor(Math.min(...xs) / cell)), c1 = Math.min(max, Math.floor(Math.max(...xs) / cell));
      const r0 = Math.max(0, Math.floor(Math.min(...ns) / cell)), r1 = Math.min(max, Math.floor(Math.max(...ns) / cell));
      if (c0 === c1 && r0 === r1) { emit(tri); continue; }
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const piece = clipRect(tri, c * cell, r * cell, (c + 1) * cell, (r + 1) * cell);
          if (piece.length >= 6) emit(piece);
        }
      }
    }
  }
  return { code: entry.code, level: entry.level, vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

/** Sutherland–Hodgman clip of a convex polygon (x, n pairs) to an axis-aligned rectangle. */
export function clipRect(poly: number[], x0: number, y0: number, x1: number, y1: number): number[] {
  let out = poly;
  const planes: [number, number, number][] = [[0, 1, x0], [0, -1, x1], [1, 1, y0], [1, -1, y1]];
  for (const [axis, sign, v] of planes) {
    const inp = out;
    out = [];
    const n = inp.length / 2;
    if (!n) break;
    for (let k = 0; k < n; k++) {
      const ax = inp[2 * k], ay = inp[2 * k + 1];
      const j = (k + 1) % n;
      const bx = inp[2 * j], by = inp[2 * j + 1];
      const da = sign * ((axis ? ay : ax) - v), db = sign * ((axis ? by : bx) - v);
      if (da >= 0) out.push(ax, ay);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  }
  return out;
}

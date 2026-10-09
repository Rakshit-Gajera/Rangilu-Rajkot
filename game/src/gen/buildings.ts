import earcut from 'earcut';
import { rng } from '../core/rng';
import type { Building, Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';

/** Edge kind used for the inner face of the parapet (not stored in tiles). */
export const EDGE_PARAPET = 3;
const BELOW_GROUND = 1.0; // walls extend under the ground so slopes never show gaps (PROMPT §7.8)

export interface BuildingMeshes {
  walls: GeoBuf;
  roofs: GeoBuf;
  /** Rooftop stair cabins (mumty) and black water tanks. */
  props: GeoBuf;
  /** Collision triangles (walls + roofs), tile-local. */
  collider: { position: Float32Array; index: Uint32Array };
}

function polygonArea(o: Float32Array): number {
  let a = 0;
  const n = o.length / 2;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    a += o[2 * k] * o[2 * j + 1] - o[2 * j] * o[2 * k + 1];
  }
  return a / 2;
}

function pointInPolygon(o: Float32Array, x: number, n: number): boolean {
  let inside = false;
  const m = o.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const xi = o[2 * i], ni = o[2 * i + 1], xj = o[2 * j], nj = o[2 * j + 1];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, n) to the nearest outline edge. */
function edgeDistance(o: Float32Array, x: number, n: number): number {
  let best = Infinity;
  const m = o.length / 2;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ax = o[2 * i], an = o[2 * i + 1], bx = o[2 * j], bn = o[2 * j + 1];
    const dx = bx - ax, dn = bn - an;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / (dx * dx + dn * dn || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, n - an - t * dn));
  }
  return best;
}

function box(b: Builder, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, color: number[]) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy;
  const faces: [number[], number[][]][] = [
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
  ];
  for (const [nrm, vs] of faces) {
    const ids = vs.map(([x, y, z]) => b.vertex(x, y, z, nrm[0], nrm[1], nrm[2], 0, 0, { color }));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

function cylinder(b: Builder, cx: number, y0: number, cz: number, r: number, h: number, color: number[], seg = 10) {
  const top = b.vertex(cx, y0 + h, cz, 0, 1, 0, 0, 0, { color });
  const ring: number[] = [];
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    const lo = b.vertex(cx + r * nx, y0, cz + r * nz, nx, 0, nz, 0, 0, { color });
    const hi = b.vertex(cx + r * nx, y0 + h, cz + r * nz, nx, 0, nz, 0, 0, { color });
    ring.push(lo, hi);
  }
  const caps: number[] = [];
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    caps.push(b.vertex(cx + r * Math.cos(a), y0 + h, cz + r * Math.sin(a), 0, 1, 0, 0, 0, { color }));
  }
  for (let s = 0; s < seg; s++) {
    const t = (s + 1) % seg;
    b.quad(ring[2 * s], ring[2 * s + 1], ring[2 * t + 1], ring[2 * t]);
    b.tri(top, caps[t], caps[s]);
  }
}

export function buildingMeshes(tile: Tile): BuildingMeshes {
  const walls = new Builder(true, { facade: 4, meta: 4 });
  const roofs = new Builder(true, { color: 3 });
  const props = new Builder(false, { color: 3 });
  const col = new Builder(false);

  for (const b of tile.buildings) emit(b);

  function emit(b: Building) {
    const o = b.outline;
    const m = o.length / 2;
    if (m < 3) return;
    const r = rng(b.seed);
    const parapet = 0.9 + r() * 0.2;
    const top = b.baseY + b.height;
    const roofY = top - parapet;
    const ground = b.shop ? 3.6 + r() * 0.6 : 3.1;
    const seed01 = b.seed / 4294967296;
    const yb = b.baseY - BELOW_GROUND;

    let u = 0;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m;
      const x0 = o[2 * k], n0 = o[2 * k + 1], x1 = o[2 * j], n1 = o[2 * j + 1];
      const dx = x1 - x0, dn = n1 - n0;
      const len = Math.hypot(dx, dn);
      if (len < 1e-3) continue;
      const nx = dn / len, nz = dx / len; // outward (CCW outline)
      const kind = b.edgeKinds[k];
      const facade = [b.zone, b.palette, kind, ground];
      const meta = [seed01, b.levels, roofY - b.baseY, b.shop ? 1 : 0];
      const a0 = walls.vertex(x0, yb, -n0, nx, 0, nz, u, -BELOW_GROUND, { facade, meta });
      const a1 = walls.vertex(x1, yb, -n1, nx, 0, nz, u + len, -BELOW_GROUND, { facade, meta });
      const a2 = walls.vertex(x1, top, -n1, nx, 0, nz, u + len, b.height, { facade, meta });
      const a3 = walls.vertex(x0, top, -n0, nx, 0, nz, u, b.height, { facade, meta });
      walls.quad(a0, a1, a2, a3);
      // Inner face of the parapet (faces inward), painted as plain plaster by the shader.
      const pf = [b.zone, b.palette, 3, ground];
      const p0 = walls.vertex(x0, roofY, -n0, -nx, 0, -nz, u, roofY - b.baseY, { facade: pf, meta });
      const p1 = walls.vertex(x1, roofY, -n1, -nx, 0, -nz, u + len, roofY - b.baseY, { facade: pf, meta });
      const p2 = walls.vertex(x1, top, -n1, -nx, 0, -nz, u + len, b.height, { facade: pf, meta });
      const p3 = walls.vertex(x0, top, -n0, -nx, 0, -nz, u, b.height, { facade: pf, meta });
      walls.quad(p1, p0, p3, p2);
      const c0 = col.vertex(x0, b.baseY, -n0, 0, 0, 0);
      const c1 = col.vertex(x1, b.baseY, -n1, 0, 0, 0);
      const c2 = col.vertex(x1, top, -n1, 0, 0, 0);
      const c3 = col.vertex(x0, top, -n0, 0, 0, 0);
      col.quad(c0, c1, c2, c3);
      u += len;
    }

    // Flat RCC roof. Slight grey variation per building.
    const flat = Array.from(o);
    const tris = earcut(flat);
    const g = 0.62 + r() * 0.12;
    const roofColor = [g, g * 0.98, g * 0.94];
    const base = roofs.vertexCount;
    const cbase = col.vertexCount;
    for (let k = 0; k < m; k++) {
      roofs.vertex(o[2 * k], roofY, -o[2 * k + 1], 0, 1, 0, o[2 * k], o[2 * k + 1], { color: roofColor });
      col.vertex(o[2 * k], roofY, -o[2 * k + 1], 0, 0, 0);
    }
    for (let t = 0; t < tris.length; t += 3) {
      let a = tris[t], c = tris[t + 1], d = tris[t + 2];
      // Ensure the triangle faces up: CCW in (x, n) == CCW from above in three.js.
      const cross = (o[2 * c] - o[2 * a]) * (o[2 * d + 1] - o[2 * a + 1]) -
        (o[2 * d] - o[2 * a]) * (o[2 * c + 1] - o[2 * a + 1]);
      if (cross < 0) [c, d] = [d, c];
      roofs.tri(base + a, base + c, base + d);
      col.tri(cbase + a, cbase + c, cbase + d);
    }

    // Rooftop: a black plastic water tank on nearly every roof, a stair cabin on taller ones.
    const area = Math.abs(polygonArea(o));
    if (area < 25) return;
    let cx = 0, cn = 0;
    for (let k = 0; k < m; k++) { cx += o[2 * k]; cn += o[2 * k + 1]; }
    cx /= m; cn /= m;
    const spots: [number, number][] = [];
    for (let tries = 0; tries < 8 && spots.length < 2; tries++) {
      const px = cx + (r() - 0.5) * Math.sqrt(area) * 0.7;
      const pn = cn + (r() - 0.5) * Math.sqrt(area) * 0.7;
      if (pointInPolygon(o, px, pn) && edgeDistance(o, px, pn) > 1.8) spots.push([px, pn]);
    }
    if (spots[0] && b.levels >= 2 && area > 60) {
      const [px, pn] = spots[0];
      const w = 2.4 + r() * 0.8;
      box(props, px, roofY, -pn, w, 2.6, w * (1 + r() * 0.3), [0.80 * g, 0.78 * g, 0.74 * g]);
      if (r() < 0.85) cylinder(props, px, roofY + 2.6, -pn, 0.65, 1.4, [0.07, 0.07, 0.08]);
    } else if (spots[0] && r() < 0.9) {
      const [px, pn] = spots[0];
      box(props, px, roofY, -pn, 1.6, 0.9, 1.6, [0.45, 0.45, 0.45]); // tank stand
      cylinder(props, px, roofY + 0.9, -pn, 0.6, 1.3, [0.07, 0.07, 0.08]);
    }
    if (spots[1] && area > 150 && r() < 0.5) {
      const [px, pn] = spots[1];
      cylinder(props, px, roofY, -pn, 0.55, 1.2, [0.07, 0.07, 0.08]);
    }
  }

  const c = col.build();
  return { walls: walls.build(), roofs: roofs.build(), props: props.build(), collider: { position: c.position, index: c.index } };
}

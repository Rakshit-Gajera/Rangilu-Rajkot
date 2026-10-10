import { AREA_SAND, AREA_WATER, heightAt, type MeshEntry, type RoadLine, type Tile } from '../world/rtile';
import { triangulate } from './polys';
import { Builder, type GeoBuf } from './geobuf';

const ROAD_LIFT = 0.05;
const MARK_LIFT = 0.07;
const DECK_THICK = 0.9;
const PIER_SPACING = 28;

export interface RoadMeshes {
  /** Road surfaces; attribute `surface` (0 asphalt, 1 concrete, 2 paving, 3 dirt). */
  surfaces: GeoBuf;
  markings: GeoBuf;
  /** Bridge decks, side walls and piers. */
  bridges: GeoBuf;
  bridgeCollider: { position: Float32Array; index: Uint32Array };
}

export interface AreaMeshes {
  grass: GeoBuf;
  water: GeoBuf;
  sand: GeoBuf;
}

function drape(tile: Tile, entries: MeshEntry[], lift: number, codeAttr: string | null, swx: number, swn: number,
  filter: (e: MeshEntry) => boolean = () => true, flatY?: (e: MeshEntry) => number): GeoBuf {
  const b = new Builder(true, codeAttr ? { [codeAttr]: 1 } : {});
  for (const e of entries) {
    if (!filter(e)) continue;
    const base = b.vertexCount;
    const v = e.vertices;
    for (let k = 0; k < v.length; k += 2) {
      const x = v[k], n = v[k + 1];
      const y = flatY ? flatY(e) : heightAt(tile, x, n) + lift;
      b.vertex(x, y, -n, 0, 1, 0, swx + x, swn + n, codeAttr ? { [codeAttr]: [e.code] } : undefined);
    }
    const idx = e.indices;
    for (let k = 0; k < idx.length; k += 3) {
      let a = idx[k], c = idx[k + 1], d = idx[k + 2];
      const cross = (v[2 * c] - v[2 * a]) * (v[2 * d + 1] - v[2 * a + 1]) - (v[2 * d] - v[2 * a]) * (v[2 * c + 1] - v[2 * a + 1]);
      if (cross < 0) [c, d] = [d, c];
      b.tri(base + a, base + c, base + d);
    }
  }
  return b.build();
}

/** Ribbon along a polyline at a lateral offset; dash = [on, off] metres or null for solid. */
function ribbon(b: Builder, p: Float32Array, offset: number, half: number, lift: number, dash: [number, number] | null,
  color: number[]) {
  const n = p.length / 3;
  let s = 0;
  for (let k = 0; k < n - 1; k++) {
    const x0 = p[3 * k], n0 = p[3 * k + 1], y0 = p[3 * k + 2];
    const x1 = p[3 * k + 3], n1 = p[3 * k + 4], y1 = p[3 * k + 5];
    const len = Math.hypot(x1 - x0, n1 - n0);
    if (len < 1e-3) continue;
    const ux = (x1 - x0) / len, un = (n1 - n0) / len;
    const rx = un, rn = -ux; // right-hand normal in (x, n)
    let t = 0;
    while (t < len) {
      let t1 = len;
      if (dash) {
        const period = dash[0] + dash[1];
        const phase = (s + t) % period;
        if (phase >= dash[0]) { t += period - phase; continue; }
        t1 = Math.min(len, t + dash[0] - phase);
      }
      const a = t / len, c = t1 / len;
      const ax = x0 + (x1 - x0) * a, an = n0 + (n1 - n0) * a, ay = y0 + (y1 - y0) * a + lift;
      const cx = x0 + (x1 - x0) * c, cn = n0 + (n1 - n0) * c, cy = y0 + (y1 - y0) * c + lift;
      const o1 = offset - half, o2 = offset + half;
      const v0 = b.vertex(ax + rx * o1, ay, -(an + rn * o1), 0, 1, 0, 0, 0, { color });
      const v1 = b.vertex(ax + rx * o2, ay, -(an + rn * o2), 0, 1, 0, 0, 0, { color });
      const v2 = b.vertex(cx + rx * o2, cy, -(cn + rn * o2), 0, 1, 0, 0, 0, { color });
      const v3 = b.vertex(cx + rx * o1, cy, -(cn + rn * o1), 0, 1, 0, 0, 0, { color });
      // v0/v1 left/right at the start, v2/v3 right/left at the end: this order faces up.
      b.quad(v0, v1, v2, v3);
      t = t1;
    }
    s += len;
  }
}

function inRing(ring: Float32Array, x: number, n: number): boolean {
  let inside = false;
  const m = ring.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const xi = ring[2 * i], ni = ring[2 * i + 1], xj = ring[2 * j], nj = ring[2 * j + 1];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) inside = !inside;
  }
  return inside;
}

/** Split a road polyline (x, n, y triples) into the runs that lie outside chowk islands. */
function outsideIslands(tile: Tile, p: Float32Array): Float32Array[] {
  const islands = tile.chowks.filter((c) => c.island).map((c) => c.ring);
  if (!islands.length) return [p];
  const runs: Float32Array[] = [];
  let start = -1;
  const n = p.length / 3;
  for (let k = 0; k <= n; k++) {
    const out = k < n && !islands.some((r) => inRing(r, p[3 * k], p[3 * k + 1]));
    if (out && start < 0) start = k;
    if (!out && start >= 0) {
      if (k - start >= 2) runs.push(p.slice(3 * start, 3 * k));
      start = -1;
    }
  }
  return runs;
}

function markings(tile: Tile): GeoBuf {
  const b = new Builder(false, { color: 3 });
  const white = [0.92, 0.92, 0.88];
  const yellow = [0.95, 0.75, 0.15];
  for (const r of tile.roads) {
    if (r.tunnel || r.rank < 5) continue;
    const lift = r.bridge ? 0.02 : MARK_LIFT - ROAD_LIFT;
    for (const p of outsideIslands(tile, r.bridge ? r.points : liftToGround(tile, r))) {
      if (!r.oneway) ribbon(b, p, 0, 0.08, lift + ROAD_LIFT, r.rank >= 7 ? null : [3, 5], r.rank >= 7 ? yellow : white);
      if (r.rank >= 6 && r.width >= 9) {
        const edge = r.width / 2 - 0.5;
        ribbon(b, p, edge, 0.075, lift + ROAD_LIFT, null, white);
        ribbon(b, p, -edge, 0.075, lift + ROAD_LIFT, null, white);
      }
    }
  }
  return b.build();
}

/** Road points with y re-sampled from this tile's grid so markings sit exactly on the draped surface. */
function liftToGround(tile: Tile, r: RoadLine): Float32Array {
  const p = r.points.slice();
  for (let k = 0; k < p.length; k += 3) p[k + 2] = heightAt(tile, p[k], p[k + 1]);
  return p;
}

function bridges(tile: Tile): { mesh: GeoBuf; collider: { position: Float32Array; index: Uint32Array } } {
  const b = new Builder(false, { color: 3 });
  const col = new Builder(false);
  const concrete = [0.72, 0.71, 0.68];
  const deckTop = [0.25, 0.25, 0.26];
  for (const r of tile.roads) {
    if (!r.bridge) continue;
    const p = r.points;
    const n = p.length / 3;
    const half = r.width / 2 + 0.6;
    let s = 0;
    for (let k = 0; k < n - 1; k++) {
      const x0 = p[3 * k], n0 = p[3 * k + 1], y0 = p[3 * k + 2];
      const x1 = p[3 * k + 3], n1 = p[3 * k + 4], y1 = p[3 * k + 5];
      const len = Math.hypot(x1 - x0, n1 - n0);
      if (len < 1e-3) continue;
      const rx = (n1 - n0) / len, rn = -(x1 - x0) / len;
      const L = (o: number, x: number, nn: number) => [x + rx * o, -(nn + rn * o)];
      const [ax, az] = L(-half, x0, n0), [bx, bz] = L(half, x0, n0);
      const [cx, cz] = L(half, x1, n1), [dx, dz] = L(-half, x1, n1);
      const top = [b.vertex(ax, y0 + ROAD_LIFT, az, 0, 1, 0, 0, 0, { color: deckTop }),
        b.vertex(bx, y0 + ROAD_LIFT, bz, 0, 1, 0, 0, 0, { color: deckTop }),
        b.vertex(cx, y1 + ROAD_LIFT, cz, 0, 1, 0, 0, 0, { color: deckTop }),
        b.vertex(dx, y1 + ROAD_LIFT, dz, 0, 1, 0, 0, 0, { color: deckTop })];
      b.quad(top[0], top[1], top[2], top[3]);
      const ct = [col.vertex(ax, y0, az, 0, 0, 0), col.vertex(bx, y0, bz, 0, 0, 0), col.vertex(cx, y1, cz, 0, 0, 0), col.vertex(dx, y1, dz, 0, 0, 0)];
      col.quad(ct[0], ct[1], ct[2], ct[3]);
      // Side walls: crash barrier above the deck and the deck edge below.
      for (const [sx0, sz0, sx1, sz1, sgn] of [[ax, az, dx, dz, -1], [bx, bz, cx, cz, 1]] as const) {
        const nx = rx * sgn, nz = -rn * sgn;
        const v = [b.vertex(sx0, y0 - DECK_THICK, sz0, nx, 0, nz, 0, 0, { color: concrete }),
          b.vertex(sx1, y1 - DECK_THICK, sz1, nx, 0, nz, 0, 0, { color: concrete }),
          b.vertex(sx1, y1 + 0.9, sz1, nx, 0, nz, 0, 0, { color: concrete }),
          b.vertex(sx0, y0 + 0.9, sz0, nx, 0, nz, 0, 0, { color: concrete })];
        if (sgn > 0) b.quad(v[0], v[1], v[2], v[3]); else b.quad(v[1], v[0], v[3], v[2]);
        const cv = [col.vertex(sx0, y0, sz0, 0, 0, 0), col.vertex(sx1, y1, sz1, 0, 0, 0),
          col.vertex(sx1, y1 + 0.9, sz1, 0, 0, 0), col.vertex(sx0, y0 + 0.9, sz0, 0, 0, 0)];
        col.quad(cv[0], cv[1], cv[2], cv[3]);
      }
      // Underside.
      const bot = [b.vertex(ax, y0 - DECK_THICK, az, 0, -1, 0, 0, 0, { color: concrete }),
        b.vertex(bx, y0 - DECK_THICK, bz, 0, -1, 0, 0, 0, { color: concrete }),
        b.vertex(cx, y1 - DECK_THICK, cz, 0, -1, 0, 0, 0, { color: concrete }),
        b.vertex(dx, y1 - DECK_THICK, dz, 0, -1, 0, 0, 0, { color: concrete })];
      b.quad(bot[0], bot[3], bot[2], bot[1]);
      // Piers where the deck is well above the ground.
      const first = Math.ceil(s / PIER_SPACING) * PIER_SPACING;
      for (let t = first; t < s + len; t += PIER_SPACING) {
        const f = (t - s) / len;
        const px = x0 + (x1 - x0) * f, pn = n0 + (n1 - n0) * f, py = y0 + (y1 - y0) * f;
        const gy = heightAt(tile, px, pn);
        if (py - gy < 2.5) continue;
        pier(b, px, gy - 0.5, -pn, py - DECK_THICK, concrete);
      }
      s += len;
    }
  }
  const c = col.build();
  return { mesh: b.build(), collider: { position: c.position, index: c.index } };
}

function pier(b: Builder, x: number, y0: number, z: number, y1: number, color: number[]) {
  const w = 0.7;
  const faces: [number, number, number, number[][]][] = [
    [0, 0, 1, [[x - w, y0, z + w], [x + w, y0, z + w], [x + w, y1, z + w], [x - w, y1, z + w]]],
    [0, 0, -1, [[x + w, y0, z - w], [x - w, y0, z - w], [x - w, y1, z - w], [x + w, y1, z - w]]],
    [1, 0, 0, [[x + w, y0, z + w], [x + w, y0, z - w], [x + w, y1, z - w], [x + w, y1, z + w]]],
    [-1, 0, 0, [[x - w, y0, z - w], [x - w, y0, z + w], [x - w, y1, z + w], [x - w, y1, z - w]]],
  ];
  for (const [nx, ny, nz, vs] of faces) {
    const ids = vs.map(([vx, vy, vz]) => b.vertex(vx, vy, vz, nx, ny, nz, 0, 0, { color }));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

export function roadMeshes(tile: Tile, swx: number, swn: number): RoadMeshes {
  const br = bridges(tile);
  return {
    surfaces: drape(tile, tile.roadSurfaces.map((e) => triangulate(e, 10)), ROAD_LIFT, 'surface', swx, swn),
    markings: markings(tile),
    bridges: br.mesh,
    bridgeCollider: br.collider,
  };
}

export function areaMeshes(tile: Tile, swx: number, swn: number): AreaMeshes {
  // Water is a flat surface (no grid split); grass and riverbeds follow the ground.
  const areas = tile.areas.map((e) => triangulate(e, e.code === AREA_WATER ? undefined : 10));
  return {
    grass: drape(tile, areas, 0.025, null, swx, swn, (e) => e.code !== AREA_WATER && e.code !== AREA_SAND),
    water: drape(tile, areas, 0, null, swx, swn, (e) => e.code === AREA_WATER, (e) => e.level ?? 0),
    sand: drape(tile, areas, 0.015, null, swx, swn, (e) => e.code === AREA_SAND),
  };
}

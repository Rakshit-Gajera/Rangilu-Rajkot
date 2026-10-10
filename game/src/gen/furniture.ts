import { hash01 } from '../core/rng';
import { heightAt, type RoadLine, type Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';
import { box, segment, type V3 } from './prims';

/** Street furniture generated from road centrelines (PROMPT §7.7 furniture points). Colours are sRGB. */
const LIGHT_POLE = [0.55, 0.57, 0.58];
const LAMP_HEAD = [0.3, 0.3, 0.32];
const LAMP_GLOW = [1.0, 0.86, 0.62];
const CONCRETE_POLE = [0.68, 0.67, 0.64];
const WIRE = [0.08, 0.08, 0.08];
const LIGHT_SPACING = 32;
const POLE_SPACING = 35;
const CLEAR_ENDS = 12; // keep junctions clear

export interface FurnitureMeshes {
  solid: GeoBuf;
  lamps: GeoBuf;
  /** Ground quads under lamps (uv 0..1 across the pool) for the additive light-pool material. */
  pools: GeoBuf;
  /** Poles as collision boxes. */
  collider: { position: Float32Array; index: Uint32Array };
}

/** Points every `spacing` metres along a polyline (x, n), with the direction there. */
function along(p: Float32Array, spacing: number, phase: number) {
  const out: { x: number; n: number; dx: number; dn: number }[] = [];
  let s = 0, next = CLEAR_ENDS + phase;
  const n = p.length / 3;
  let total = 0;
  for (let k = 0; k < n - 1; k++) total += Math.hypot(p[3 * k + 3] - p[3 * k], p[3 * k + 4] - p[3 * k + 1]);
  for (let k = 0; k < n - 1; k++) {
    const x0 = p[3 * k], n0 = p[3 * k + 1], x1 = p[3 * k + 3], n1 = p[3 * k + 4];
    const len = Math.hypot(x1 - x0, n1 - n0);
    if (len < 1e-3) continue;
    while (next <= s + len && next <= total - CLEAR_ENDS) {
      const t = (next - s) / len;
      out.push({ x: x0 + (x1 - x0) * t, n: n0 + (n1 - n0) * t, dx: (x1 - x0) / len, dn: (n1 - n0) / len });
      next += spacing;
    }
    s += len;
  }
  return out;
}

const inTile = (x: number, n: number) => x >= 0 && x < 500 && n >= 0 && n < 500;

export function furnitureMeshes(tile: Tile): FurnitureMeshes {
  const solid = new Builder(false, { color: 3 });
  const lamps = new Builder(false, { color: 3 });
  const pools = new Builder(true);
  const col = new Builder(false);
  const islands = tile.chowks.filter((c) => c.island);
  const nearIsland = (x: number, n: number) => islands.some((c) => Math.hypot(c.x - x, c.n - n) < 30);

  for (const r of tile.roads) {
    if (r.bridge || r.tunnel) continue;
    const phase = hash01(r.points.length * 7919 + Math.round(r.points[0] * 10)) * 10;
    if (r.rank >= 5) streetLights(r, phase);
    else if (r.rank >= 3 && r.surface !== 3) electricPoles(r, phase);
  }
  const c = col.build();
  return { solid: solid.build(), lamps: lamps.build(), pools: pools.build(), collider: { position: c.position, index: c.index } };

  function poleCollider(x: number, y: number, z: number, h: number) {
    box(col, x, y, z, 0.35, h, 0.35, [0, 0, 0]);
  }

  function streetLights(r: RoadLine, phase: number) {
    let side = 1;
    for (const p of along(r.points, LIGHT_SPACING, phase)) {
      side = -side; // alternate sides, as on Rajkot's main roads
      const off = r.width / 2 + 0.7;
      const px = p.x + side * p.dn * off, pn = p.n - side * p.dx * off;
      if (!inTile(px, pn) || nearIsland(px, pn)) continue;
      const y = heightAt(tile, px, pn);
      const x = px, z = -pn;
      segment(solid, [x, y, z], [x, y + 8.5, z], 0.11, 0.07, LIGHT_POLE, 6);
      // Arm reaching over the road, with the lamp head at its end.
      const ax = x - side * p.dn * 1.8, az = z - side * p.dx * 1.8;
      segment(solid, [x, y + 8.3, z], [ax, y + 8.7, az], 0.05, 0.05, LIGHT_POLE, 4, false);
      box(solid, ax, y + 8.45, az, 0.7, 0.18, 0.32, LAMP_HEAD, Math.atan2(p.dx, p.dn));
      box(lamps, ax, y + 8.4, az, 0.55, 0.06, 0.24, LAMP_GLOW, Math.atan2(p.dx, p.dn));
      // Pool of light on the road under the lamp (follows the ground at its corners).
      const R = 9;
      const corners = [[-R, -R, 0, 0], [R, -R, 1, 0], [R, R, 1, 1], [-R, R, 0, 1]].map(([dx, dz, u, v]) => {
        const gx = ax + dx, gz = az + dz;
        return pools.vertex(gx, heightAt(tile, gx, -gz) + 0.12, gz, 0, 1, 0, u, v);
      });
      pools.quad(corners[0], corners[3], corners[2], corners[1]);
      poleCollider(x, y, z, 8.5);
    }
  }

  function electricPoles(r: RoadLine, phase: number) {
    // Concrete poles on one side with three sagging wires between neighbours.
    const off = r.width / 2 + 0.9;
    const side = hash01(Math.round(r.points[1] * 10)) < 0.5 ? 1 : -1;
    let prev: V3 | null = null;
    for (const p of along(r.points, POLE_SPACING, phase)) {
      const px = p.x + side * p.dn * off, pn = p.n - side * p.dx * off;
      if (!inTile(px, pn) || nearIsland(px, pn)) { prev = null; continue; }
      const y = heightAt(tile, px, pn);
      const top: V3 = [px, y + 8.2, -pn];
      segment(solid, [px, y, -pn], top, 0.14, 0.09, CONCRETE_POLE, 4);
      box(solid, px, y + 7.6, -pn, 1.4, 0.1, 0.1, CONCRETE_POLE, Math.atan2(p.dx, p.dn) + Math.PI / 2);
      poleCollider(px, y, -pn, 8.2);
      if (prev) {
        for (const k of [-0.6, 0, 0.6]) {
          const a: V3 = [prev[0] + p.dn * k, prev[1] - 0.5, prev[2] + p.dx * k];
          const b: V3 = [top[0] + p.dn * k, top[1] - 0.5, top[2] + p.dx * k];
          // Sag: two straight halves dipping 0.7 m at the middle.
          const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.7, (a[2] + b[2]) / 2];
          segment(solid, a, mid, 0.012, 0.012, WIRE, 3, false);
          segment(solid, mid, b, 0.012, 0.012, WIRE, 3, false);
        }
      }
      prev = top;
    }
  }
}

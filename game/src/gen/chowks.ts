import earcut from 'earcut';
import { rng } from '../core/rng';
import {
  CHOWK_FLAG, CHOWK_FOUNTAIN, CHOWK_GARDEN, CHOWK_SCULPTURE, CHOWK_STATUE, type Chowk, type Tile,
} from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';
import { box, cylinder, segment, sphere, type V3 } from './prims';

/** Colours are sRGB (converted to linear in gen/tile.ts). */
const KERB_BLACK = [0.08, 0.08, 0.08];
const KERB_YELLOW = [0.95, 0.76, 0.1];
const GRASS = [0.36, 0.5, 0.2];
const MARBLE = [0.9, 0.87, 0.8];
const MARBLE_DARK = [0.72, 0.69, 0.63];
const BRONZE = [0.42, 0.3, 0.17];
const SAFFRON = [1.0, 0.6, 0.2];
const INDIA_GREEN = [0.07, 0.53, 0.03];
const NAVY = [0.0, 0.0, 0.5];
const WATER = [0.42, 0.66, 0.8];
const LAMP_POLE = [0.12, 0.16, 0.13];
const LAMP_GLASS = [1.0, 0.92, 0.7];
const MARIGOLD = [[1.0, 0.6, 0.05], [1.0, 0.8, 0.1], [0.85, 0.15, 0.2], [1.0, 1.0, 0.95]];

export interface ChowkMeshes {
  /** Kerbs, plinths, basins and statues: also used for collision. */
  solid: GeoBuf;
  /** Grass, flowers, water, flags and lamp posts (no collision). */
  deco: GeoBuf;
  /** Lamp glass that glows at night. */
  lamps: GeoBuf;
}

/** Statue subjects (see rtile.ts Chowk.subject). */
const S_GANDHI = 1, S_INDIRA = 2, S_VIVEKANANDA = 3, S_HANUMAN = 4, S_PATEL = 5, S_AMBEDKAR = 6;

export function chowkMeshes(tile: Tile): ChowkMeshes {
  const solid = new Builder(false, { color: 3 });
  const deco = new Builder(false, { color: 3 });
  const lamps = new Builder(false, { color: 3 });
  for (const c of tile.chowks) emit(c, solid, deco, lamps);
  return { solid: solid.build(), deco: deco.build(), lamps: lamps.build() };
}

function ccw(ring: Float32Array): Float32Array {
  let a = 0;
  const m = ring.length / 2;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    a += ring[2 * k] * ring[2 * j + 1] - ring[2 * j] * ring[2 * k + 1];
  }
  if (a >= 0) return ring;
  const out = new Float32Array(ring.length);
  for (let k = 0; k < m; k++) {
    out[2 * k] = ring[2 * (m - 1 - k)];
    out[2 * k + 1] = ring[2 * (m - 1 - k) + 1];
  }
  return out;
}

function emit(c: Chowk, solid: Builder, deco: Builder, lamps: Builder) {
  const r = rng(c.seed);
  const ring = ccw(c.ring);
  const m = ring.length / 2;
  let area = 0;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    area += ring[2 * k] * ring[2 * j + 1] - ring[2 * j] * ring[2 * k + 1];
  }
  const radius = Math.sqrt(Math.abs(area / 2) / Math.PI);
  const cx = c.x, cz = -c.n;
  const top = c.y + 0.3;
  // Face one of the four main directions (statues usually face the busiest road; we don't know which).
  const yaw = Math.floor(r() * 4) * (Math.PI / 2);

  if (c.island) {
    // Kerb painted in alternating black and yellow bands, about a metre each.
    let band = 0;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m;
      const x0 = ring[2 * k], n0 = ring[2 * k + 1], x1 = ring[2 * j], n1 = ring[2 * j + 1];
      const len = Math.hypot(x1 - x0, n1 - n0);
      const pieces = Math.max(1, Math.round(len));
      for (let q = 0; q < pieces; q++) {
        const a = q / pieces, b = (q + 1) / pieces;
        const ax = x0 + (x1 - x0) * a, an = n0 + (n1 - n0) * a, bx = x0 + (x1 - x0) * b, bn = n0 + (n1 - n0) * b;
        const col = band++ % 2 ? KERB_YELLOW : KERB_BLACK;
        // Outward wall (outline is counter-clockwise in x/north, so outward is to the right of travel).
        quadWall(solid, [ax, c.y - 0.3, -an], [bx, c.y - 0.3, -bn], [bx, top, -bn], [ax, top, -an], col);
      }
    }
    // Garden top.
    const tris = earcut(Array.from(ring));
    const base = deco.vertexCount;
    for (let k = 0; k < m; k++) deco.vertex(ring[2 * k], top - 0.02, -ring[2 * k + 1], 0, 1, 0, 0, 0, { color: GRASS });
    for (let t = 0; t < tris.length; t += 3) {
      let a = tris[t], b = tris[t + 1], d = tris[t + 2];
      const cr = (ring[2 * b] - ring[2 * a]) * (ring[2 * d + 1] - ring[2 * a + 1]) - (ring[2 * d] - ring[2 * a]) * (ring[2 * b + 1] - ring[2 * a + 1]);
      if (cr < 0) [b, d] = [d, b];
      deco.tri(base + a, base + b, base + d);
    }
    // Marigold border just inside the kerb.
    if (radius > 4) {
      for (let k = 0; k < m; k++) {
        const j = (k + 1) % m;
        const x0 = ring[2 * k], n0 = ring[2 * k + 1], x1 = ring[2 * j], n1 = ring[2 * j + 1];
        const len = Math.hypot(x1 - x0, n1 - n0);
        for (let s = 0.35; s < len; s += 0.7) {
          const t = s / len;
          const px = x0 + (x1 - x0) * t, pn = n0 + (n1 - n0) * t;
          const ix = cx + (px - cx) * (1 - 0.9 / radius), iz = -(c.n + (pn - c.n) * (1 - 0.9 / radius));
          sphere(deco, [ix, top + 0.1, iz], 0.22, MARIGOLD[Math.floor(r() * MARIGOLD.length)], 0.8, 6);
        }
      }
    }
    // Decorative lamp posts around big circles.
    if (radius > 9) {
      for (let k = 0; k < 4; k++) {
        const a = yaw + Math.PI / 4 + (k * Math.PI) / 2;
        const lx = cx + Math.cos(a) * (radius - 1.8), lz = cz + Math.sin(a) * (radius - 1.8);
        cylinder(deco, lx, top, lz, 0.09, 4.6, LAMP_POLE, 6, 0.06);
        cylinder(deco, lx, top + 4.6, lz, 0.22, 0.1, LAMP_POLE, 8);
        sphere(lamps, [lx, top + 4.95, lz], 0.28, LAMP_GLASS, 1.2, 8);
      }
    }
  }

  const g = c.island ? top : c.y;
  switch (c.kind) {
    case CHOWK_STATUE: statue(solid, cx, g, cz, yaw, c.subject); break;
    case CHOWK_FOUNTAIN: fountain(solid, deco, cx, g, cz, Math.min(radius * 0.45, 6.5)); break;
    case CHOWK_SCULPTURE: sculpture(solid, cx, g, cz, Math.min(radius * 0.35, 4), r); break;
    case CHOWK_FLAG: flag(solid, deco, cx, g, cz, yaw); break;
    case CHOWK_GARDEN:
    default:
      if (radius > 3) {
        sphere(deco, [cx, g + 0.7, cz], Math.min(radius * 0.3, 2.2), [0.22, 0.42, 0.16], 0.55, 10);
      }
  }
}

function quadWall(b: Builder, a: V3, c1: V3, c2: V3, d: V3, color: number[]) {
  // Normal: outward, horizontal.
  const dx = c1[0] - a[0], dz = c1[2] - a[2], l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l, nz = dx / l;
  const i0 = b.vertex(a[0], a[1], a[2], nx, 0, nz, 0, 0, { color });
  const i1 = b.vertex(c1[0], c1[1], c1[2], nx, 0, nz, 0, 0, { color });
  const i2 = b.vertex(c2[0], c2[1], c2[2], nx, 0, nz, 0, 0, { color });
  const i3 = b.vertex(d[0], d[1], d[2], nx, 0, nz, 0, 0, { color });
  // a -> c1 along the bottom, then up: the geometric normal matches (nx, 0, nz).
  b.quad(i0, i1, i2, i3);
}

/** Stepped marble plinth; returns the top height. */
function plinth(b: Builder, cx: number, y: number, cz: number, w: number, h: number, yaw: number): number {
  box(b, cx, y, cz, w + 1.2, 0.35, w + 1.2, MARBLE_DARK, yaw);
  box(b, cx, y + 0.35, cz, w + 0.6, 0.3, w + 0.6, MARBLE, yaw);
  box(b, cx, y + 0.65, cz, w, h, w, MARBLE, yaw);
  box(b, cx, y + 0.65 + h, cz, w + 0.3, 0.25, w + 0.3, MARBLE_DARK, yaw);
  return y + 0.9 + h;
}

/** Procedural statue of the subject on a plinth, facing `yaw`. */
function statue(solid: Builder, cx: number, y: number, cz: number, yaw: number, subject: number) {
  const big = subject === S_HANUMAN;
  const H = big ? 6.4 : 3.2; // the Hanumanji statue is 21 feet; others a little over life size, as at chowks
  const top = plinth(solid, cx, y, cz, big ? 3.2 : 1.8, big ? 1.4 : 2.4, yaw);
  const f: V3 = [Math.sin(yaw), 0, -Math.cos(yaw)]; // forward
  const rt: V3 = [Math.cos(yaw), 0, Math.sin(yaw)]; // right
  const s = H / 1.75;
  const P = (lat: number, up: number, fwd: number): V3 =>
    [cx + rt[0] * lat * s + f[0] * fwd * s, top + up * s, cz + rt[2] * lat * s + f[2] * fwd * s];
  const col = subject === S_HANUMAN ? [0.9, 0.38, 0.1] : BRONZE;
  const seg = (a: V3, b: V3, r0: number, r1 = r0) => segment(solid, a, b, r0 * s, r1 * s, col, 8);

  // Legs (walking stride for Gandhi).
  const stride = subject === S_GANDHI ? 0.18 : 0.04;
  seg(P(-0.09, 0.9, 0), P(-0.1, 0.05, stride), 0.07, 0.05);
  seg(P(0.09, 0.9, 0), P(0.1, 0.05, -stride), 0.07, 0.05);
  box(solid, ...P(-0.1, 0, stride + 0.05), 0.11 * s, 0.06 * s, 0.24 * s, col, Math.atan2(f[0], -f[2]));
  box(solid, ...P(0.1, 0, -stride + 0.05), 0.11 * s, 0.06 * s, 0.24 * s, col, Math.atan2(f[0], -f[2]));
  // Clothing: dhoti, saree, robes.
  if (subject === S_GANDHI) seg(P(0, 0.95, 0), P(0, 0.5, 0.02), 0.17, 0.2);
  if (subject === S_INDIRA) seg(P(0, 1.0, 0), P(0, 0.02, 0), 0.17, 0.32);
  if (subject === S_VIVEKANANDA || subject === S_PATEL) seg(P(0, 1.4, 0), P(0, 0.05, 0), 0.19, 0.33);
  // Torso and head.
  const torsoR = subject === S_HANUMAN ? 0.22 : 0.16;
  seg(P(0, 0.92, 0), P(0, 1.42, 0), torsoR * 0.9, torsoR);
  segment(solid, P(0, 1.42, 0), P(0, 1.5, 0), 0.06 * s, 0.06 * s, col, 6);
  sphere(solid, P(0, 1.6, 0.01), 0.11 * s, col, 1.1, 8);
  if (subject === S_VIVEKANANDA) sphere(solid, P(0, 1.67, 0), 0.14 * s, col, 0.6, 10); // turban
  if (subject === S_HANUMAN) segment(solid, P(0, 1.7, 0), P(0, 1.86, 0), 0.1 * s, 0.03 * s, [0.95, 0.75, 0.2], 8); // crown
  // Arms by pose.
  const shL = P(-0.21, 1.38, 0), shR = P(0.21, 1.38, 0);
  switch (subject) {
    case S_GANDHI: { // walking with his staff in the right hand
      seg(shL, P(-0.25, 0.95, -0.12), 0.045, 0.04);
      seg(shR, P(0.28, 1.0, 0.2), 0.045, 0.04);
      segment(solid, P(0.3, 0.02, 0.32), P(0.27, 1.75, 0.18), 0.018 * s, 0.018 * s, col, 6);
      break;
    }
    case S_INDIRA: { // right arm raised in greeting
      seg(shL, P(-0.26, 0.98, 0.05), 0.045, 0.04);
      seg(shR, P(0.32, 1.85, 0.08), 0.045, 0.04);
      break;
    }
    case S_VIVEKANANDA: { // arms folded across the chest
      seg(shL, P(-0.16, 1.2, 0.16), 0.05);
      seg(shR, P(0.16, 1.2, 0.16), 0.05);
      seg(P(-0.17, 1.22, 0.17), P(0.17, 1.22, 0.17), 0.045);
      break;
    }
    case S_HANUMAN: { // gada (mace) resting on the right shoulder
      seg(shL, P(-0.32, 1.0, 0.08), 0.07, 0.06);
      seg(shR, P(0.3, 1.25, 0.18), 0.07, 0.06);
      segment(solid, P(0.3, 1.2, 0.2), P(0.36, 1.9, -0.2), 0.03 * s, 0.03 * s, [0.95, 0.75, 0.2], 6);
      sphere(solid, P(0.37, 1.95, -0.23), 0.13 * s, [0.95, 0.75, 0.2], 1, 10);
      break;
    }
    case S_AMBEDKAR: { // book in the left hand, right hand pointing ahead
      seg(shL, P(-0.24, 1.1, 0.14), 0.045, 0.04);
      box(solid, ...P(-0.24, 1.02, 0.18), 0.05 * s, 0.22 * s, 0.16 * s, col, Math.atan2(f[0], -f[2]));
      seg(shR, P(0.3, 1.55, 0.42), 0.045, 0.04);
      break;
    }
    default:
      seg(shL, P(-0.25, 0.98, 0.02), 0.045, 0.04);
      seg(shR, P(0.25, 0.98, 0.02), 0.045, 0.04);
  }
}

function fountain(solid: Builder, deco: Builder, cx: number, y: number, cz: number, R: number) {
  cylinder(solid, cx, y - 0.1, cz, R, 0.7, MARBLE, 24);
  cylinder(deco, cx, y + 0.5, cz, R - 0.35, 0.05, WATER, 24);
  cylinder(solid, cx, y + 0.55, cz, 0.3, 2.4, MARBLE, 10);
  segment(solid, [cx, y + 1.45, cz], [cx, y + 1.8, cz], 0.3, Math.min(R * 0.45, 1.6), MARBLE, 16);
  segment(solid, [cx, y + 2.45, cz], [cx, y + 2.7, cz], 0.2, Math.min(R * 0.25, 0.9), MARBLE, 12);
  // Water: the jet and the sheets falling from the bowls.
  segment(deco, [cx, y + 2.95, cz], [cx, y + 4.2, cz], 0.12, 0.02, WATER, 8);
  segment(deco, [cx, y + 1.81, cz], [cx, y + 0.56, cz], Math.min(R * 0.45, 1.6) + 0.05, Math.min(R * 0.45, 1.6) + 0.3, WATER, 16, false);
  segment(deco, [cx, y + 2.71, cz], [cx, y + 1.82, cz], Math.min(R * 0.25, 0.9) + 0.03, Math.min(R * 0.25, 0.9) + 0.2, WATER, 12, false);
}

function sculpture(solid: Builder, cx: number, y: number, cz: number, R: number, r: () => number) {
  const palette = [[0.85, 0.86, 0.88], [0.8, 0.15, 0.12], [0.95, 0.7, 0.1], [0.15, 0.35, 0.65]];
  const col = palette[Math.floor(r() * palette.length)];
  box(solid, cx, y, cz, R * 0.9, 0.6, R * 0.9, MARBLE_DARK, r() * Math.PI);
  const style = Math.floor(r() * 3);
  if (style === 0) {
    // Three leaning blades meeting at the top.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + r();
      segment(solid, [cx + Math.cos(a) * R * 0.35, y + 0.6, cz + Math.sin(a) * R * 0.35], [cx, y + 0.6 + R * 1.8, cz],
        0.18, 0.05, col, 4);
    }
  } else if (style === 1) {
    // Stacked rotated blocks.
    let h = y + 0.6;
    for (let k = 0; k < 4; k++) {
      const s = R * (0.55 - k * 0.1);
      box(solid, cx, h, cz, s, s * 0.7, s, col, k * 0.4 + r());
      h += s * 0.7;
    }
  } else {
    // A ring standing on edge.
    const a0 = r() * Math.PI, rr = R * 0.7;
    const pts: V3[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = (k / 16) * Math.PI * 2;
      pts.push([cx + Math.cos(a0) * Math.cos(t) * rr, y + 0.6 + rr + Math.sin(t) * rr, cz + Math.sin(a0) * Math.cos(t) * rr]);
    }
    for (let k = 0; k < 16; k++) segment(solid, pts[k], pts[k + 1], 0.16, 0.16, col, 6, false);
  }
}

function flag(solid: Builder, deco: Builder, cx: number, y: number, cz: number, yaw: number) {
  box(solid, cx, y, cz, 1.6, 0.5, 1.6, MARBLE, yaw);
  cylinder(solid, cx, y + 0.5, cz, 0.08, 9.5, [0.92, 0.92, 0.92], 8, 0.05);
  // Tricolour, 2.7 x 1.8 m, flying from the top of the pole.
  const w = 2.7, h = 0.6, f: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const fy = y + 9.9;
  [SAFFRON, [0.97, 0.97, 0.97], INDIA_GREEN].forEach((col, k) => {
    box(deco, cx + f[0] * (w / 2 + 0.08), fy - h * (k + 1), cz + f[2] * (w / 2 + 0.08), w, h, 0.04, col, yaw);
  });
  segment(deco, [cx + f[0] * (w / 2 + 0.08), fy - 0.9, cz + f[2] * (w / 2 + 0.08)],
    [cx + f[0] * (w / 2 + 0.08) + Math.sin(yaw) * 0.03, fy - 0.9, cz + f[2] * (w / 2 + 0.08) - Math.cos(yaw) * 0.03],
    0.25, 0.25, NAVY, 12);
}

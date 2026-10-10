import type { Builder } from './geobuf';

/** Small procedural shape helpers for props, statues and kerbs. Builders must have a `color` (3) attribute. */

export type V3 = [number, number, number];
type Col = number[];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Flat-shaded quad (a, b, c, d counter-clockwise seen from the front). */
export function quad(b: Builder, a: V3, c1: V3, c2: V3, d: V3, color: Col, extra?: Record<string, number[]>) {
  const n = norm(cross(sub(c1, a), sub(d, a)));
  const attrs = { color, ...extra };
  const i0 = b.vertex(a[0], a[1], a[2], n[0], n[1], n[2], 0, 0, attrs);
  const i1 = b.vertex(c1[0], c1[1], c1[2], n[0], n[1], n[2], 0, 0, attrs);
  const i2 = b.vertex(c2[0], c2[1], c2[2], n[0], n[1], n[2], 0, 0, attrs);
  const i3 = b.vertex(d[0], d[1], d[2], n[0], n[1], n[2], 0, 0, attrs);
  b.quad(i0, i1, i2, i3);
}

/** Axis-aligned box (rotated by `yaw` around its vertical axis), bottom at y0. */
export function box(b: Builder, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number,
  color: Col, yaw = 0, extra?: Record<string, number[]>) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (x: number, y: number, z: number): V3 => [cx + x * c - z * s, y, cz + x * s + z * c];
  const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
  const v = [P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz),
    P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(-hx, y1, hz)];
  quad(b, v[7], v[6], v[5], v[4], color, extra); // top
  quad(b, v[3], v[2], v[6], v[7], color, extra); // +z
  quad(b, v[1], v[0], v[4], v[5], color, extra); // -z
  quad(b, v[2], v[1], v[5], v[6], color, extra); // +x
  quad(b, v[0], v[3], v[7], v[4], color, extra); // -x
}

/** Cylinder or cone along an arbitrary axis from p0 (radius r0) to p1 (radius r1). */
export function segment(b: Builder, p0: V3, p1: V3, r0: number, r1: number, color: Col, seg = 8, caps = true,
  extra?: Record<string, number[]>) {
  const axis = norm(sub(p1, p0));
  const ref: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(axis, ref)), w = cross(axis, u);
  const attrs = { color, ...extra };
  const ring = (p: V3, r: number, k: number): V3 => {
    const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    return [p[0] + r * (u[0] * ca + w[0] * sa), p[1] + r * (u[1] * ca + w[1] * sa), p[2] + r * (u[2] * ca + w[2] * sa)];
  };
  for (let k = 0; k < seg; k++) {
    const a0 = ring(p0, r0, k), a1 = ring(p0, r0, k + 1), b0 = ring(p1, r1, k), b1 = ring(p1, r1, k + 1);
    const nm = (k + 0.5) / seg * Math.PI * 2;
    const n: V3 = norm([u[0] * Math.cos(nm) + w[0] * Math.sin(nm), u[1] * Math.cos(nm) + w[1] * Math.sin(nm),
      u[2] * Math.cos(nm) + w[2] * Math.sin(nm)]);
    const i0 = b.vertex(...a0, ...n, 0, 0, attrs), i1 = b.vertex(...a1, ...n, 0, 0, attrs);
    const i2 = b.vertex(...b1, ...n, 0, 0, attrs), i3 = b.vertex(...b0, ...n, 0, 0, attrs);
    b.quad(i0, i1, i2, i3); // a0, a1, b1, b0: faces outward
  }
  if (!caps) return;
  for (const [p, r, dir] of [[p1, r1, 1], [p0, r0, -1]] as [V3, number, number][]) {
    if (r <= 0) continue;
    const n: V3 = [axis[0] * dir, axis[1] * dir, axis[2] * dir];
    const c = b.vertex(...p, ...n, 0, 0, attrs);
    const ids = Array.from({ length: seg }, (_, k) => b.vertex(...ring(p, r, k), ...n, 0, 0, attrs));
    for (let k = 0; k < seg; k++) {
      if (dir > 0) b.tri(c, ids[k], ids[(k + 1) % seg]);
      else b.tri(c, ids[(k + 1) % seg], ids[k]);
    }
  }
}

/** Vertical cylinder, bottom at y0. */
export function cylinder(b: Builder, cx: number, y0: number, cz: number, r: number, h: number, color: Col, seg = 12,
  rTop = r, extra?: Record<string, number[]>) {
  segment(b, [cx, y0, cz], [cx, y0 + h, cz], r, rTop, color, seg, true, extra);
}

/** Low-poly sphere (squashed by `sy`). */
export function sphere(b: Builder, c: V3, r: number, color: Col, sy = 1, seg = 8, extra?: Record<string, number[]>) {
  const attrs = { color, ...extra };
  const rows = Math.max(3, seg >> 1);
  const id: number[][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * Math.PI, y = Math.cos(t), rr = Math.sin(t);
    id.push([]);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const n: V3 = [rr * Math.cos(a), y, rr * Math.sin(a)];
      id[i].push(b.vertex(c[0] + r * n[0], c[1] + r * sy * n[1], c[2] + r * n[2], n[0], n[1], n[2], 0, 0, attrs));
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < seg; k++) b.quad(id[i][k], id[i][k + 1], id[i + 1][k + 1], id[i + 1][k]);
  }
}

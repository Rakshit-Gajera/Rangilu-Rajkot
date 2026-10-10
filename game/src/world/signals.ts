import * as THREE from 'three';
import type { RoadGraph } from './roadgraph';

/**
 * Traffic signals at major junctions (PROMPT §3.4): where three or more main roads (rank ≥ 6) meet at grade,
 * away from roundabouts. Two phases by approach direction, 40 s cycle with amber. Traffic (actors/life.ts)
 * stops on red; the player may of course do as Rajkot does.
 */
const CYCLE = 40, GREEN = 17, AMBER = 3;
const MIN_RANK = 6;

interface Junction {
  node: number;
  x: number;
  n: number;
  axis: [number, number]; // phase A approach axis (unit, x/n)
  offset: number; // seconds: junctions don't all switch together
  approaches: { dx: number; dn: number; half: number }[]; // unit direction of travel into the junction
}

export class Signals {
  private byNode = new Map<number, Junction>();
  junctions: Junction[] = [];
  private time = 0;
  private poles: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  private shown: { j: Junction; a: number }[] = [];
  private refresh = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(graph: RoadGraph, scene: THREE.Scene, avoid: { x: number; n: number }[]) {
    const e = graph.data.edges;
    const incident = new Map<number, number[]>();
    for (let k = 0; k < e.a.length; k++) {
      if (e.rank[k] < MIN_RANK || e.flags[k] & 2) continue;
      for (const u of [e.a[k], e.b[k]]) {
        let l = incident.get(u);
        if (!l) incident.set(u, (l = []));
        l.push(k);
      }
    }
    // Dual carriageways meet at several nearby nodes: nodes within 40 m form one junction.
    for (const [u, edges] of incident) {
      if (edges.length < 3) continue;
      const [x, n] = graph.nodeXY(u);
      if (avoid.some((c) => Math.hypot(c.x - x, c.n - n) < 75)) continue; // roundabouts have no signals
      let j = this.junctions.find((q) => Math.hypot(q.x - x, q.n - n) < 40);
      if (!j) {
        j = { node: u, x, n, axis: [0, 0], offset: (u * 7.3) % CYCLE, approaches: [] };
        this.junctions.push(j);
      }
      this.byNode.set(u, j);
      // Direction of travel into the junction along each edge (one-ways only if they flow in).
      for (const k of edges) {
        const into = e.b[k] === u; // forward along k arrives at u
        if (!into && e.flags[k] & 1) continue;
        const p = graph.pointAt(k, into, Math.max(0, graph.edgeLength(k) - 2));
        if (j.approaches.some((a) => a.dx * p.dx + a.dn * p.dn > 0.9)) continue; // same approach, other node
        j.approaches.push({ dx: p.dx, dn: p.dn, half: graph.width(k) / 2 });
      }
    }
    // Real junctions only: three or more ways in, and not a roundabout drawn as a ring of short one-way
    // segments (some aren't tagged): those circle round the centre, pointing every which way.
    const ringAround = (j: Junction) => {
      // Ring segments run across the radius (tangential), all turning the same way round the ring's centre;
      // the one-way halves of crossing dual carriageways run along it (radial).
      const segs: number[][] = [];
      for (let k = 0; k < e.a.length; k++) {
        if (!(e.flags[k] & 1) || e.len[k] > 600) continue;
        const [ax, an] = graph.nodeXY(e.a[k]), [bx, bn] = graph.nodeXY(e.b[k]);
        if (Math.hypot(ax - j.x, an - j.n) < 70 && Math.hypot(bx - j.x, bn - j.n) < 70) segs.push([ax, an, bx, bn]);
      }
      if (segs.length < 3) return false;
      const cx = segs.reduce((t, q) => t + q[0] + q[2], 0) / (2 * segs.length);
      const cn = segs.reduce((t, q) => t + q[1] + q[3], 0) / (2 * segs.length);
      let cw = 0, ccw = 0;
      for (const [ax, an, bx, bn] of segs) {
        const mx = (ax + bx) / 2 - cx, mn = (an + bn) / 2 - cn, dx = bx - ax, dn = bn - an;
        const cross = (mx * dn - mn * dx) / ((Math.hypot(mx, mn) || 1) * (Math.hypot(dx, dn) || 1));
        if (cross > 0.6) cw++; else if (cross < -0.6) ccw++;
      }
      return Math.max(cw, ccw) >= 4 && Math.max(cw, ccw) >= 0.4 * segs.length;
    };
    this.junctions = this.junctions.filter((j) => j.approaches.length >= 3 && !ringAround(j));
    for (const [u, j] of [...this.byNode]) if (!this.junctions.includes(j)) this.byNode.delete(u);
    // Centre each junction on its member nodes (poles stand 12 m back from the centre).
    const sum = new Map<Junction, [number, number, number]>();
    for (const [u, j] of this.byNode) {
      const [x, n] = graph.nodeXY(u);
      const s0 = sum.get(j) ?? [0, 0, 0];
      sum.set(j, [s0[0] + x, s0[1] + n, s0[2] + 1]);
    }
    for (const j of this.junctions) {
      const [sx, sn, c] = sum.get(j)!;
      j.x = sx / c;
      j.n = sn / c;
      j.axis = [j.approaches[0].dx, j.approaches[0].dn];
    }
    // Visuals: a pole with a three-lamp head at the left kerb of each approach (near the player only).
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6).translate(0, 2.1, 0);
    const head = new THREE.BoxGeometry(0.34, 0.95, 0.28).translate(0, 3.9, 0);
    const geo = mergeGeos(pole, head);
    this.poles = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }), 400);
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1200);
    for (const im of [this.poles, this.lamps]) {
      im.count = 0;
      im.frustumCulled = false;
      scene.add(im);
    }
  }

  /** Is the junction at the end of a vehicle's edge red (or amber) for it? (dx, dn): its direction of travel. */
  stopFor(node: number, dx: number, dn: number): boolean {
    const j = this.byNode.get(node);
    if (!j) return false;
    return this.phase(j, dx, dn) !== 'green';
  }

  isSignal(node: number) { return this.byNode.has(node); }

  private phase(j: Junction, dx: number, dn: number): 'green' | 'amber' | 'red' {
    const groupA = Math.abs(dx * j.axis[0] + dn * j.axis[1]) > 0.7;
    const t = (this.time + j.offset) % CYCLE;
    const half = CYCLE / 2;
    const tt = groupA ? t : (t + half) % CYCLE; // B runs half a cycle behind A
    return tt < GREEN ? 'green' : tt < GREEN + AMBER ? 'amber' : 'red';
  }

  /** Advance the clock; rebuild the visible poles near (x, n) every 2 s; recolour lamps every frame. */
  update(dt: number, x: number, n: number, groundAt: (x: number, n: number) => number | null) {
    this.time += dt;
    if ((this.refresh -= dt) <= 0) {
      this.refresh = 2;
      this.shown = [];
      let p = 0;
      for (const j of this.junctions) {
        if (Math.hypot(j.x - x, j.n - n) > 400) continue;
        j.approaches.forEach((a, k) => {
          if (p >= this.poles.instanceMatrix.count) return;
          // Left kerb, 12 m before the junction centre: left of travel is (−dn, dx).
          const px = j.x - a.dx * 12 - a.dn * (a.half + 0.8), pn = j.n - a.dn * 12 + a.dx * (a.half + 0.8);
          const y = groundAt(px, pn);
          if (y === null) return;
          const yaw = Math.atan2(-a.dx, -a.dn); // head faces oncoming traffic
          this.m.makeRotationY(yaw).setPosition(px, y, -pn);
          this.poles.setMatrixAt(p++, this.m);
          this.shown.push({ j, a: k });
        });
      }
      this.poles.count = p;
      this.poles.instanceMatrix.needsUpdate = true;
      // Lamps: red (top), amber, green (bottom) on the face towards traffic.
      let l = 0;
      for (const s of this.shown) {
        const a = s.j.approaches[s.a];
        const px = s.j.x - a.dx * 12 - a.dn * (a.half + 0.8), pn = s.j.n - a.dn * 12 + a.dx * (a.half + 0.8);
        const y = groundAt(px, pn) ?? 0;
        for (let k = 0; k < 3; k++) {
          this.m.makeTranslation(px - a.dx * 0.15, y + 4.2 - k * 0.3, -(pn - a.dn * 0.15));
          this.lamps.setMatrixAt(l++, this.m);
        }
      }
      this.lamps.count = l;
      this.lamps.instanceMatrix.needsUpdate = true;
    }
    let l = 0;
    for (const s of this.shown) {
      const a = s.j.approaches[s.a];
      const ph = this.phase(s.j, a.dx, a.dn);
      for (let k = 0; k < 3; k++) {
        const on = (k === 0 && ph === 'red') || (k === 1 && ph === 'amber') || (k === 2 && ph === 'green');
        const base = k === 0 ? 0xff2a1a : k === 1 ? 0xffb000 : 0x22e05a;
        this.c.setHex(base).multiplyScalar(on ? 2.2 : 0.08);
        this.lamps.setColorAt(l++, this.c);
      }
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
}

function mergeGeos(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ai = a.toNonIndexed(), bi = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const x = ai.getAttribute(name).array as Float32Array, y = bi.getAttribute(name).array as Float32Array;
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

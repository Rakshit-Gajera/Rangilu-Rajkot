import * as THREE from 'three';
import type { Activity, ActivityContext, Update } from './activity';

const ROUND = 120; // seconds
const COLORS = [0xe63946, 0xffb703, 0x219ebc, 0x8338ec, 0x06d6a0, 0xfb5607];

interface Kite {
  anchor: THREE.Vector3; // where the string is held (three.js coords)
  az: number; // azimuth (radians, three.js: 0 = −z)
  el: number; // elevation (radians)
  len: number; // string length, m
  pull: boolean; // tugging (cutting) right now
  cut: boolean;
  fall: THREE.Vector3 | null; // falling kite velocity after a cut
  obj: THREE.Group;
  line: THREE.Line;
  wander: number;
}

function kiteMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape([new THREE.Vector2(0, 0.75), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, -0.6), new THREE.Vector2(-0.55, 0)]);
  const body = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.02), new THREE.MeshBasicMaterial({ color: 0x5b3a1a }));
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  tail.position.y = -0.85;
  g.add(body, spine, tail);
  g.scale.setScalar(1.6);
  return g;
}

/** Shortest distance between segments p0–p1 and q0–q1. */
function segDist(p0: THREE.Vector3, p1: THREE.Vector3, q0: THREE.Vector3, q1: THREE.Vector3): number {
  const u = p1.clone().sub(p0), v = q1.clone().sub(q0), w = p0.clone().sub(q0);
  const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w);
  const D = a * c - b * b;
  let sc = D < 1e-6 ? 0 : (b * e - c * d) / D, tc = D < 1e-6 ? (b > c ? d / b : e / c) : (a * e - b * d) / D;
  sc = Math.min(1, Math.max(0, sc));
  tc = Math.min(1, Math.max(0, tc));
  return p0.clone().addScaledVector(u, sc).sub(q0.clone().addScaledVector(v, tc)).length();
}

/**
 * Uttarayan Kite Fight (PROMPT §3.6.3, the signature mode): fly a kite against rivals on nearby rooftops.
 * ← → steer, ↑ pull (climb, and cut a string you cross), ↓ let out string. Cross a rival's string while
 * pulling — "kai po che!" — but if they pull while you don't, your kite is cut.
 */
export class KiteFight implements Activity {
  readonly id = 'kite';
  readonly title = 'Uttarayan Kite Fight';
  readonly blurb = 'Fly a kite and cut rival kites\' strings — kai po che! Arrow keys: ← → steer, ↑ pull, ↓ let out.';
  private mine: Kite | null = null;
  private rivals: Kite[] = [];
  private group = new THREE.Group();
  private t = 0;
  private cuts = 0;
  private wind = 0;
  private lost = false;

  canStart(ctx: ActivityContext) {
    return ctx.driving() ? 'Get off your vehicle — kites are flown on foot (ideally from a terrace!).' : null;
  }

  private kite(anchor: THREE.Vector3, color: number, az: number): Kite {
    const obj = kiteMesh(color);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, anchor]), new THREE.LineBasicMaterial({ color: 0xf2f2f2 }));
    this.group.add(obj, line);
    return { anchor: anchor.clone(), az, el: 0.75, len: 55, pull: false, cut: false, fall: null, obj, line, wander: Math.random() * 10 };
  }

  start(ctx: ActivityContext) {
    this.t = 0;
    this.cuts = 0;
    this.lost = false;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    const p = ctx.here();
    this.mine = this.kite(new THREE.Vector3(p.x, p.y + 1.5, p.z), COLORS[0], 0);
    // Rivals on terraces around you, each flying towards the same patch of sky.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.random(), r = 50 + Math.random() * 70;
      const ax = p.x + Math.cos(a) * r, az = p.z + Math.sin(a) * r;
      const gy = ctx.groundY(ax, -az) + 10 + Math.random() * 8; // a terrace
      const rv = this.kite(new THREE.Vector3(ax, gy, az), COLORS[1 + (k % 5)], Math.atan2(p.x - ax, p.z - az) + Math.PI);
      rv.len = 60 + Math.random() * 30;
      this.rivals.push(rv);
    }
    ctx.flash('Uttarayan! Look up (mouse). ← → steer · ↑ pull · ↓ let out — cut their strings!');
  }

  private place(k: Kite) {
    const ce = Math.cos(k.el);
    const pos = new THREE.Vector3(k.anchor.x - Math.sin(k.az) * ce * k.len, k.anchor.y + Math.sin(k.el) * k.len, k.anchor.z - Math.cos(k.az) * ce * k.len);
    if (k.fall) pos.copy(k.obj.position);
    k.obj.position.copy(pos);
    k.obj.lookAt(k.anchor);
    const a = k.line.geometry.attributes.position as THREE.BufferAttribute;
    a.setXYZ(0, k.anchor.x, k.anchor.y, k.anchor.z);
    a.setXYZ(1, k.cut ? k.anchor.x : pos.x, k.cut ? k.anchor.y : pos.y, k.cut ? k.anchor.z : pos.z);
    a.needsUpdate = true;
  }

  update(dt: number, ctx: ActivityContext): Update {
    const me = this.mine!;
    this.t += dt;
    this.wind += dt;
    const p = ctx.here();
    me.anchor.set(p.x, p.y + 1.5, p.z);
    const inp = ctx.input;
    // Steering and string: arrows only, so walking (WASD) still works.
    me.az += inp.axis('ArrowRight', 'ArrowLeft') * dt * 0.8;
    me.pull = inp.held('ArrowUp');
    if (me.pull) me.el = Math.min(1.35, me.el + dt * 0.5);
    else me.el = Math.max(0.25, me.el - dt * 0.12); // sinks slowly without tugging
    if (inp.held('ArrowDown')) me.len = Math.min(140, me.len + dt * 14);
    me.az += Math.sin(this.wind * 0.7) * dt * 0.05; // gusts
    // Rivals drift towards your kite and tug now and then.
    const mePos = me.obj.position;
    for (const r of this.rivals) {
      if (r.fall) {
        r.fall.y -= dt * 2.5;
        r.obj.position.addScaledVector(r.fall, dt);
        r.obj.rotation.z += dt * 2;
        if (r.obj.position.y < r.anchor.y - 30) r.obj.visible = false;
        this.place(r);
        continue;
      }
      r.wander += dt;
      const want = Math.atan2(r.anchor.x - mePos.x, r.anchor.z - mePos.z);
      let d = want - r.az;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.az += Math.max(-0.4, Math.min(0.4, d)) * dt * 0.3 + Math.sin(r.wander * 1.3) * dt * 0.12;
      r.el = 0.7 + Math.sin(r.wander * 0.5) * 0.25;
      r.pull = Math.sin(r.wander * 2.1) > 0.35; // rivals tug often: time your own pull
      this.place(r);
    }
    this.place(me);
    // Strings crossing: whoever tugs cuts the other.
    for (const r of this.rivals) {
      if (r.cut) continue;
      if (segDist(me.anchor, me.obj.position, r.anchor, r.obj.position) > 1.2) continue;
      if (me.pull && !r.pull) {
        r.cut = true;
        r.fall = new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
        this.cuts++;
        ctx.sound('good');
        ctx.flash('Kai po che! ✂️');
      } else if (r.pull && !me.pull) {
        this.lost = true;
      }
    }
    if (this.lost) return this.finish(ctx, 'Your string was cut! ');
    if (this.rivals.every((r) => r.cut)) return this.finish(ctx, 'You cut every kite in the sky! ');
    if (this.t >= ROUND) return this.finish(ctx, 'The evening wind drops. ');
    return { done: false };
  }

  private finish(ctx: ActivityContext, why: string): Update {
    const pay = this.cuts * 60 + (this.lost ? 0 : 40);
    if (pay) ctx.pay(pay, `Uttarayan: ${this.cuts} kite${this.cuts === 1 ? '' : 's'} cut — ₹${pay}`);
    const best = ctx.record(this.id, this.cuts);
    return { done: true, summary: `${why}${this.cuts} kite${this.cuts === 1 ? '' : 's'} cut${best ? ' (new best!)' : ''}.` };
  }

  status() {
    const left = Math.max(0, ROUND - this.t);
    return `Cut ${this.cuts}/${this.rivals.length} · ${Math.ceil(left)} s<br><small>← → steer · ↑ pull · ↓ let out</small>`;
  }

  end(ctx: ActivityContext) {
    ctx.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    this.rivals = [];
    this.mine = null;
  }
}

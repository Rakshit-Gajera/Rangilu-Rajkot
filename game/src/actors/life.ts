import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import { MODELS, vehicleModel, type ModelName } from '../gen/vehicles';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import { vertexColorMaterial } from '../render/materials';
import type { RoadGraph } from '../world/roadgraph';
import type { World } from '../world/world';

/**
 * The living street (PROMPT §3.4, §9.4–9.5): traffic, pedestrians and cows around the player.
 * Traffic follows the real road graph, keeps left, spaces itself with the Intelligent Driver Model
 * and gives way to the player and to cows. Agents are kinematic; those near the player get colliders.
 */

type Kind = 'vehicle' | 'ped' | 'cow';

interface Agent {
  kind: Kind;
  model: number;
  edge: number;
  fwd: boolean;
  s: number;
  v: number;
  v0: number;
  lane: number; // lateral offset from the centreline, metres (positive = left of travel)
  length: number;
  x: number;
  n: number;
  y: number;
  yaw: number;
  honk: number;
  body?: RAPIER.RigidBody;
  wait: number; // cows: seconds until they move; peds: pause
}

interface Spec { model: ModelName; weight: number; length: number; speed: number; lane: number }

/** Traffic mix: mostly two-wheelers, then autos and cars (PROMPT §9.4). */
const VEHICLES: Spec[] = [
  { model: 'scooter', weight: 30, length: 1.8, speed: 1.0, lane: 1.0 },
  { model: 'motorcycle', weight: 22, length: 2.0, speed: 1.1, lane: 0.9 },
  { model: 'auto', weight: 15, length: 2.7, speed: 0.75, lane: 0.6 },
  { model: 'chhakdo', weight: 5, length: 3.3, speed: 0.6, lane: 0.6 },
  { model: 'car-white', weight: 7, length: 3.9, speed: 1.0, lane: 0.3 },
  { model: 'car-red', weight: 4, length: 3.9, speed: 1.0, lane: 0.3 },
  { model: 'car-silver', weight: 6, length: 3.9, speed: 1.0, lane: 0.3 },
  { model: 'car-blue', weight: 3, length: 3.9, speed: 1.0, lane: 0.3 },
  { model: 'bus', weight: 2, length: 10.6, speed: 0.8, lane: 0.2 },
];
const VEHICLE_TOTAL = VEHICLES.reduce((s, v) => s + v.weight, 0);
const PEDS: ModelName[] = ['ped-kurta', 'ped-shirt', 'ped-saree', 'ped-salwar'];
const SPAWN_MIN = 120, SPAWN_MAX = 550, DESPAWN = 650;
const COLLIDER_RANGE = 40;

/** Rajkot's day: busy mornings and evenings, the afternoon rest, quiet nights (PROMPT §3.4). */
export function trafficDensity(hour: number): number {
  const bump = (h: number, w: number) => Math.exp(-(((hour - h + 24) % 24 > 12 ? (hour - h + 24) % 24 - 24 : (hour - h + 24) % 24) ** 2) / (2 * w * w));
  const base = 0.15 + 0.85 * Math.max(bump(10, 1.6), bump(19.5, 1.8)) + 0.45 * bump(16.5, 1.2);
  const rest = hour > 13 && hour < 16 ? 0.45 : 1; // afternoon rest: shutters down, roads empty
  const night = hour < 6 || hour > 23 ? 0.25 : 1;
  return Math.min(1, base * rest * night);
}

/** Intelligent Driver Model acceleration (Treiber). gap = bumper-to-bumper distance to the leader. */
export function idm(v: number, v0: number, gap: number, dv: number): number {
  const a = 1.6, b = 2.5, s0 = 2.0, T = 1.2;
  const sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  return a * (1 - (v / Math.max(v0, 0.1)) ** 4 - (sStar / Math.max(gap, 0.1)) ** 2);
}

export class Life {
  readonly agents: Agent[] = [];
  private meshes: THREE.InstancedMesh[];
  private rnd = 1234567;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  maxVehicles: number;
  maxPeds: number;
  maxCows: number;
  onHorn: ((x: number, y: number, z: number, kind: ModelName) => void) | null = null;

  constructor(private graph: RoadGraph, private world: World, private physics: Physics, scene: THREE.Scene,
    caps: { vehicles: number; peds: number; cows: number }, shadows: boolean) {
    this.maxVehicles = caps.vehicles;
    this.maxPeds = caps.peds;
    this.maxCows = caps.cows;
    const mat = vertexColorMaterial({ roughness: 0.7 });
    this.meshes = MODELS.map((name) => {
      const g = vehicleModel(name);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(g.attrs.color[0], 3));
      geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      const cap = name.startsWith('ped') ? caps.peds : name.startsWith('cow') ? caps.cows : caps.vehicles;
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(cap, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      scene.add(mesh);
      return mesh;
    });
  }

  private rand() {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private count(kind: Kind) {
    let c = 0;
    for (const a of this.agents) if (a.kind === kind) c++;
    return c;
  }

  /** Pick a random routable edge with a point 120–550 m from (x, n). */
  private spawnPoint(x: number, n: number, minRank: number): { edge: number; fwd: boolean; s: number } | null {
    const e = this.graph.data.edges;
    for (let tries = 0; tries < 12; tries++) {
      const ang = this.rand() * Math.PI * 2, d = SPAWN_MIN + this.rand() * (SPAWN_MAX - SPAWN_MIN);
      const u = this.graph.nearestNode(x + Math.cos(ang) * d, n + Math.sin(ang) * d, true);
      const out = this.graph.outgoing(u).filter(([k]) => e.rank[k] >= minRank && !(e.flags[k] & 2));
      if (!out.length) continue;
      const [edge, fwd] = out[Math.floor(this.rand() * out.length)];
      return { edge, fwd, s: this.rand() * Math.min(this.graph.edgeLength(edge), 30) };
    }
    return null;
  }

  private roadHalfWidth(edge: number) {
    const r = this.graph.data.edges.rank[edge];
    return r >= 7 ? 6 : r >= 6 ? 4.5 : r >= 5 ? 3.5 : r >= 3 ? 2.6 : 2;
  }

  private spawn(kind: Kind, px: number, pn: number) {
    const minRank = kind === 'cow' ? 3 : kind === 'ped' ? 3 : 3;
    const sp = this.spawnPoint(px, pn, minRank);
    if (!sp) return;
    let model: number, length = 1, v0 = 1.3, lane = 0;
    const half = this.roadHalfWidth(sp.edge);
    if (kind === 'vehicle') {
      let pick = this.rand() * VEHICLE_TOTAL;
      let spec = VEHICLES[0];
      for (const v of VEHICLES) { pick -= v.weight; if (pick <= 0) { spec = v; break; } }
      model = MODELS.indexOf(spec.model);
      length = spec.length;
      const rank = this.graph.data.edges.rank[sp.edge];
      v0 = (rank >= 7 ? 15 : rank >= 6 ? 12.5 : rank >= 5 ? 11 : 7.5) * spec.speed * (0.85 + this.rand() * 0.3);
      // Keep left; two-wheelers ride nearer the edge, with some spread.
      const oneway = !!(this.graph.data.edges.flags[sp.edge] & 1);
      const lanePos = oneway ? (this.rand() - 0.5) * half : half * (0.25 + 0.55 * spec.lane * this.rand());
      lane = lanePos;
    } else if (kind === 'ped') {
      model = MODELS.indexOf(PEDS[Math.floor(this.rand() * PEDS.length)]);
      lane = (this.rand() < 0.5 ? 1 : -1) * (half + 1.5 + this.rand());
      v0 = 1.1 + this.rand() * 0.5;
    } else {
      model = MODELS.indexOf(this.rand() < 0.6 ? 'cow-sit' : 'cow-stand');
      lane = (this.rand() < 0.5 ? 1 : -1) * (half - 0.3 + this.rand() * 1.5);
      v0 = 0.4;
    }
    this.agents.push({ kind, model, edge: sp.edge, fwd: sp.fwd, s: sp.s, v: kind === 'vehicle' ? v0 * 0.6 : v0, v0, lane,
      length, x: 0, n: 0, y: 0, yaw: 0, honk: 0, wait: this.rand() * 20 });
  }

  /** Next edge at the end node: never a U-turn unless it's a dead end; bigger roads preferred. */
  private nextEdge(a: Agent): boolean {
    const e = this.graph.data.edges;
    const node = a.fwd ? e.b[a.edge] : e.a[a.edge];
    const out = this.graph.outgoing(node).filter(([k]) => k !== a.edge && !(e.flags[k] & 2));
    if (!out.length) return false;
    let total = 0;
    const w = out.map(([k]) => { const x = 1 + Math.max(0, e.rank[k] - 2); total += x; return x; });
    let pick = this.rand() * total, i = 0;
    while (pick > w[i] && i < w.length - 1) pick -= w[i++];
    [a.edge, a.fwd] = out[i];
    a.s = 0;
    return true;
  }

  update(dt: number, player: THREE.Vector3, hour: number) {
    const px = player.x, pn = -player.z;
    const density = trafficDensity(hour);
    // Spawn a few per frame up to the caps (scaled by time of day).
    if (this.count('vehicle') < this.maxVehicles * density) this.spawn('vehicle', px, pn);
    if (this.count('ped') < this.maxPeds * (0.3 + 0.7 * density)) this.spawn('ped', px, pn);
    if (this.count('cow') < this.maxCows) this.spawn('cow', px, pn);

    // Leaders: sort vehicles on each directed edge by position.
    const lanes = new Map<string, Agent[]>();
    for (const a of this.agents) {
      if (a.kind !== 'vehicle') continue;
      const key = `${a.edge}:${a.fwd}`;
      let l = lanes.get(key);
      if (!l) lanes.set(key, (l = []));
      l.push(a);
    }
    for (const l of lanes.values()) l.sort((p, q) => p.s - q.s);
    const cows = this.agents.filter((a) => a.kind === 'cow');

    for (let k = this.agents.length - 1; k >= 0; k--) {
      const a = this.agents[k];
      const L = this.graph.edgeLength(a.edge);
      if (a.kind === 'vehicle') {
        const l = lanes.get(`${a.edge}:${a.fwd}`)!;
        const i = l.indexOf(a);
        let gap = Infinity, dv = 0;
        // Same-lane leader (two-wheelers filter past cars in a different lateral position).
        for (let j = i + 1; j < l.length; j++) {
          if (Math.abs(l[j].lane - a.lane) < 1.6) { gap = l[j].s - a.s - (a.length + l[j].length) / 2; dv = a.v - l[j].v; break; }
        }
        // Player and cows in our path: treat as stopped obstacles.
        const hx = Math.sin(a.yaw), hn = Math.cos(a.yaw);
        for (const o of [{ x: px, n: pn }, ...cows]) {
          const rx = o.x - a.x, rn = o.n - a.n;
          const ahead = rx * hx + rn * hn, side = Math.abs(rx * hn - rn * hx);
          if (ahead > 0 && ahead < 25 && side < 1.6) {
            const g = ahead - a.length / 2 - 1;
            if (g < gap) { gap = g; dv = a.v; }
          }
        }
        // Slow down before the end of the edge (junctions).
        const toEnd = L - a.s;
        let v0 = a.v0;
        if (toEnd < 18) v0 = Math.min(v0, 3 + toEnd * 0.35);
        const acc = idm(a.v, v0, gap, dv);
        a.v = Math.max(0, a.v + acc * dt);
        if (a.v < 0.5 && gap < 6) {
          a.honk -= dt;
          if (a.honk < 0) { a.honk = 2 + this.rand() * 5; this.onHorn?.(a.x, a.y, -a.n, MODELS[a.model]); }
        } else a.honk = 1 + this.rand();
      } else if (a.kind === 'ped') {
        a.wait -= dt;
        a.v = a.wait > 0 && a.wait < 3 ? 0 : a.v0; // pause now and then
        if (a.wait < 0) a.wait = 8 + this.rand() * 20;
      } else {
        a.wait -= dt;
        a.v = a.model === MODELS.indexOf('cow-stand') && a.wait < 4 && a.wait > 0 ? 0.35 : 0;
        if (a.wait < 0) a.wait = 10 + this.rand() * 30;
      }
      a.s += a.v * dt;
      if (a.s > L && !this.nextEdge(a)) {
        if (a.kind === 'ped') { a.fwd = !a.fwd; a.s = 0; } else { this.remove(k); continue; }
      }
      const p = this.graph.pointAt(a.edge, a.fwd, a.s);
      // Left of travel in (x, n) is (−dn, dx).
      a.x = p.x - p.dn * a.lane;
      a.n = p.n + p.dx * a.lane;
      const ground = this.world.terrainAt(a.x, -a.n);
      if (ground === null || Math.hypot(a.x - px, a.n - pn) > DESPAWN) { this.remove(k); continue; }
      a.y = ground + (a.kind === 'ped' ? 0.15 : 0.02);
      a.yaw = Math.atan2(p.dx, p.dn);
      this.syncBody(a, px, pn);
    }
    this.render();
  }

  /** Kinematic colliders only for agents near the player (PROMPT §9.4). */
  private syncBody(a: Agent, px: number, pn: number) {
    const near = Math.hypot(a.x - px, a.n - pn) < COLLIDER_RANGE && a.kind !== 'ped';
    if (near && !a.body) {
      const R = this.physics.R;
      a.body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x, a.y, -a.n));
      const half = a.kind === 'cow' ? [0.35, 0.6, 1.0] : [a.length > 3 ? 0.85 : 0.4, 0.7, a.length / 2];
      this.physics.world.createCollider(R.ColliderDesc.cuboid(half[0], half[1], half[2]).setTranslation(0, half[1], 0)
        .setCollisionGroups(groups(GROUP_VEHICLE, GROUP_WORLD | GROUP_PLAYER | GROUP_VEHICLE)), a.body);
    } else if (!near && a.body) {
      this.physics.world.removeRigidBody(a.body);
      a.body = undefined;
    }
    if (a.body) {
      this.q.setFromAxisAngle(this.up, Math.PI - a.yaw);
      a.body.setNextKinematicTranslation({ x: a.x, y: a.y, z: -a.n });
      a.body.setNextKinematicRotation(this.q);
    }
  }

  private remove(k: number) {
    const a = this.agents[k];
    if (a.body) this.physics.world.removeRigidBody(a.body);
    this.agents.splice(k, 1);
  }

  private render() {
    for (const m of this.meshes) m.count = 0;
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    for (const a of this.agents) {
      const mesh = this.meshes[a.model];
      if (mesh.count >= mesh.instanceMatrix.count) continue;
      // Model +z is forward; yaw is measured from north (−z in three.js).
      this.q.setFromAxisAngle(this.up, Math.PI - a.yaw);
      pos.set(a.x, a.y, -a.n);
      this.m.compose(pos, this.q, scl);
      mesh.setMatrixAt(mesh.count++, this.m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  stats() {
    return { vehicles: this.count('vehicle'), peds: this.count('ped'), cows: this.count('cow') };
  }
}

import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import { MODELS, vehicleModel, type ModelName } from '../gen/vehicles';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import { vertexColorMaterial } from '../render/materials';
import type { RoadGraph } from '../world/roadgraph';
import type { Signals } from '../world/signals';
import type { World } from '../world/world';

/**
 * The living street (PROMPT §3.4, §9.4–9.5): traffic, pedestrians and cows around the player.
 * Traffic follows the real road graph, keeps left, spaces itself with the Intelligent Driver Model
 * and gives way to the player and to cows. Agents are kinematic; those near the player get colliders.
 */

type Kind = 'vehicle' | 'ped' | 'cow' | 'parked';

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
  check: number; // seconds until the next "am I inside a building?" test
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
  { model: 'bicycle', weight: 4, length: 1.7, speed: 0.4, lane: 1.0 },
  { model: 'suv-white', weight: 3, length: 4.4, speed: 1.0, lane: 0.3 },
  { model: 'suv-black', weight: 2, length: 4.4, speed: 1.0, lane: 0.3 },
  { model: 'tractor', weight: 1, length: 3.6, speed: 0.5, lane: 0.4 },
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
  private counts: Record<Kind, number> = { vehicle: 0, ped: 0, cow: 0, parked: 0 };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  maxVehicles: number;
  maxPeds: number;
  maxCows: number;
  maxParked: number;
  /** Busier places (e.g. the player's neighbourhood): more parked vehicles and people around. */
  denseZones: { x: number; n: number; r: number; peds?: number; event?: boolean }[] = [];
  onHorn: ((x: number, y: number, z: number, kind: ModelName) => void) | null = null;

  constructor(private graph: RoadGraph, private world: World, private physics: Physics, scene: THREE.Scene,
    caps: { vehicles: number; peds: number; cows: number }, shadows: boolean) {
    this.maxVehicles = caps.vehicles;
    this.maxPeds = caps.peds;
    this.maxCows = caps.cows;
    this.maxParked = Math.round(caps.vehicles * 0.35);
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
    return this.counts[kind];
  }

  /** Pick a random routable edge with a point 120–550 m from (x, n). */
  private spawnPoint(x: number, n: number, minRank: number): { edge: number; fwd: boolean; s: number } | null {
    const e = this.graph.data.edges;
    for (let tries = 0; tries < 4; tries++) {
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
    return this.graph.width(edge) / 2;
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
      // Main roads have footpaths (furniture.ts: 2.2 m from the kerb); elsewhere people walk at the road's edge.
      const rank = this.graph.data.edges.rank[sp.edge];
      const off = rank >= 6 ? half + 0.6 + this.rand() * 1.2 : Math.max(0.6, half - 0.3 - this.rand() * 0.5);
      lane = (this.rand() < 0.5 ? 1 : -1) * off;
      v0 = 1.1 + this.rand() * 0.5;
    } else if (kind === 'parked') {
      // Parked at the kerb, facing either way: mostly scooters and bikes, some cars.
      const PARKED = ['scooter', 'scooter', 'scooter', 'motorcycle', 'motorcycle', 'car-white', 'car-silver', 'car-red', 'auto', 'bicycle'] as const;
      const m = PARKED[Math.floor(this.rand() * PARKED.length)];
      model = MODELS.indexOf(m);
      const wide = m.startsWith('car') || m === 'auto';
      lane = (this.rand() < 0.5 ? 1 : -1) * Math.max(0.6, half - (wide ? 0.95 : 0.45));
      length = wide ? 3.8 : 1.8;
      v0 = 0;
      sp.s = this.rand() * this.graph.edgeLength(sp.edge); // anywhere along the street
    } else {
      model = MODELS.indexOf(this.rand() < 0.6 ? 'cow-sit' : 'cow-stand');
      lane = (this.rand() < 0.5 ? 1 : -1) * Math.max(0.8, half - 0.6 + this.rand() * 0.6);
      v0 = 0.4;
    }
    this.agents.push({ kind, model, edge: sp.edge, fwd: sp.fwd, s: sp.s, v: kind === 'vehicle' ? v0 * 0.6 : v0, v0, lane,
      length, x: 0, n: 0, y: 0, yaw: 0, honk: 0, wait: this.rand() * 20, check: 0 });
    this.counts[kind]++;
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

  /** Traffic signals (world/signals.ts), if any. */
  signals: Signals | null = null;

  /** Sandbox sliders (PROMPT §3.5): 0..2 multipliers on the preset caps. */
  trafficScale = 1;
  pedScale = 1;

  /**
   * player: where the player is (spawning and despawning centre).
   * obstacles: things traffic must stop for besides cows, e.g. the player and a parked scooter (three.js coords).
   */
  update(dt: number, player: THREE.Vector3, hour: number, obstacles: THREE.Vector3[] = [player]) {
    const px = player.x, pn = -player.z;
    const density = trafficDensity(hour);
    // Spawn up to two agents per frame, each time for the kind furthest below its target.
    const target: Record<Kind, number> = {
      vehicle: this.maxVehicles * density * this.trafficScale,
      ped: this.maxPeds * (0.3 + 0.7 * density) * this.pedScale,
      cow: this.maxCows,
      parked: this.maxParked,
    };
    for (const z of this.denseZones) {
      if (Math.hypot(z.x - px, z.n - pn) > z.r) continue;
      target.parked *= z.event ? 1 : 2;
      target.ped *= z.peds ?? 1.5;
    }
    for (let k = 0; k < 2; k++) {
      let pick: Kind | null = null, worst = 1;
      for (const kind of ['vehicle', 'ped', 'cow', 'parked'] as Kind[]) {
        const fill = target[kind] > 0 ? this.counts[kind] / target[kind] : 1;
        if (fill < worst) { worst = fill; pick = kind; }
      }
      if (pick) this.spawn(pick, px, pn);
    }
    // Over the cap (slider lowered, evening ends): let the farthest ones go.
    this.trim('vehicle', Math.ceil(target.vehicle * 1.1), px, pn);
    this.trim('ped', Math.ceil(target.ped * 1.1), px, pn);
    const blockers = obstacles.map((o) => ({ x: o.x, n: -o.z }));

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
    const cows = this.agents.filter((a) => a.kind === 'cow' || a.kind === 'parked');

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
        for (const o of [...blockers, ...cows]) {
          const rx = o.x - a.x, rn = o.n - a.n;
          const ahead = rx * hx + rn * hn, side = Math.abs(rx * hn - rn * hx);
          if (ahead > 0 && ahead < 25 && side < 1.6) {
            const g = ahead - a.length / 2 - 1;
            if (g < gap) { gap = g; dv = a.v; }
          }
        }
        // Slow down before the end of the edge (junctions).
        const toEnd = L - a.s;
        // Red light ahead: stop at the line (unless too close to stop safely on amber).
        if (this.signals && toEnd < 40 && toEnd > 3) {
          const e = this.graph.data.edges;
          const node = a.fwd ? e.b[a.edge] : e.a[a.edge];
          const g = toEnd - 5;
          if (this.signals.stopFor(node, hx, hn) && (a.v * a.v) / (2 * Math.max(g, 0.1)) < 4.5 && g < gap) { gap = Math.max(g, 0.1); dv = a.v; }
        }
        let v0 = a.v0;
        if (toEnd < 18) v0 = Math.min(v0, 3 + toEnd * 0.35);
        const acc = idm(a.v, v0, gap, dv);
        a.v = Math.max(0, a.v + acc * dt);
        if (a.v < 0.5 && gap < 6) {
          a.honk -= dt;
          if (a.honk < 0) { a.honk = 2 + this.rand() * 5; this.onHorn?.(a.x, a.y, -a.n, MODELS[a.model]); }
        } else a.honk = 1 + this.rand();
      } else if (a.kind === 'parked') {
        a.v = 0;
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
      if (this.insideBuilding(a, px, pn, dt)) {
        // Mapped roads and building outlines don't always agree: people step back onto the road,
        // vehicles and cows standing in a wall are removed (they respawn elsewhere).
        if (a.kind === 'ped' && Math.abs(a.lane) > 0.8) { a.lane *= 0.6; a.check = 0; } else { this.remove(k); continue; }
      }
      this.syncBody(a, px, pn);
    }
    this.render();
  }

  /**
   * Take the traffic vehicle nearest to (x, n) within `reach` metres of its body (the player hops on):
   * it leaves traffic and its pose is returned for a drivable copy.
   */
  takeVehicle(x: number, n: number, reach = 1.5): { model: ModelName; x: number; n: number; y: number; yaw: number } | null {
    let best = -1, bd = reach;
    this.agents.forEach((a, k) => {
      if (a.kind !== 'vehicle') return;
      const d = Math.hypot(a.x - x, a.n - n) - a.length / 2;
      if (d < bd) { bd = d; best = k; }
    });
    if (best < 0) return null;
    const a = this.agents[best];
    this.remove(best);
    return { model: MODELS[a.model], x: a.x, n: a.n, y: a.y, yaw: a.yaw };
  }

  /** How many vehicles and people are within r metres of (x, n) (ambience). */
  near(x: number, n: number, r: number): { vehicles: number; peds: number } {
    let vehicles = 0, peds = 0;
    for (const a of this.agents) {
      if (Math.abs(a.x - x) > r || Math.abs(a.n - n) > r) continue;
      if (a.kind === 'vehicle') vehicles++; else if (a.kind === 'ped') peds++;
    }
    return { vehicles, peds };
  }

  /** Is a traffic vehicle within reach (for the E prompt)? */
  vehicleNear(x: number, n: number, reach = 1.5): boolean {
    return this.agents.some((a) => a.kind === 'vehicle' && Math.hypot(a.x - x, a.n - n) - a.length / 2 < reach);
  }

  /** Remove the farthest agents of a kind above `cap`. */
  private trim(kind: Kind, cap: number, px: number, pn: number) {
    let over = this.counts[kind] - cap;
    while (over-- > 0) {
      let far = -1, fd = -1;
      for (let k = 0; k < this.agents.length; k++) {
        const a = this.agents[k];
        if (a.kind !== kind) continue;
        const d = Math.hypot(a.x - px, a.n - pn);
        if (d > fd) { fd = d; far = k; }
      }
      if (far < 0 || fd < SPAWN_MIN) return; // never pop out of thin air in front of the player
      this.remove(far);
    }
  }

  /**
   * True if a building (or other world solid) stands over the agent: a ray down from 25 m above
   * hits something well above the ground. Only near the player, where colliders exist; ~1 test per second each.
   */
  private insideBuilding(a: Agent, px: number, pn: number, dt: number): boolean {
    a.check -= dt;
    if (a.check > 0) return false;
    a.check = 0.8 + this.rand() * 0.4;
    if (Math.hypot(a.x - px, a.n - pn) > 250) return false;
    const top = this.physics.groundAt(a.x, -a.n, a.y + 25);
    return top !== null && top > a.y + 2.2;
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
    this.counts[a.kind]--;
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
    return { vehicles: this.count('vehicle'), peds: this.count('ped'), cows: this.count('cow'), parked: this.count('parked') };
  }
}

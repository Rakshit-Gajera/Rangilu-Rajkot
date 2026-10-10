import * as THREE from 'three';
import type { Vehicle, VehicleKind } from '../actors/vehicle';
import type { Input } from '../app/input';
import type { RoadGraph } from '../world/roadgraph';

/**
 * Activities framework (PROMPT §10): optional mini-games that never lock the world.
 * Each implements canStart / start / update / end; X quits at any time.
 * Coordinates: (x, n) = metres east/north of the origin (three.js z = −n).
 */
export interface ActivityContext {
  graph: RoadGraph;
  scene: THREE.Scene;
  /** Player (or vehicle) position, three.js coordinates. */
  here(): THREE.Vector3;
  driving(): Vehicle | null;
  /** Ground height (three.js y) at (x, n), or a fallback near the player. */
  groundY(x: number, n: number): number;
  /** Keyboard (rhythm games read arrow keys). */
  input: Input;
  /** Spawn a vehicle at a road point (x, n) facing `heading` and put the player in it. */
  putInVehicle(kind: VehicleKind, x: number, n: number, heading: number): Promise<void>;
  /** Teleport the player (on foot) to (x, n). */
  putOnFoot(x: number, n: number): Promise<void>;
  /** Busier streets around (x, n): people × scale within r metres (scale 1 clears it). */
  crowd(x: number, n: number, r: number, scale: number): void;
  setWaypoint(x: number, n: number): void;
  clearWaypoint(): void;
  flash(text: string): void;
  pay(rupees: number, why: string): void;
  record(id: string, score: number): boolean; // true if a new best
  best(id: string): number | undefined;
  /** Polylines ([x, n, ...]) of roads whose name matches. */
  roads(name: RegExp): number[][];
  /** Named places (landmarks, chowks, neighbourhoods) to send people to. */
  places(): { t: string; x: number; n: number }[];
  sound(kind: 'ding' | 'good' | 'bad'): void;
}

export type Update = { done: false } | { done: true; summary: string };

export interface Activity {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  /** null if it can start now, else the reason it can't. */
  canStart(ctx: ActivityContext): string | null;
  start(ctx: ActivityContext): void | Promise<void>;
  update(dt: number, ctx: ActivityContext): Update;
  /** Text for the activity panel (objective, timer, earnings). */
  status(): string;
  /** Clean up markers etc. (also on quit). */
  end(ctx: ActivityContext): void;
}

/** A tall glowing ring-and-beam marker seen from afar. */
export class Marker {
  readonly object = new THREE.Group();

  constructor(private scene: THREE.Scene, color = 0xffb020, radius = 4) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 60, 24, 1, true), mat);
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.15, 6, 32).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color }));
    ring.position.y = 0.2;
    this.object.add(beam, ring);
    this.object.visible = false;
    scene.add(this.object);
  }

  place(x: number, y: number, n: number) {
    this.object.position.set(x, y, -n);
    this.object.visible = true;
  }

  hide() { this.object.visible = false; }

  dispose() {
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }
}

/** A random routable road point between minD and maxD metres from (x, n). */
export function roadPointNear(g: RoadGraph, x: number, n: number, minD: number, maxD: number, rnd = Math.random): [number, number] {
  for (let k = 0; k < 20; k++) {
    const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD);
    const [px, pn] = g.nodeXY(g.nearestNode(x + Math.cos(a) * d, n + Math.sin(a) * d, true));
    const dd = Math.hypot(px - x, pn - n);
    if (dd >= minD * 0.8 && dd <= maxD * 1.3) return [px, pn];
  }
  return g.nodeXY(g.nearestNode(x + minD, n, true));
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

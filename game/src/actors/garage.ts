import type * as THREE from 'three';
import type { Input } from '../app/input';
import type { ModelName } from '../gen/vehicles';
import type { Physics } from '../physics/physics';
import type { World } from '../world/world';
import { Vehicle, type VehicleKind } from './vehicle';

const MAX_VEHICLES = 8;

/**
 * The player's vehicles (PROMPT §3.3, §3.5): their own scooter, spawned ones and ones taken from traffic.
 * Unused extras are cleared oldest-first; parked vehicles freeze where the ground isn't loaded.
 */
export class Garage {
  readonly vehicles: Vehicle[] = [];
  /** The player's own scooter (always kept; R on foot brings it). */
  own: Vehicle;
  /** The vehicle being driven, if any. */
  current: Vehicle | null = null;

  constructor(private physics: Physics, private scene: THREE.Scene, x: number, y: number, z: number, heading: number) {
    this.own = this.spawn('scooter', x, y, z, heading);
  }

  spawn(kind: VehicleKind, x: number, y: number, z: number, heading: number, opts: { color?: number; model?: ModelName } = {}): Vehicle {
    while (this.vehicles.length >= MAX_VEHICLES) {
      const spare = this.vehicles.filter((v) => v !== this.own && v !== this.current).sort((a, b) => b.idle - a.idle)[0];
      if (!spare) break;
      this.remove(spare);
    }
    const v = new Vehicle(this.physics, this.scene, kind, x, y, z, heading, opts);
    this.vehicles.push(v);
    return v;
  }

  remove(v: Vehicle) {
    if (v === this.own || v === this.current) return;
    v.dispose();
    this.vehicles.splice(this.vehicles.indexOf(v), 1);
  }

  /** Closest vehicle whose footprint is within `reach` metres of p. */
  nearest(p: THREE.Vector3, reach = 1.4): Vehicle | null {
    let best: Vehicle | null = null, bd = reach;
    for (const v of this.vehicles) {
      if (v === this.current) continue;
      const d = v.reach(p);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  drive(input: Input | null, dt: number) {
    for (const v of this.vehicles) v.drive(v === this.current ? input : null, dt);
  }

  capture() {
    for (const v of this.vehicles) v.capture();
  }

  sync(dt: number, night: number, alpha: number) {
    for (const v of this.vehicles) v.sync(dt, night, alpha);
  }

  /** Parked vehicles near the player keep their ground loaded; others freeze where it isn't. */
  park(world: World, player: THREE.Vector3) {
    for (const v of this.vehicles) {
      if (v === this.current) { v.setFrozen(false); continue; }
      const p = v.position;
      v.setFrozen(!world.readyAt(p.x, p.z) || (v !== this.own && p.distanceTo(player) > 400));
    }
  }

  /** Positions that keep colliders loaded: the own scooter (unless driven). */
  anchors(): THREE.Vector3[] {
    return this.current === this.own ? [] : [this.own.position];
  }

  /** Parked vehicles traffic must stop for. */
  parked(): THREE.Vector3[] {
    return this.vehicles.filter((v) => v !== this.current).map((v) => v.position);
  }
}

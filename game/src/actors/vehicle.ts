import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { Input } from '../app/input';
import { vehicleModel, type ModelName } from '../gen/vehicles';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import { vertexColorMaterial } from '../render/materials';

/**
 * Every drivable vehicle (PROMPT §3.3): one ray-cast vehicle controller, tuned per type.
 * Two-wheelers use four close-set virtual wheels for stability and lean visually into turns.
 * Local +z is forward; India drives on the left, so car drivers sit on the right (−x).
 */
export type VehicleKind = 'bicycle' | 'scooter' | 'motorcycle' | 'chhakdo' | 'auto' | 'hatchback' | 'suv' | 'bus' | 'tractor';

export interface VehicleSpec {
  label: string;
  topKmh: number;
  mass: number;
  /** Collider half extents. */
  half: [number, number, number];
  /** Wheels: [x, z, radius]; the first `steered` are steered. */
  wheels: [number, number, number][];
  steered: number;
  driven: 'front' | 'rear' | 'all';
  engine: number; // N per driven wheel
  brake: number;
  rest: number; // suspension rest length
  /** How far the model's ground line sits below the chassis origin. */
  meshY: number;
  twoWheeler: boolean;
  /** Where the player sits (model frame) and whether they are seen. */
  seat: [number, number, number];
  showRider: boolean;
  /** Seat height for the 'ride' pose is built for a scooter at 0.8 m; others shift the character. */
  model: ModelName | 'scooter-custom';
  horn: string;
  engineSound: number; // 0 = silent (bicycle), else pitch scale
  camera: number; // chase distance
}

const W2 = (z0: number, z1: number, r: number): [number, number, number][] => [[0.3, z0, r], [-0.3, z0, r], [0.3, z1, r], [-0.3, z1, r]];

export const SPECS: Record<VehicleKind, VehicleSpec> = {
  bicycle: { label: 'Bicycle', topKmh: 25, mass: 95, half: [0.25, 0.25, 0.85], wheels: W2(0.55, -0.5, 0.33), steered: 2, driven: 'rear',
    engine: 160, brake: 4, rest: 0.25, meshY: 0.56, twoWheeler: true, seat: [0, 0.1, -0.2], showRider: true, model: 'bicycle',
    horn: 'bell', engineSound: 0, camera: 4.5 },
  scooter: { label: 'Scooter', topKmh: 85, mass: 180, half: [0.3, 0.22, 0.85], wheels: W2(0.62, -0.58, 0.22), steered: 2, driven: 'rear',
    engine: 520, brake: 6, rest: 0.28, meshY: 0.42, twoWheeler: true, seat: [0, 0.02, -0.3], showRider: true, model: 'scooter-custom',
    horn: 'scooter', engineSound: 1, camera: 4.5 },
  motorcycle: { label: 'Motorcycle', topKmh: 100, mass: 210, half: [0.3, 0.25, 1.0], wheels: W2(0.7, -0.65, 0.3), steered: 2, driven: 'rear',
    engine: 700, brake: 7, rest: 0.28, meshY: 0.5, twoWheeler: true, seat: [0, 0.1, -0.25], showRider: true, model: 'motorcycle',
    horn: 'motorcycle', engineSound: 0.8, camera: 4.8 },
  chhakdo: { label: 'Chhakdo', topKmh: 50, mass: 520, half: [0.75, 0.35, 1.6], wheels: [[0.2, 1.55, 0.3], [-0.2, 1.55, 0.3], [0.82, -0.9, 0.3], [-0.82, -0.9, 0.3]],
    steered: 2, driven: 'rear', engine: 1000, brake: 10, rest: 0.3, meshY: 0.55, twoWheeler: false, seat: [0, 0.05, 0.8], showRider: true,
    model: 'chhakdo', horn: 'auto', engineSound: 0.6, camera: 6 },
  auto: { label: 'Auto-rickshaw', topKmh: 55, mass: 420, half: [0.65, 0.5, 1.3], wheels: [[0.15, 1.0, 0.22], [-0.15, 1.0, 0.22], [0.62, -0.75, 0.22], [-0.62, -0.75, 0.22]],
    steered: 2, driven: 'rear', engine: 900, brake: 9, rest: 0.25, meshY: 0.45, twoWheeler: false, seat: [0, 0.3, 0.35], showRider: false,
    model: 'auto', horn: 'auto', engineSound: 0.7, camera: 5.5 },
  hatchback: { label: 'Hatchback', topKmh: 140, mass: 1000, half: [0.8, 0.4, 1.85], wheels: [[0.72, 1.25, 0.3], [-0.72, 1.25, 0.3], [0.72, -1.25, 0.3], [-0.72, -1.25, 0.3]],
    steered: 2, driven: 'front', engine: 1900, brake: 25, rest: 0.3, meshY: 0.55, twoWheeler: false, seat: [-0.35, 0.3, -0.2], showRider: false,
    model: 'car-white', horn: 'car', engineSound: 0.5, camera: 6.5 },
  suv: { label: 'SUV', topKmh: 150, mass: 1600, half: [0.9, 0.55, 2.2], wheels: [[0.8, 1.45, 0.38], [-0.8, 1.45, 0.38], [0.8, -1.45, 0.38], [-0.8, -1.45, 0.38]],
    steered: 2, driven: 'all', engine: 1700, brake: 35, rest: 0.32, meshY: 0.66, twoWheeler: false, seat: [-0.4, 0.4, -0.1], showRider: false,
    model: 'suv-white', horn: 'car', engineSound: 0.45, camera: 7 },
  bus: { label: 'City bus', topKmh: 70, mass: 9000, half: [1.25, 1.3, 5.25], wheels: [[1.1, 3.6, 0.48], [-1.1, 3.6, 0.48], [1.1, -3.4, 0.48], [-1.1, -3.4, 0.48]],
    steered: 2, driven: 'rear', engine: 14000, brake: 160, rest: 0.4, meshY: 0.85, twoWheeler: false, seat: [-0.8, 0.5, 4.3], showRider: false,
    model: 'bus', horn: 'bus', engineSound: 0.3, camera: 12 },
  tractor: { label: 'Tractor', topKmh: 35, mass: 2500, half: [0.75, 0.5, 1.5], wheels: [[0.55, 1.2, 0.4], [-0.55, 1.2, 0.4], [0.82, -0.75, 0.72], [-0.82, -0.75, 0.72]],
    steered: 2, driven: 'rear', engine: 4200, brake: 40, rest: 0.3, meshY: 0.95, twoWheeler: false, seat: [0, 0.48, -0.75], showRider: true,
    model: 'tractor', horn: 'bus', engineSound: 0.35, camera: 6.5 },
};

/** Traffic model → drivable kind (taking a vehicle from traffic, PROMPT §3.3). */
export function kindOfModel(m: ModelName): VehicleKind | null {
  if (m === 'scooter' || m === 'motorcycle' || m === 'auto' || m === 'chhakdo' || m === 'bus' || m === 'bicycle' || m === 'tractor') return m;
  if (m.startsWith('car-')) return 'hatchback';
  if (m.startsWith('suv-')) return 'suv';
  return null;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
const geoCache = new Map<string, THREE.BufferGeometry>();

function modelGeometry(name: ModelName): THREE.BufferGeometry {
  let geo = geoCache.get(name);
  if (!geo) {
    const g = vehicleModel(name, { rider: false, wheels: false });
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(g.attrs.color[0], 3));
    geo.setIndex(new THREE.BufferAttribute(g.index, 1));
    geoCache.set(name, geo);
  }
  return geo;
}

export interface VehicleMesh {
  root: THREE.Group;
  lean: THREE.Group;
  wheels: THREE.Object3D[];
  handle: THREE.Object3D | null;
  lampMat: THREE.MeshStandardMaterial;
}

/** Mesh for a vehicle built from the shared low-poly model kit, with separate spinning wheels. */
function kitMesh(spec: VehicleSpec, model: ModelName): VehicleMesh {
  sharedMat ??= vertexColorMaterial({ roughness: 0.5, metalness: 0.1 });
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const body = new THREE.Mesh(modelGeometry(model), sharedMat);
  body.castShadow = true;
  lean.add(body);
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.6 });
  const wheels = spec.wheels.map(([x, z, r]) => {
    // Two-wheelers have four virtual wheels for physics but show two.
    const w = new THREE.Group();
    w.position.set(spec.twoWheeler ? 0 : x, r, z);
    const width = spec.twoWheeler ? 0.08 : Math.max(0.16, r * 0.55);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 16).rotateZ(Math.PI / 2), tyre);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 0.01, 8).rotateZ(Math.PI / 2), hub);
    t.castShadow = true;
    w.add(t, h);
    lean.add(w);
    return w;
  });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.03), lampMat);
  const front = Math.max(...spec.wheels.map((w) => w[1])) + spec.wheels[0][2];
  lamp.position.set(0, spec.twoWheeler ? 1.0 : 0.75, front + 0.1);
  lean.add(lamp);
  return { root, lean, wheels, handle: null, lampMat };
}

/** Procedural unbranded Activa-style scooter (rounded panels, apron, mirrors, plate). */
function scooterMesh(color: number): VehicleMesh {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0.0 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
  const lean = new THREE.Group();
  root.add(lean);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, parent: THREE.Object3D = lean) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // Rear body: a stretched sphere tapering to the tail.
  add(new THREE.SphereGeometry(0.25, 20, 14), body, 0, 0.5, -0.42).scale.set(0.8, 0.82, 1.65);
  add(new THREE.BoxGeometry(0.3, 0.08, 0.6), black, 0, 0.28, 0.08); // floorboard
  add(new THREE.BoxGeometry(0.32, 0.03, 0.56), grey, 0, 0.33, 0.08); // rubber mat
  add(new THREE.CapsuleGeometry(0.12, 0.5, 4, 12), black, 0, 0.77, -0.4, Math.PI / 2).scale.set(1.15, 1, 0.55); // seat
  add(new THREE.TorusGeometry(0.13, 0.015, 6, 14, Math.PI), chrome, 0, 0.74, -0.78, -Math.PI / 2); // grab rail
  // Front apron: an extruded curved shield from floorboard to handlebar.
  const shield = new THREE.Shape();
  shield.moveTo(-0.19, 0); shield.lineTo(0.19, 0); shield.quadraticCurveTo(0.21, 0.45, 0.13, 0.78);
  shield.lineTo(-0.13, 0.78); shield.quadraticCurveTo(-0.21, 0.45, -0.19, 0);
  const apron = new THREE.ExtrudeGeometry(shield, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 8 });
  add(apron, body, 0, 0.3, 0.36, 0.1);
  add(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.4, 0.6).scale.set(0.6, 0.55, 1.0); // mudguard
  // Handlebar with a cowl, headlight, grips and mirrors.
  const bar = new THREE.Group();
  bar.position.set(0, 1.12, 0.46);
  lean.add(bar);
  add(new THREE.SphereGeometry(0.13, 14, 10), body, 0, 0, 0, 0, bar).scale.set(1.3, 0.55, 0.75);
  add(new THREE.BoxGeometry(0.66, 0.035, 0.035), chrome, 0, 0.02, -0.03, 0, bar);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8).rotateZ(Math.PI / 2), black, sx * 0.3, 0.02, -0.03, 0, bar);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), chrome, sx * 0.2, 0.12, -0.02, 0, bar).rotation.z = sx * -0.25;
    add(new THREE.SphereGeometry(0.04, 10, 6), black, sx * 0.23, 0.23, -0.02, 0, bar).scale.set(1.3, 0.8, 0.4);
  }
  add(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lamp, 0, -0.02, 0.09, Math.PI / 2, bar).scale.set(1.3, 1, 0.8);
  add(new THREE.BoxGeometry(0.2, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x440000 }), 0, 0.6, -0.82);
  add(new THREE.BoxGeometry(0.2, 0.1, 0.01), plate, 0, 0.45, -0.84); // number plate
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 8).rotateX(Math.PI / 2), chrome, 0.16, 0.24, -0.6); // silencer
  const wheel = (z: number) => {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 8, 20).rotateY(Math.PI / 2), black);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12).rotateZ(Math.PI / 2), grey);
    tyre.castShadow = true;
    g.add(tyre, rim);
    g.position.set(0, 0.22, z);
    lean.add(g);
    return g;
  };
  const f = wheel(0.6), r = wheel(-0.58);
  return { root, lean, wheels: [f, f, r, r], handle: bar, lampMat: lamp };
}

export class Vehicle {
  readonly chassis: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly mesh: VehicleMesh;
  readonly light: THREE.SpotLight;
  readonly spec: VehicleSpec;
  private rider: THREE.Object3D | null = null;
  private leanAngle = 0;
  private steer = 0;
  private wheelSpin = 0;
  private prevPos = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private curRot = new THREE.Quaternion();
  occupied = false;
  /** Seconds since the player last used it (old spawned vehicles are cleared first). */
  idle = 0;

  constructor(private physics: Physics, private scene: THREE.Scene, readonly kind: VehicleKind,
    x: number, y: number, z: number, heading: number, opts: { color?: number; model?: ModelName } = {}) {
    const spec = (this.spec = SPECS[kind]);
    const R = physics.R;
    this.chassis = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(x, y + spec.meshY + 0.15, z)
        .setRotation(quatY(heading)).setLinearDamping(0.05).setAngularDamping(kind === 'bus' ? 2 : 1.2).setCcdEnabled(true));
    // Box from just above the wheels' ground clearance: centre of mass kept low for stability.
    const [hx, hy, hz] = spec.half;
    const clearance = spec.twoWheeler ? 0.3 : Math.min(0.35, spec.wheels[0][2] * 0.9);
    physics.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, -spec.meshY + clearance + hy, 0).setMass(spec.mass)
      .setFriction(0.6).setCollisionGroups(groups(GROUP_VEHICLE, GROUP_WORLD | GROUP_PLAYER | GROUP_VEHICLE)), this.chassis);
    const v = physics.world.createVehicleController(this.chassis);
    v.indexUpAxis = 1;
    v.setIndexForwardAxis = 2;
    for (const [wx, wz, r] of spec.wheels) {
      // Connection at the wheel's resting height above the ground line.
      v.addWheel({ x: wx, y: -spec.meshY + r + spec.rest * 0.8, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, spec.rest, r);
    }
    const heavy = spec.mass > 800;
    for (let k = 0; k < spec.wheels.length; k++) {
      v.setWheelSuspensionStiffness(k, heavy ? 30 : 38);
      v.setWheelSuspensionCompression(k, heavy ? 4.4 : 3.2);
      v.setWheelSuspensionRelaxation(k, heavy ? 5 : 3.6);
      v.setWheelMaxSuspensionTravel(k, 0.2);
      v.setWheelMaxSuspensionForce(k, spec.mass * 50);
      v.setWheelFrictionSlip(k, spec.twoWheeler ? 2.4 : 2.0);
      v.setWheelSideFrictionStiffness(k, spec.twoWheeler ? 1.1 : 1.0);
    }
    this.controller = v;
    this.mesh = spec.model === 'scooter-custom' ? scooterMesh(opts.color ?? 0xb81d24) : kitMesh(spec, opts.model ?? spec.model);
    scene.add(this.mesh.root);
    this.light = new THREE.SpotLight(0xfff1d6, 0, kind === 'bicycle' ? 20 : 50, 0.55, 0.5, 1.2);
    this.light.position.set(0, spec.twoWheeler ? 1.05 : 0.8, Math.max(...spec.wheels.map((w) => w[1])) + 0.3);
    this.light.target.position.set(0, 0, 14);
    this.mesh.lean.add(this.light, this.light.target);
    this.capture();
    this.capture();
  }

  /** Remember the chassis pose after a physics step (for render interpolation). */
  capture() {
    const t = this.chassis.translation(), q = this.chassis.rotation();
    this.prevPos.copy(this.curPos);
    this.prevRot.copy(this.curRot);
    this.curPos.set(t.x, t.y, t.z);
    this.curRot.set(q.x, q.y, q.z, q.w);
  }

  get position(): THREE.Vector3 {
    const t = this.chassis.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get speed(): number {
    return this.controller.currentVehicleSpeed();
  }

  get focus(): THREE.Vector3 {
    return this.position.add(new THREE.Vector3(0, this.spec.twoWheeler ? 1.4 : this.spec.half[1] + 1.0, 0));
  }

  /** Distance from p to the vehicle's footprint (0 inside). */
  reach(p: THREE.Vector3): number {
    const local = p.clone().sub(this.position).applyQuaternion(this.curRot.clone().invert());
    const dx = Math.max(0, Math.abs(local.x) - this.spec.half[0]), dz = Math.max(0, Math.abs(local.z) - this.spec.half[2]);
    return Math.hypot(dx, dz);
  }

  setRider(rider: THREE.Object3D | null) {
    if (this.rider) this.mesh.lean.remove(this.rider);
    const wasOccupied = this.occupied;
    this.rider = rider;
    this.occupied = !!rider;
    this.idle = 0;
    // Parked: stop, stand upright and stay upright (a riderless scooter at speed would tip, slide and
    // could be shoved under the ground). Pitch and roll come back when someone gets on.
    this.chassis.setEnabledRotations(!!rider, true, !!rider, true);
    if (!rider && wasOccupied) this.park();
    if (rider) {
      const [x, y, z] = this.spec.seat;
      rider.position.set(x, y + (this.spec.twoWheeler || this.kind === 'chhakdo' || this.kind === 'tractor' ? this.seatLift() : 0), z);
      rider.rotation.set(0, 0, 0);
      rider.visible = this.spec.showRider;
      this.mesh.lean.add(rider);
    }
  }

  /** Come to rest where it is, upright, at the current heading. */
  park() {
    const t = this.chassis.translation();
    this.chassis.setRotation(quatY(this.yaw()), true);
    this.chassis.setLinvel({ x: 0, y: Math.min(0, this.chassis.linvel().y), z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setTranslation({ x: t.x, y: t.y + 0.05, z: t.z }, true);
  }

  /** The 'ride' pose is built for a 0.8 m scooter seat; lift or lower for other seats. */
  private seatLift(): number {
    return { bicycle: 0.12, motorcycle: 0.02, chhakdo: 0.08, tractor: 0.45 }[this.kind as string] ?? 0;
  }

  /** Freeze while the ground under it is not loaded, so it can't fall away. */
  setFrozen(frozen: boolean) {
    if (this.chassis.isEnabled() === !frozen) return;
    this.chassis.setEnabled(!frozen);
  }

  teleport(x: number, y: number, z: number, heading = this.yaw()) {
    this.chassis.setTranslation({ x, y: y + this.spec.meshY + 0.15, z }, true);
    this.chassis.setRotation(quatY(heading), true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.capture();
    this.capture();
  }

  resetUpright() {
    const t = this.chassis.translation();
    const yaw = this.yaw();
    this.chassis.setTranslation({ x: t.x, y: t.y + 0.8, z: t.z }, true);
    this.chassis.setRotation(quatY(yaw), true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  yaw(): number {
    const q = this.chassis.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return Math.atan2(fwd.x, fwd.z);
  }

  /** Physics-rate update (fixed dt). */
  drive(input: Input | null, dt: number) {
    const v = this.controller, spec = this.spec;
    const speed = this.speed;
    const top = spec.topKmh / 3.6;
    let throttle = 0, brake = 0, steerIn = 0;
    if (input && this.occupied) {
      throttle = input.axis('KeyS', 'KeyW');
      steerIn = input.axis('KeyD', 'KeyA');
      if (input.held('Space')) brake = 1;
      if (throttle < 0 && speed > 0.5) { brake = Math.max(brake, -throttle); throttle = 0; }
    } else {
      brake = 0.4;
    }
    const lock = spec.twoWheeler ? 0.5 : spec.mass > 5000 ? 0.55 : 0.6;
    const maxSteer = THREE.MathUtils.lerp(lock, spec.twoWheeler ? 0.1 : 0.15, Math.min(Math.abs(speed) / top, 1));
    this.steer = THREE.MathUtils.lerp(this.steer, steerIn * maxSteer, 1 - Math.exp(-dt * (spec.mass > 5000 ? 4 : 8)));
    const limiter = throttle > 0 ? Math.max(0, 1 - Math.max(0, speed) / top) ** 0.6 : 1;
    const reverseCap = throttle < 0 ? (speed > -4 ? 0.4 : 0) : 1;
    const n = spec.wheels.length;
    for (let k = 0; k < n; k++) {
      const front = k < spec.steered;
      const driven = spec.driven === 'all' || (spec.driven === 'front') === front;
      v.setWheelSteering(k, front ? this.steer : 0);
      v.setWheelEngineForce(k, driven ? throttle * spec.engine * limiter * reverseCap : 0);
      v.setWheelBrake(k, brake * spec.brake);
    }
    v.updateVehicle(dt);
    if (this.occupied) this.idle = 0;
  }

  /** Render-rate update: sync mesh, lean, wheels, headlight. */
  sync(dt: number, night: number, alpha = 1) {
    if (!this.occupied) this.idle += dt;
    this.mesh.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.mesh.root.position.y -= this.spec.meshY;
    this.mesh.root.quaternion.slerpQuaternions(this.prevRot, this.curRot, alpha);
    const speed = this.speed;
    if (this.spec.twoWheeler) {
      // Lean into turns like a two-wheeler: tan(lean) = lateral acceleration / g = v * yaw rate / g.
      const yawRate = this.chassis.angvel().y;
      const targetLean = THREE.MathUtils.clamp(-Math.atan((speed * yawRate) / 9.81), -0.6, 0.6);
      this.leanAngle = THREE.MathUtils.lerp(this.leanAngle, targetLean, 1 - Math.exp(-dt * 6));
      this.mesh.lean.rotation.z = this.leanAngle;
    }
    if (this.mesh.handle) this.mesh.handle.rotation.y = this.steer;
    this.wheelSpin += (speed / this.spec.wheels[0][2]) * dt;
    this.mesh.wheels.forEach((w, k) => {
      w.rotation.set(this.wheelSpin, k < this.spec.steered && !this.mesh.handle ? this.steer : 0, 0, 'YXZ');
    });
    const on = this.occupied && night > 0.3;
    this.light.intensity = on ? (this.spec.twoWheeler ? 40 : 70) : 0;
    this.mesh.lampMat.emissiveIntensity = on ? 2 : 0.05;
  }

  dispose() {
    this.setRider(null);
    this.physics.world.removeRigidBody(this.chassis);
    this.physics.world.removeVehicleController(this.controller);
    this.scene.remove(this.mesh.root);
  }
}

export function quatY(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

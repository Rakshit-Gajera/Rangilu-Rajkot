import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { Input } from '../app/input';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';

const TOP_SPEED = 85 / 3.6; // PROMPT §3.3
const ENGINE = 520; // N per driven wheel
const BRAKE = 6;
const WHEELS: [number, number][] = [[0.34, 0.62], [-0.34, 0.62], [0.34, -0.58], [-0.34, -0.58]]; // x, z (chassis)

/** Procedural unbranded Activa-style scooter (rounded panels, apron, mirrors, plate). Local +z is forward. */
function scooterMesh(color: number) {
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
  // Rear body: a stretched sphere tapering to the tail, side panels slightly flared.
  add(new THREE.SphereGeometry(0.25, 20, 14), body, 0, 0.5, -0.42).scale.set(0.8, 0.82, 1.65);
  add(new THREE.BoxGeometry(0.3, 0.08, 0.6), black, 0, 0.28, 0.08); // floorboard
  add(new THREE.BoxGeometry(0.32, 0.03, 0.56), grey, 0, 0.33, 0.08); // rubber mat
  // Seat: a long rounded cushion.
  add(new THREE.CapsuleGeometry(0.12, 0.5, 4, 12), black, 0, 0.77, -0.4, Math.PI / 2).scale.set(1.15, 1, 0.55);
  add(new THREE.TorusGeometry(0.13, 0.015, 6, 14, Math.PI), chrome, 0, 0.74, -0.78, -Math.PI / 2); // grab rail
  // Front apron: an extruded curved shield from floorboard to handlebar, plus the leg-shield.
  const shield = new THREE.Shape();
  shield.moveTo(-0.19, 0); shield.lineTo(0.19, 0); shield.quadraticCurveTo(0.21, 0.45, 0.13, 0.78);
  shield.lineTo(-0.13, 0.78); shield.quadraticCurveTo(-0.21, 0.45, -0.19, 0);
  const apron = new THREE.ExtrudeGeometry(shield, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 8 });
  add(apron, body, 0, 0.3, 0.36, 0.1);
  add(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.4, 0.6).scale.set(0.6, 0.55, 1.0); // front mudguard
  // Handlebar with a cowl, headlight, grips and mirrors.
  const bar = new THREE.Group();
  bar.position.set(0, 1.12, 0.46);
  lean.add(bar);
  add(new THREE.SphereGeometry(0.13, 14, 10), body, 0, 0, 0, 0, bar).scale.set(1.3, 0.55, 0.75); // cowl
  add(new THREE.BoxGeometry(0.66, 0.035, 0.035), chrome, 0, 0.02, -0.03, 0, bar);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8).rotateZ(Math.PI / 2), black, sx * 0.3, 0.02, -0.03, 0, bar); // grips
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), chrome, sx * 0.2, 0.12, -0.02, 0, bar).rotation.z = sx * -0.25;
    add(new THREE.SphereGeometry(0.04, 10, 6), black, sx * 0.23, 0.23, -0.02, 0, bar).scale.set(1.3, 0.8, 0.4); // mirrors
  }
  const headlight = add(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lamp, 0, -0.02, 0.09, Math.PI / 2, bar);
  headlight.scale.set(1.3, 1, 0.8);
  add(new THREE.BoxGeometry(0.2, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x440000 }), 0, 0.6, -0.82); // tail lamp
  add(new THREE.BoxGeometry(0.2, 0.1, 0.01), plate, 0, 0.45, -0.84); // number plate
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 8).rotateX(Math.PI / 2), chrome, 0.16, 0.24, -0.6); // silencer
  const wheel = () => {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 8, 20).rotateY(Math.PI / 2), black);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12).rotateZ(Math.PI / 2), grey);
    tyre.castShadow = true;
    g.add(tyre, rim);
    return g;
  };
  const front = wheel();
  front.position.set(0, 0.22, 0.6);
  const rear = wheel();
  rear.position.set(0, 0.22, -0.58);
  lean.add(front, rear);
  const handle = bar;
  return { root, lean, front, rear, handle, headlight, lampMat: lamp };
}

export class Scooter {
  readonly chassis: RAPIER.RigidBody;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  readonly mesh: ReturnType<typeof scooterMesh>;
  readonly light: THREE.SpotLight;
  private rider: THREE.Object3D | null = null;
  private leanAngle = 0;
  private steer = 0;
  private wheelSpin = 0;
  private prevPos = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private curRot = new THREE.Quaternion();
  occupied = false;

  constructor(physics: Physics, scene: THREE.Scene, x: number, y: number, z: number, heading: number, color = 0xb81d24) {
    const R = physics.R;
    this.chassis = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(x, y + 0.6, z)
        .setRotation(quatY(heading)).setLinearDamping(0.05).setAngularDamping(1.2).setCcdEnabled(true));
    // Low, heavy box: scooter + rider ~ 180 kg, centre of mass kept low for stability.
    physics.world.createCollider(R.ColliderDesc.cuboid(0.3, 0.22, 0.85).setTranslation(0, 0.1, 0).setMass(180)
      .setFriction(0.6).setCollisionGroups(groups(GROUP_VEHICLE, GROUP_WORLD | GROUP_PLAYER | GROUP_VEHICLE)), this.chassis);
    const v = physics.world.createVehicleController(this.chassis);
    v.indexUpAxis = 1;
    v.setIndexForwardAxis = 2;
    for (const [wx, wz] of WHEELS) {
      v.addWheel({ x: wx, y: 0.0, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.28, 0.24);
    }
    for (let k = 0; k < 4; k++) {
      v.setWheelSuspensionStiffness(k, 38);
      v.setWheelSuspensionCompression(k, 3.2);
      v.setWheelSuspensionRelaxation(k, 3.6);
      v.setWheelMaxSuspensionTravel(k, 0.2);
      v.setWheelMaxSuspensionForce(k, 9000);
      v.setWheelFrictionSlip(k, 2.4);
      v.setWheelSideFrictionStiffness(k, 1.1);
    }
    this.vehicle = v;
    this.mesh = scooterMesh(color);
    scene.add(this.mesh.root);
    this.light = new THREE.SpotLight(0xfff1d6, 0, 45, 0.5, 0.5, 1.2);
    this.light.position.set(0, 1.05, 0.6);
    this.light.target.position.set(0, 0, 12);
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
    return this.vehicle.currentVehicleSpeed();
  }

  get focus(): THREE.Vector3 {
    return this.position.add(new THREE.Vector3(0, 1.4, 0));
  }

  setRider(rider: THREE.Object3D | null) {
    if (this.rider) this.mesh.lean.remove(this.rider);
    this.rider = rider;
    this.occupied = !!rider;
    if (rider) {
      rider.position.set(0, 0.02, -0.3);
      rider.rotation.set(0, 0, 0);
      this.mesh.lean.add(rider);
    }
  }

  /** Freeze the parked scooter while the ground under it is not loaded, so it can't fall away. */
  setFrozen(frozen: boolean) {
    if (this.chassis.isEnabled() === !frozen) return;
    this.chassis.setEnabled(!frozen);
  }

  teleport(x: number, y: number, z: number) {
    this.chassis.setTranslation({ x, y: y + 0.6, z }, true);
    this.chassis.setRotation(quatY(this.yaw()), true);
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
    const v = this.vehicle;
    const speed = this.speed;
    let throttle = 0, brake = 0, steerIn = 0;
    if (input && this.occupied) {
      throttle = input.axis('KeyS', 'KeyW');
      steerIn = input.axis('KeyD', 'KeyA');
      if (input.held('Space')) brake = 1;
      if (throttle < 0 && speed > 0.5) { brake = Math.max(brake, -throttle); throttle = 0; }
    } else {
      brake = 0.4;
    }
    const maxSteer = THREE.MathUtils.lerp(0.5, 0.1, Math.min(Math.abs(speed) / TOP_SPEED, 1));
    this.steer = THREE.MathUtils.lerp(this.steer, steerIn * maxSteer, 1 - Math.exp(-dt * 8));
    const limiter = throttle > 0 ? Math.max(0, 1 - Math.max(0, speed) / TOP_SPEED) ** 0.6 : 1;
    const reverseCap = throttle < 0 ? (speed > -4 ? 0.4 : 0) : 1;
    for (let k = 0; k < 4; k++) {
      v.setWheelSteering(k, k < 2 ? this.steer : 0);
      v.setWheelEngineForce(k, k >= 2 ? throttle * ENGINE * limiter * reverseCap : 0);
      v.setWheelBrake(k, brake * BRAKE);
    }
    v.updateVehicle(dt);
  }

  /** Render-rate update: sync mesh, lean, wheels, headlight. */
  sync(dt: number, night: number, alpha = 1) {
    this.mesh.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.mesh.root.position.y -= 0.42;
    this.mesh.root.quaternion.slerpQuaternions(this.prevRot, this.curRot, alpha);
    const speed = this.speed;
    // Lean into turns like a two-wheeler: tan(lean) = lateral acceleration / g = v * yaw rate / g.
    const yawRate = this.chassis.angvel().y;
    const targetLean = THREE.MathUtils.clamp(-Math.atan((speed * yawRate) / 9.81), -0.6, 0.6);
    this.leanAngle = THREE.MathUtils.lerp(this.leanAngle, targetLean, 1 - Math.exp(-dt * 6));
    this.mesh.lean.rotation.z = this.leanAngle;
    this.mesh.handle.rotation.y = this.steer;
    this.wheelSpin += (speed / 0.22) * dt;
    this.mesh.front.rotation.x = this.wheelSpin;
    this.mesh.rear.rotation.x = this.wheelSpin;
    const on = this.occupied && night > 0.3;
    this.light.intensity = on ? 40 : 0;
    this.mesh.lampMat.emissiveIntensity = on ? 2 : 0.05;
  }
}

function quatY(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

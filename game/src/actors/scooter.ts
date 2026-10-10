import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Input } from '../app/input';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';

const TOP_SPEED = 85 / 3.6; // PROMPT §3.3
const ENGINE = 520; // N per driven wheel
const BRAKE = 6;
const WHEELS: [number, number][] = [[0.34, 0.62], [-0.34, 0.62], [0.34, -0.58], [-0.34, -0.58]]; // x, z (chassis)

/** Procedural unbranded Activa-style scooter. Local +z is forward. */
function scooterMesh(color: number) {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0.0 });
  const lean = new THREE.Group();
  root.add(lean);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    lean.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.34, 0.08, 0.62), black, 0, 0.28, 0.05); // floorboard
  add(new THREE.BoxGeometry(0.36, 0.42, 0.62), body, 0, 0.5, -0.42); // rear body
  add(new THREE.BoxGeometry(0.30, 0.10, 0.62), black, 0, 0.76, -0.38); // seat
  add(new THREE.BoxGeometry(0.34, 0.7, 0.14), body, 0, 0.55, 0.42, -0.25); // front apron
  add(new THREE.BoxGeometry(0.08, 0.5, 0.08), black, 0, 0.98, 0.5, -0.35); // steering column
  const handle = add(new THREE.BoxGeometry(0.62, 0.05, 0.05), chrome, 0, 1.18, 0.42);
  const headlight = add(new THREE.BoxGeometry(0.16, 0.1, 0.06), lamp, 0, 1.08, 0.52);
  add(new THREE.BoxGeometry(0.2, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x440000 }), 0, 0.68, -0.74); // tail lamp
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16).rotateZ(Math.PI / 2);
  const front = add(wheelGeo, black, 0, 0.22, 0.6);
  const rear = add(wheelGeo, black, 0, 0.22, -0.58);
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

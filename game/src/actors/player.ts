import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Input } from '../app/input';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import type { FollowCamera } from './camera';

const WALK = 1.6, RUN = 3.6, SPRINT = 6.2;
const HALF_HEIGHT = 0.55, RADIUS = 0.3;

/** Simple procedural person (placeholder until the CC0 rig in P5): kurta, trousers, head. */
function personMesh(): { root: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[] } {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.8 });
  const kurta = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.75, 10), kurta);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
  head.position.y = 1.62;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.y = 1.64;
  root.add(torso, head, hairCap);
  const limb = (mat: THREE.Material, len: number, r: number, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 8), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const legs = [limb(pants, 0.78, 0.075, -0.1, 0.78), limb(pants, 0.78, 0.075, 0.1, 0.78)];
  const arms = [limb(kurta, 0.62, 0.055, -0.27, 1.45), limb(kurta, 0.62, 0.055, 0.27, 1.45)];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, legs, arms };
}

export class Player {
  readonly object: THREE.Group;
  readonly body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private legs: THREE.Object3D[];
  private arms: THREE.Object3D[];
  private vy = 0;
  private phase = 0;
  private heading = 0;
  grounded = false;
  speed = 0;
  visible = true;

  constructor(private physics: Physics, scene: THREE.Scene, x: number, y: number, z: number) {
    const R = physics.R;
    const p = personMesh();
    this.object = p.root;
    this.legs = p.legs;
    this.arms = p.arms;
    scene.add(this.object);
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + HALF_HEIGHT + RADIUS, z));
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setCollisionGroups(groups(GROUP_PLAYER, GROUP_WORLD | GROUP_VEHICLE)), this.body);
    const c = physics.world.createCharacterController(0.04);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.enableAutostep(0.35, 0.25, false); // kerbs and steps up to 35 cm (PROMPT §3.2)
    c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    this.controller = c;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y - HALF_HEIGHT - RADIUS, t.z);
  }

  /** Camera focus: roughly head height. */
  get focus(): THREE.Vector3 {
    return this.position.add(new THREE.Vector3(0, 1.55, 0));
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.object.visible = v;
    this.collider.setEnabled(v);
  }

  teleport(x: number, y: number, z: number) {
    this.body.setNextKinematicTranslation({ x, y: y + HALF_HEIGHT + RADIUS + 0.05, z });
    this.body.setTranslation({ x, y: y + HALF_HEIGHT + RADIUS + 0.05, z }, true);
    this.vy = 0;
  }

  update(input: Input, cam: FollowCamera, dt: number) {
    if (!this.visible) return;
    const { forward, right } = cam.basis();
    const move = new THREE.Vector3()
      .addScaledVector(forward, input.axis('KeyS', 'KeyW'))
      .addScaledVector(right, input.axis('KeyA', 'KeyD'));
    if (move.lengthSq() > 1) move.normalize();
    const target = input.held('ShiftLeft') || input.held('ShiftRight') ? SPRINT : input.held('ControlLeft') ? WALK : RUN;
    const wantSpeed = move.lengthSq() > 0 ? target : 0;
    this.speed = THREE.MathUtils.lerp(this.speed, wantSpeed, 1 - Math.exp(-dt * 10));
    if (move.lengthSq() > 0) this.heading = Math.atan2(move.x, move.z);

    if (this.grounded) {
      this.vy = -1;
      if (input.hit('Space')) this.vy = 4.6;
    } else {
      this.vy = Math.max(this.vy - 9.81 * dt, -40);
    }
    const desired = {
      x: Math.sin(this.heading) * this.speed * dt * (move.lengthSq() > 0 ? 1 : 0),
      y: this.vy * dt,
      z: Math.cos(this.heading) * this.speed * dt * (move.lengthSq() > 0 ? 1 : 0),
    };
    this.controller.computeColliderMovement(this.collider, desired, undefined, GROUP_WORLD << 16 | (GROUP_WORLD | GROUP_VEHICLE));
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // Safety net: fell through the world -> back onto the ground (PROMPT §9.1).
    if (t.y < -200) {
      const g = this.physics.groundAt(t.x, t.z);
      this.teleport(t.x, (g ?? 50) + 1, t.z);
    }

    // Visual: face movement, swing limbs with speed.
    const p = this.position;
    this.object.position.copy(p);
    this.object.rotation.y = THREE.MathUtils.lerp(this.object.rotation.y,
      this.object.rotation.y + angleDiff(this.object.rotation.y, this.heading), 1 - Math.exp(-dt * 12));
    this.phase += dt * (2 + this.speed * 2.2);
    const swing = Math.min(this.speed / RUN, 1.3) * 0.6 * Math.sin(this.phase);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
  }
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { Input } from '../app/input';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import type { FollowCamera } from './camera';
import { Character } from './character';

const WALK = 1.6, RUN = 3.6, SPRINT = 6.2;
const HALF_HEIGHT = 0.55, RADIUS = 0.3;

export class Player {
  readonly object: THREE.Group;
  readonly character: Character;
  readonly body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private vy = 0;
  private heading = 0;
  private jumpQueued = false;
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();
  grounded = false;
  speed = 0;
  /** Seconds of faster sprinting left (street food, PROMPT §3.6). */
  boost = 0;
  visible = true;

  constructor(physics: Physics, scene: THREE.Scene, x: number, y: number, z: number) {
    const R = physics.R;
    this.character = new Character();
    this.object = this.character.root;
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
    this.capture();
    this.capture();
  }

  /** Remember the body position after a physics step (for render interpolation). */
  capture() {
    const t = this.body.translation();
    this.prev.copy(this.cur);
    this.cur.set(t.x, t.y - HALF_HEIGHT - RADIUS, t.z);
  }

  /** Latch a jump request from a key press; consumed by the next physics step. */
  requestJump() {
    this.jumpQueued = true;
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
    this.capture();
    this.capture();
  }

  update(input: Input, cam: FollowCamera, dt: number) {
    if (!this.visible) return;
    const { forward, right } = cam.basis();
    const move = new THREE.Vector3()
      .addScaledVector(forward, input.axis('KeyS', 'KeyW'))
      .addScaledVector(right, input.axis('KeyA', 'KeyD'));
    if (move.lengthSq() > 1) move.normalize();
    this.boost = Math.max(0, this.boost - dt);
    const sprint = SPRINT * (this.boost > 0 ? 1.3 : 1);
    const target = input.held('ShiftLeft') || input.held('ShiftRight') ? sprint : input.held('ControlLeft') ? WALK : RUN;
    const wantSpeed = move.lengthSq() > 0 ? target : 0;
    this.speed = THREE.MathUtils.lerp(this.speed, wantSpeed, 1 - Math.exp(-dt * 10));
    if (move.lengthSq() > 0) this.heading = Math.atan2(move.x, move.z);

    if (this.grounded) {
      this.vy = -1;
      if (this.jumpQueued) this.vy = 4.6;
    } else {
      this.vy = Math.max(this.vy - 9.81 * dt, -40);
    }
    this.jumpQueued = false;
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

  }

  /** Render-rate visuals: interpolated position, facing, limb swing. */
  render(alpha: number, dt: number) {
    if (!this.visible) return;
    this.object.position.lerpVectors(this.prev, this.cur, alpha);
    this.object.rotation.y = THREE.MathUtils.lerp(this.object.rotation.y,
      this.object.rotation.y + angleDiff(this.object.rotation.y, this.heading), 1 - Math.exp(-dt * 12));
    this.character.animate(dt, this.speed, !this.grounded && this.vy > -3);
  }

  /** Sitting on a two-wheeler: the scooter carries the mesh, we only pose it. */
  ridePose(dt: number) {
    this.character.animate(dt, 0, false);
  }
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

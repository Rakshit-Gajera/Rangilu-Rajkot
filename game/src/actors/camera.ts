import * as THREE from 'three';
import type { Input } from '../app/input';
import { GROUP_WORLD, type Physics } from '../physics/physics';

/** Third-person spring-arm camera with a collision ray (PROMPT §9.2); C toggles first person. */
export class FollowCamera {
  yaw = 0;
  pitch = -0.18;
  distance = 4.5;
  firstPerson = false;
  /** Settings: look speed multiplier, inverted vertical look, base field of view. */
  sensitivity = 1;
  invertY = false;
  baseFov = 62;
  /** Accessibility: no speed FOV kick and no automatic swing behind vehicles. */
  reduceMotion = false;
  private current = 4.5;
  private target = new THREE.Vector3();
  private idle = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, private physics: Physics) {}

  update(input: Input, focus: THREE.Vector3, dt: number,
    opts: { minDist?: number; fovBoost?: number; chaseYaw?: number } = {}) {
    this.idle = input.mouseDX || input.mouseDY ? 0 : this.idle + dt;
    // Chase camera: drift back behind the vehicle when the mouse is idle (PROMPT §9.3).
    if (opts.chaseYaw !== undefined && this.idle > 0.8 && !this.reduceMotion) {
      let d = opts.chaseYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 2.5));
    }
    this.yaw -= input.mouseDX * 0.0025 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1), -1.2, 1.1);
    if (input.wheel) this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.8, opts.minDist ?? 2.5, 14);
    if (input.hit('KeyC')) this.firstPerson = !this.firstPerson;
    this.target.lerp(focus, 1 - Math.exp(-dt * 18));
    if (this.target.distanceToSquared(focus) > 100) this.target.copy(focus);

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let want = this.firstPerson ? 0.01 : Math.max(this.distance, opts.minDist ?? 0);
    if (!this.firstPerson) {
      const R = this.physics.R;
      const hit = this.physics.world.castRay(new R.Ray(this.target, dir), want, true, undefined, GROUP_WORLD << 16 | GROUP_WORLD);
      if (hit) want = Math.max(0.4, hit.timeOfImpact - 0.25);
    }
    this.current = want < this.current ? want : THREE.MathUtils.lerp(this.current, want, 1 - Math.exp(-dt * 4));
    this.camera.position.copy(this.target).addScaledVector(dir, this.current);
    this.camera.lookAt(this.target);
    const fov = this.baseFov + (this.reduceMotion ? 0 : opts.fovBoost ?? 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-dt * 3));
      this.camera.updateProjectionMatrix();
    }
  }

  /** Unit vectors on the ground plane for camera-relative movement. */
  basis(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { forward, right };
  }
}

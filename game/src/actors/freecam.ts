import * as THREE from 'three';
import type { Input } from '../app/input';

/**
 * Free-flying camera (PROMPT §3.5): the drone over the city, and the photo-mode camera.
 * WASD fly, Space up, Ctrl down, Shift faster, mouse looks, wheel changes speed.
 */
export class FreeCamera {
  position = new THREE.Vector3();
  yaw = 0;
  pitch = -0.3;
  speed: number;
  private vel = new THREE.Vector3();

  constructor(readonly baseSpeed: number, readonly minSpeed: number, readonly maxSpeed: number) {
    this.speed = baseSpeed;
  }

  /** Start from the current view. */
  begin(camera: THREE.PerspectiveCamera) {
    this.position.copy(camera.position);
    const d = camera.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.vel.set(0, 0, 0);
  }

  update(input: Input, camera: THREE.PerspectiveCamera, dt: number, groundAt: (x: number, z: number) => number | null) {
    this.yaw -= input.mouseDX * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * 0.002, -1.5, 1.2);
    if (input.wheel) this.speed = THREE.MathUtils.clamp(this.speed * (input.wheel < 0 ? 1.25 : 0.8), this.minSpeed, this.maxSpeed);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new THREE.Vector3()
      .addScaledVector(fwd, input.axis('KeyS', 'KeyW'))
      .addScaledVector(right, input.axis('KeyA', 'KeyD'))
      .addScaledVector(new THREE.Vector3(0, 1, 0), input.axis('ControlLeft', 'Space'));
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(this.speed * (input.held('ShiftLeft') || input.held('ShiftRight') ? 3 : 1));
    this.vel.lerp(want, 1 - Math.exp(-dt * 4)); // smooth, drone-like
    this.position.addScaledVector(this.vel, dt);
    // Never below the ground (or 1.5 m over it).
    const g = groundAt(this.position.x, this.position.z);
    if (g !== null && this.position.y < g + 1.5) { this.position.y = g + 1.5; this.vel.y = Math.max(0, this.vel.y); }
    this.position.y = Math.min(this.position.y, 1500);
    camera.position.copy(this.position);
    camera.lookAt(this.position.clone().add(fwd));
  }
}

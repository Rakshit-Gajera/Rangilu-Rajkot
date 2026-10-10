import * as THREE from 'three';
import { worldUniforms } from './materials';

/**
 * Weather (PROMPT §3.4): clear, summer haze, or monsoon rain with wet, shiny roads.
 * States blend over a few seconds; rain is a box of falling streaks that follows the camera (one draw call).
 */
export type WeatherKind = 'clear' | 'haze' | 'rain';
export const WEATHERS: WeatherKind[] = ['clear', 'haze', 'rain'];

const STREAKS = 6000;
const BOX = 70; // metres around the camera
const HEIGHT = 36;

export class Weather {
  kind: WeatherKind = 'clear';
  /** Blended amounts, 0..1. */
  rain = 0;
  haze = 0;
  overcast = 0;
  private wet = 0;
  private time = 0;
  private streaks: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const pos = new Float32Array(STREAKS * 2 * 3);
    const end = new Float32Array(STREAKS * 2);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < STREAKS; k++) {
      const x = rnd() * BOX, y = rnd() * HEIGHT, z = rnd() * BOX;
      pos.set([x, y, z, x, y, z], k * 6);
      end[k * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(1.2, 0.6) } },
      vertexShader: /* glsl */ `
        attribute float aEnd; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; varying float vA;
        void main() {
          vec3 p = position;
          float fall = uTime * 11.0;
          p.y = mod(p.y - fall, ${HEIGHT.toFixed(1)});
          p.xz = mod(p.xz - uCam.xz + uWind * (p.y / 11.0), ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
          vec3 w = vec3(uCam.x + p.x, uCam.y - ${(HEIGHT / 2).toFixed(1)} + p.y, uCam.z + p.z);
          w += aEnd * vec3(uWind.x, 11.0, uWind.y) * 0.045; // streak length ~ motion blur
          vA = 1.0 - aEnd * 0.7;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount; varying float vA;
        void main() { gl_FragColor = vec4(0.75, 0.78, 0.82, 0.35 * uAmount * vA); }`,
    });
    this.streaks = new THREE.LineSegments(geo, this.mat);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    scene.add(this.streaks);
  }

  /** Change the weather; `instant` skips the blend (tests, loading a save). */
  set(kind: WeatherKind, instant = false) {
    this.kind = kind;
    if (instant) {
      this.rain = this.overcast = kind === 'rain' ? 1 : 0;
      this.haze = kind === 'haze' ? 1 : 0;
      this.wet = kind === 'rain' ? 1 : 0;
    }
  }

  /** month: 0–11 (the season fills the rivers from July to September). */
  update(dt: number, camera: THREE.Camera, month = 9) {
    this.time += dt;
    const k = 1 - Math.exp(-dt / 4); // ~4 s blend
    const toward = (v: number, t: number) => v + (t - v) * k;
    this.rain = toward(this.rain, this.kind === 'rain' ? 1 : 0);
    this.overcast = toward(this.overcast, this.kind === 'rain' ? 1 : 0);
    this.haze = toward(this.haze, this.kind === 'haze' ? 1 : 0);
    // Roads get wet quickly in rain and dry slowly after it.
    this.wet = this.kind === 'rain' ? Math.min(1, this.wet + dt / 8) : Math.max(0, this.wet - dt / 90);
    worldUniforms.uWet.value = this.wet;
    const season = month >= 6 && month <= 8 ? 1 : month === 5 || month === 9 ? 0.35 : 0;
    worldUniforms.uRiver.value = Math.max(season, this.wet * 0.85);
    this.streaks.visible = this.rain > 0.02;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uAmount.value = this.rain;
    this.mat.uniforms.uCam.value.copy(camera.position);
  }
}

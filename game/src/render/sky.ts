import * as SunCalcNs from 'suncalc';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { worldUniforms } from './materials';

// suncalc is CommonJS: depending on the bundler the API is on the namespace or on .default.
const SunCalc = ((SunCalcNs as unknown as { default?: typeof SunCalcNs }).default ?? SunCalcNs) as typeof SunCalcNs;

const LAT = 22.30;
const LON = 70.80;
const IST_OFFSET_H = 5.5;

/** Game clock: hours in local Rajkot time (IST) on a calendar date. One game day = 48 real minutes. */
export class Clock {
  hours: number;
  date: Date; // calendar day (UTC midnight of the local date)
  speed = 24 / (48 * 60); // game hours per real second

  constructor(hours = 18.5, date = new Date()) {
    this.hours = hours;
    this.date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }

  advance(dt: number) {
    this.hours += dt * this.speed;
    while (this.hours >= 24) {
      this.hours -= 24;
      this.date = new Date(this.date.getTime() + 86400_000);
    }
  }

  /** Real-world instant matching the game time (for suncalc). */
  instant(): Date {
    return new Date(this.date.getTime() + (this.hours - IST_OFFSET_H) * 3600_000);
  }

  label(): string {
    const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** Direction towards a body from suncalc altitude/azimuth (azimuth 0 = south, + towards west). */
export function skyDirection(altitude: number, azimuth: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), Math.cos(azimuth) * Math.cos(altitude));
}

export class Environment {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a7458, 1);
  readonly fog = new THREE.FogExp2(0xc9b9a0, 0.0011);
  private sunDir = new THREE.Vector3();
  private tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 9; // dusty Saurashtra haze
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.012;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);
    scene.add(this.hemi);
    scene.fog = this.fog;

    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.near = 1; c.far = 900;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
    }
    scene.add(this.sun, this.sun.target);
  }

  update(clock: Clock, focus: THREE.Vector3) {
    const t = clock.instant();
    const sp = SunCalc.getPosition(t, LAT, LON);
    const mp = SunCalc.getMoonPosition(t, LAT, LON);
    skyDirection(sp.altitude, sp.azimuth, this.sunDir);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);

    const alt = sp.altitude;
    const day = THREE.MathUtils.smoothstep(alt, -0.12, 0.15); // twilight -> day
    const golden = (1 - THREE.MathUtils.smoothstep(alt, 0.02, 0.35)) * day;
    const night = 1 - THREE.MathUtils.smoothstep(alt, -0.2, -0.02);
    worldUniforms.uNight.value = night;
    worldUniforms.uHour.value = clock.hours;

    // Light from the sun by day, a dim blue moon at night.
    const moonUp = mp.altitude > 0;
    const lightDir = day > 0.02 || !moonUp ? this.sunDir : skyDirection(mp.altitude, mp.azimuth, new THREE.Vector3());
    this.sun.position.copy(focus).addScaledVector(lightDir, 400);
    this.sun.target.position.copy(focus);
    this.sun.color.setRGB(1, 0.92 - golden * 0.25, 0.82 - golden * 0.45);
    this.sun.intensity = day * 3.2 + (moonUp ? (1 - day) * 0.25 : 0);
    if (day < 0.02) this.sun.color.setRGB(0.6, 0.7, 1.0);
    this.hemi.intensity = 0.25 + day * 1.1;
    this.hemi.color.setRGB(0.55 + 0.2 * day, 0.62 + 0.2 * day, 0.85);
    this.hemi.groundColor.setRGB(0.25 + 0.3 * day, 0.2 + 0.25 * day, 0.16 + 0.18 * day);

    // Haze colour follows the sky: warm dust by day, orange at golden hour, deep blue at night.
    this.tmpColor.setRGB(0.80, 0.74, 0.64).lerp(new THREE.Color(0.86, 0.62, 0.42), golden).lerp(new THREE.Color(0.04, 0.05, 0.09), night);
    this.fog.color.copy(this.tmpColor);
    this.fog.density = 0.0009 + 0.0004 * golden;
    this.renderer.toneMappingExposure = 0.55 + 0.35 * day + 0.25 * night;
  }
}

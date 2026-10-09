import { getMoonPosition, getPosition, getTimes } from 'suncalc';
import * as THREE from 'three';
import { worldUniforms } from './materials';

const DEG = Math.PI / 180;

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

/** Local hour (IST) 40 minutes before sunset today. */
export function goldenHour(date = new Date()): number {
  const sunset = getTimes(date, LAT, LON).sunset;
  if (!sunset) return 17.5;
  const h =((sunset.getUTCHours() + sunset.getUTCMinutes() / 60 + IST_OFFSET_H) % 24) - 2 / 3;
  return Number.isFinite(h) ? h : 17.5;
}

/** Sun or moon position in radians: altitude above the horizon, azimuth clockwise from north. */
export function bodyPosition(body: 'sun' | 'moon', date: Date): { altitude: number; azimuth: number } {
  const p = body === 'sun' ? getPosition(date, LAT, LON) : getMoonPosition(date, LAT, LON); // suncalc 2.x: degrees
  return { altitude: p.altitude * DEG, azimuth: p.azimuth * DEG };
}

/** World direction towards a body (x east, y up, z south). */
export function skyDirection(altitude: number, azimuth: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), -Math.cos(azimuth) * Math.cos(altitude));
}

const C = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
/** Sky colour keys by sun altitude (radians): [altitude, zenith, horizon]. Dusty Saurashtra haze. */
const SKY_KEYS: [number, THREE.Color, THREE.Color][] = [
  [-0.30, C(0.010, 0.014, 0.035), C(0.030, 0.040, 0.075)], // night
  [-0.12, C(0.030, 0.050, 0.130), C(0.200, 0.140, 0.180)], // late twilight
  [-0.03, C(0.110, 0.180, 0.380), C(0.700, 0.420, 0.330)], // civil twilight: orange band
  [0.06, C(0.200, 0.330, 0.600), C(0.950, 0.650, 0.420)], // golden hour
  [0.30, C(0.250, 0.450, 0.760), C(0.850, 0.800, 0.700)], // morning / evening
  [1.20, C(0.220, 0.440, 0.780), C(0.800, 0.790, 0.740)], // noon haze
];

function skyColors(alt: number, zen: THREE.Color, hor: THREE.Color) {
  if (alt <= SKY_KEYS[0][0]) { zen.copy(SKY_KEYS[0][1]); hor.copy(SKY_KEYS[0][2]); return; }
  for (let k = 0; k < SKY_KEYS.length - 1; k++) {
    const [a0, z0, h0] = SKY_KEYS[k], [a1, z1, h1] = SKY_KEYS[k + 1];
    if (alt <= a1) {
      const t = THREE.MathUtils.smoothstep(alt, a0, a1);
      zen.copy(z0).lerp(z1, t);
      hor.copy(h0).lerp(h1, t);
      return;
    }
  }
  const last = SKY_KEYS[SKY_KEYS.length - 1];
  zen.copy(last[1]);
  hor.copy(last[2]);
}

/** Gradient sky dome with sun, moon and stars. Follows the camera; always behind everything. */
class SkyDome extends THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  constructor() {
    super(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Color(1, 0.9, 0.7) }, uNight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // at the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uSunDir, uMoonDir, uSunColor; uniform float uNight;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y)); // below the horizon (hidden by haze)
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(s, 600.0) * 30.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * (1.0 - uNight * 0.9);
          float m = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (step(0.99965, m) * 1.2 + pow(m, 80.0) * 0.06) * uNight;
          vec3 cell = floor(d * 280.0);
          float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.3, d.y) * uNight;
          col += vec3(star) * (0.6 + 0.4 * hash(cell + 3.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.frustumCulled = false;
    this.renderOrder = -1;
  }
}

export class Environment {
  readonly dome = new SkyDome();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a7458, 1);
  readonly fog = new THREE.FogExp2(0xc9b9a0, 0.0011);
  private sunDir = new THREE.Vector3();
  private moonDir = new THREE.Vector3();
  private zen = new THREE.Color();
  private hor = new THREE.Color();

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, shadowSize: number) {
    scene.add(this.dome, this.hemi);
    scene.fog = this.fog;
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.near = 1; c.far = 900;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.12;
    }
    scene.add(this.sun, this.sun.target);
  }

  update(clock: Clock, focus: THREE.Vector3, camera: THREE.Camera) {
    const t = clock.instant();
    const sp = bodyPosition('sun', t);
    const mp = bodyPosition('moon', t);
    skyDirection(sp.altitude, sp.azimuth, this.sunDir);
    skyDirection(mp.altitude, mp.azimuth, this.moonDir);
    const alt = sp.altitude;

    skyColors(alt, this.zen, this.hor);
    const day = THREE.MathUtils.smoothstep(alt, -0.04, 0.25);
    const twilight = THREE.MathUtils.smoothstep(alt, -0.2, -0.02);
    const night = 1 - twilight;
    const golden = (1 - THREE.MathUtils.smoothstep(alt, 0.03, 0.4)) * THREE.MathUtils.smoothstep(alt, -0.06, 0.02);
    worldUniforms.uNight.value = THREE.MathUtils.smoothstep(1 - day, 0.3, 1);
    worldUniforms.uHour.value = clock.hours;

    const u = this.dome.material.uniforms;
    u.uZenith.value.copy(this.zen);
    u.uHorizon.value.copy(this.hor);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uSunColor.value.setRGB(1, 0.85 - golden * 0.3, 0.65 - golden * 0.4);
    u.uNight.value = night;
    this.dome.position.copy(camera.position);

    // Key light: the sun (kept just above the horizon while it fades), or a dim moon.
    const moonUp = mp.altitude > 0.05;
    const useMoon = day < 0.05 && moonUp;
    const dir = useMoon ? this.moonDir.clone() : this.sunDir.clone();
    dir.y = Math.max(dir.y, 0.12);
    dir.normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 400);
    this.sun.target.position.copy(focus);
    if (useMoon) {
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.35 * THREE.MathUtils.smoothstep(mp.altitude, 0.05, 0.4);
    } else {
      this.sun.color.setRGB(1, 0.93 - golden * 0.28, 0.84 - golden * 0.45);
      this.sun.intensity = 3.0 * day;
    }
    // Sky light: strong blue-white by day, warm-violet at dusk, faint blue at night.
    this.hemi.color.copy(this.zen).lerp(this.hor, 0.45);
    const peak = Math.max(this.hemi.color.r, this.hemi.color.g, this.hemi.color.b, 1e-3);
    this.hemi.color.multiplyScalar(1 / peak); // colour only; brightness comes from intensity
    this.hemi.groundColor.setRGB(0.55, 0.45, 0.34, THREE.SRGBColorSpace).multiplyScalar(0.3 + 0.7 * twilight);
    this.hemi.intensity = 0.22 + 0.5 * twilight + 0.6 * day;

    // Haze matches the horizon so distant buildings melt into the sky.
    this.fog.color.copy(this.hor);
    this.fog.density = 0.0006 + 0.0003 * golden;
    this.renderer.toneMappingExposure = 0.9 + 0.15 * night;
  }
}

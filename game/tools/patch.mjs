import { readFileSync, writeFileSync } from 'node:fs';
const edit = (p, pairs) => {
  let s = readFileSync(p, 'utf8');
  for (const [a, b, all] of pairs) { if (!s.includes(a)) throw new Error(`${p}: missing ${a}`); s = all ? s.split(a).join(b) : s.replace(a, b); }
  writeFileSync(p, s);
};
edit('src/render/materials.ts', [
  ['varying vec4 vFacade; varying vec4 vMeta; varying vec2 vFuv;`)\n      .replace(\'#include <begin_vertex>\'',
   'flat varying vec4 vFacade; flat varying vec4 vMeta; varying vec2 vFuv;`)\n      .replace(\'#include <begin_vertex>\''],
  ['uniform float uNight; uniform float uHour; uniform vec3 uPal[28];\nvarying vec4 vFacade; varying vec4 vMeta; varying vec2 vFuv;',
   'uniform float uNight; uniform float uHour; uniform vec3 uPal[28];\nflat varying vec4 vFacade; flat varying vec4 vMeta; varying vec2 vFuv;'],
  ['  float seed = vMeta.x; float roofH = vMeta.z; float shop = vMeta.w;',
   '  // Quantised seed: hashes must not see interpolation noise.\n  float seed = floor(vMeta.x * 4096.0) / 64.0; float roofH = vMeta.z; float shop = vMeta.w;'],
]);
edit('src/main.ts', [
  ['  renderer.toneMapping = THREE.AgXToneMapping;', '  renderer.toneMapping = THREE.ACESFilmicToneMapping;'],
  ["  const clock = new Clock(Number(params.get('hour') ?? 18.5));",
   "  // Spawn in the golden hour: 40 minutes before today's real sunset in Rajkot (PROMPT §3.1).\n  const clock = new Clock(params.has('hour') ? Number(params.get('hour')) : goldenHour());"],
  ["import { Clock, Environment } from './render/sky';", "import { Clock, Environment, goldenHour } from './render/sky';"],
]);
edit('src/render/sky.ts', [
  ['/** Direction towards a body from suncalc',
   `/** Local hour (IST) 40 minutes before sunset today. */
export function goldenHour(date = new Date()): number {
  const sunset = SunCalc.getTimes(date, LAT, LON).sunset;
  const h = ((sunset.getUTCHours() + sunset.getUTCMinutes() / 60 + IST_OFFSET_H) % 24) - 2 / 3;
  return Number.isFinite(h) ? h : 17.5;
}

/** Direction towards a body from suncalc`],
  ['    this.hemi.color.copy(this.zen).lerp(this.hor, 0.35).multiplyScalar(1.4);\n    this.hemi.groundColor.setRGB(0.42, 0.34, 0.26).multiplyScalar(0.25 + 0.75 * twilight);\n    this.hemi.intensity = 0.55 + 0.75 * day + 0.6 * twilight * (1 - day);',
   '    this.hemi.color.copy(this.zen).lerp(this.hor, 0.45);\n    const peak = Math.max(this.hemi.color.r, this.hemi.color.g, this.hemi.color.b, 1e-3);\n    this.hemi.color.multiplyScalar(1 / peak); // colour only; brightness comes from intensity\n    this.hemi.groundColor.setRGB(0.55, 0.45, 0.34);\n    this.hemi.intensity = 0.22 + 0.5 * twilight + 0.6 * day;'],
  ['    this.renderer.toneMappingExposure = 1.0 + 0.6 * night;', '    this.renderer.toneMappingExposure = 0.85 + 0.5 * night;'],
]);
console.log('ok');

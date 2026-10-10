import * as THREE from 'three';

/** Shared uniforms driven by the clock (see render/sky.ts). */
export const worldUniforms = {
  uNight: { value: 0 }, // 0 day .. 1 full night
  uHour: { value: 18.5 }, // local time, hours
  uWet: { value: 0 }, // 0 dry .. 1 soaked (monsoon rain, render/weather.ts)
  uTime: { value: 0 }, // seconds, for moving water
  uRiver: { value: 0 }, // 0 dry riverbeds .. 1 rivers flowing (monsoon months or heavy rain)
};

/**
 * Plaster palettes per style zone (PROMPT §7.12), 4 colours each, linear-ish sRGB.
 * Index: (zone − 1) * 4 + palette % 4.
 */
const PALETTES: number[][] = [
  // Z1 old city: faded ochre, lime blue, pale green, whitewash
  [0.80, 0.66, 0.42], [0.55, 0.68, 0.78], [0.62, 0.74, 0.60], [0.86, 0.84, 0.78],
  // Z2 heritage: sandstone, cream, red brick, stone grey
  [0.78, 0.68, 0.52], [0.88, 0.84, 0.72], [0.62, 0.36, 0.28], [0.70, 0.68, 0.64],
  // Z3 societies: cream, peach, pale yellow, pastel pink
  [0.90, 0.86, 0.76], [0.92, 0.78, 0.66], [0.92, 0.86, 0.60], [0.88, 0.72, 0.72],
  // Z4 commercial: white, grey, beige, terracotta
  [0.88, 0.88, 0.86], [0.66, 0.67, 0.68], [0.82, 0.76, 0.66], [0.72, 0.45, 0.35],
  // Z5 high-rise: white, cream, grey, light brown
  [0.90, 0.89, 0.86], [0.88, 0.83, 0.70], [0.70, 0.70, 0.72], [0.76, 0.64, 0.52],
  // Z6 industrial: galvanised grey, blue sheet, off-white, rust
  [0.62, 0.64, 0.66], [0.35, 0.48, 0.62], [0.80, 0.80, 0.76], [0.58, 0.42, 0.32],
  // Z7 outskirts: whitewash, ochre, pale blue, mud
  [0.88, 0.86, 0.80], [0.80, 0.66, 0.42], [0.62, 0.72, 0.80], [0.66, 0.56, 0.44],
];

const GLSL_COMMON = /* glsl */ `
float fHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fHash3(vec3 p) { return fHash(p.xy + p.z * 17.13); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1, 0)), f.x), mix(fHash(i + vec2(0, 1)), fHash(i + vec2(1, 1)), f.x), f.y);
}
float fBox(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }
`;

/** Facade material for building walls (PROMPT §8.5). */
export function facadeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const pal = PALETTES.map((c) => new THREE.Color(c[0], c[1], c[2]));
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.uniforms.uHour = worldUniforms.uHour;
    shader.uniforms.uPal = { value: pal };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 facade; attribute vec4 meta; attribute vec2 fuv;
flat varying vec4 vFacade; flat varying vec4 vMeta; varying vec2 vFuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFacade = facade; vMeta = meta; vFuv = fuv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; uniform float uHour; uniform vec3 uPal[28];
flat varying vec4 vFacade; flat varying vec4 vMeta; varying vec2 vFuv;
${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float zone = vFacade.x; float kind = vFacade.z; float groundH = vFacade.w;
  // Quantised seed: hashes must not see interpolation noise.
  float seed = floor(vMeta.x * 4096.0) / 64.0; float roofH = vMeta.z; float shop = vMeta.w;
  int zi = int(zone + 0.5) - 1; int pi = int(mod(vFacade.y, 4.0) + 0.5);
  vec3 plaster = uPal[clamp(zi, 0, 6) * 4 + pi];
  plaster *= 0.92 + 0.16 * fHash(vec2(seed * 97.0, 3.1));
  float u = vFuv.x, y = vFuv.y;
  // Weathering: soot near the ground, monsoon streaks under the parapet, blotchy grime.
  float grime = fNoise(vec2(u * 0.35, y * 0.25) + seed * 50.0);
  float streak = smoothstep(0.55, 1.0, fNoise(vec2(u * 1.7, 0.5 + seed * 13.0))) * smoothstep(roofH - 6.0, roofH, y);
  plaster *= 1.0 - 0.18 * grime - 0.22 * streak - 0.15 * smoothstep(0.8, 0.0, y);
  // Fine stucco texture up close.
  plaster *= 0.94 + 0.12 * fNoise(vec2(u, y) * 9.0 + seed);
  vec3 col = plaster;
  vec3 emis = vec3(0.0);
  float rough = 0.92;
  float metal = 0.0;
  // Anti-aliasing: fade procedural detail by the pixel footprint on the wall (metres per pixel).
  float fw = max(fwidth(vFuv.x), fwidth(vFuv.y));
  float detail = 1.0 - smoothstep(0.03, 0.15, fw);  // bars, grilles, ribs, slats
  float detailW = 1.0 - smoothstep(0.25, 0.9, fw);  // whole window/balcony patterns
  bool isZ4 = zi == 3, isZ6 = zi == 5;
  float bw = zi == 0 ? 2.7 : (zi == 1 ? 3.8 : (isZ4 ? 4.0 : 3.2));
  float bay = floor(u / bw);
  float lu = fract(u / bw);
  bool front = kind > 0.5 && kind < 1.5;
  bool back = kind < 0.5;
  bool solid = kind > 1.5; // shared wall or parapet inner face
  float upper = y - groundH;
  float floorIdx = floor(upper / 3.1);
  float lv = fract(upper / 3.1);
  float style = fHash(vec2(seed * 31.0, 7.0));
  // Shopping hours: closed in the afternoon rest (13-16) and at night.
  float open = step(9.0, uHour) * (1.0 - step(13.0, uHour) * step(uHour, 16.0)) * step(uHour, 21.5);
  if (!solid && y > 0.0 && y < roofH) {
    if (y < groundH) {
      if (shop > 0.5 && front) {
        // Rolling shutter (open: lit interior) + signboard band above it.
        float sh = fBox(vec2(lu, y), vec2(0.05, 0.25), vec2(0.95, groundH - 0.95));
        float sign = fBox(vec2(lu, y), vec2(0.0, groundH - 0.9), vec2(1.0, groundH - 0.15));
        float hb = fHash(vec2(bay, seed * 11.0));
        vec3 signCol = hb < 0.25 ? vec3(0.75, 0.12, 0.10) : (hb < 0.5 ? vec3(0.95, 0.75, 0.15) : (hb < 0.75 ? vec3(0.12, 0.30, 0.65) : vec3(0.10, 0.50, 0.25)));
        if (sign > 0.5) { col = signCol; rough = 0.5; emis = signCol * 0.9 * uNight; }
        else if (sh > 0.5) {
          if (open > 0.5 && fHash(vec2(bay, seed)) > 0.15) {
            vec3 inside = vec3(0.16, 0.13, 0.10) * (0.8 + 0.4 * fHash(vec2(bay * 3.0, seed)));
            col = inside; emis = vec3(1.0, 0.85, 0.6) * (0.02 + 0.9 * uNight) * 0.6;
          } else {
            float rib = mix(0.5, 0.5 + 0.5 * sin(y * 40.0), detail);
            col = mix(vec3(0.45, 0.47, 0.48), vec3(0.62, 0.63, 0.63), rib); rough = 0.55;
          }
        }
      } else if (!isZ6) {
        float w = fBox(vec2(lu, y), vec2(0.3, 1.0), vec2(0.7, groundH - 0.7));
        if (w > 0.5 && (front || fHash(vec2(bay, seed * 5.0)) > 0.6)) { col = vec3(0.22, 0.25, 0.28); rough = 0.3; }
        col *= y < 0.45 ? 0.7 : 1.0; // plinth band
      }
    } else if (zi == 1 && !back) {
      // Heritage (Z2): tall arched openings between pilasters, a cornice band at each floor.
      float pil = step(lu, 0.1) + step(0.9, lu);
      float cornice = step(0.9, lv);
      vec2 q = vec2((lu - 0.5) / 0.28, (lv - 0.12) / 0.62);
      float arch = step(q.y, 1.0) * step(0.0, q.y) * step(abs(q.x), 1.0)
                 * step(length(vec2(q.x, max(q.y - 0.72, 0.0) / 0.28)), 1.0);
      if (pil > 0.5 || cornice > 0.5) { col = plaster * 1.08; rough = 0.7; }
      else if (arch > 0.5) {
        col = vec3(0.16, 0.13, 0.11) * (0.7 + 0.3 * detail);
        rough = 0.5;
        float lit = step(fHash(vec2(bay * 5.0 + seed * 17.0, floorIdx)), 0.45);
        emis = vec3(1.0, 0.82, 0.55) * lit * uNight * 0.7;
      }
    } else if (isZ4 && front && style > 0.35) {
      // Glass-front commercial complex: continuous glazing bands per floor.
      float g = fBox(vec2(lu, lv), vec2(0.02, 0.18), vec2(0.98, 0.92));
      if (g > 0.5) {
        col = mix(vec3(0.16, 0.26, 0.32), vec3(0.35, 0.48, 0.56), fHash(vec2(bay, floorIdx)) * 0.4);
        rough = 0.06; metal = 0.55; // reflective glazing: shows the sky
        float lit = step(fHash(vec2(bay + seed * 3.0, floorIdx)), 0.6);
        emis = vec3(0.9, 0.95, 1.0) * lit * uNight * 0.55;
      }
    } else if (!isZ6) {
      bool hasWin = front || fHash(vec2(bay + 0.5, seed * 9.0 + floorIdx)) > 0.55;
      vec2 lo = front ? vec2(0.22, 0.28) : vec2(0.34, 0.42);
      vec2 hi = front ? vec2(0.78, 0.80) : vec2(0.66, 0.78);
      float w = fBox(vec2(lu, lv), lo, hi);
      float frame = fBox(vec2(lu, lv), lo - 0.03, hi + 0.03) - w;
      // Balcony on some front bays: slab edge + grille railing.
      bool balcony = front && fHash(vec2(bay * 1.7, seed * 21.0)) > (zi == 2 || zi == 4 ? 0.45 : 0.75);
      if (balcony && lv < 0.38) {
        float slab = step(lv, 0.06);
        float bar = mix(0.4, step(0.6, fract(lu * 18.0)), detail);
        col = slab > 0.5 ? plaster * 0.8 : mix(col * 0.55, vec3(0.18, 0.18, 0.2), bar * step(0.1, lv));
      } else if (front && lv > hi.y + 0.02 && lv < hi.y + 0.08 && lu > lo.x - 0.08 && lu < hi.x + 0.08) {
        // Chajja: the concrete sunshade over Indian windows (lit top edge).
        col = plaster * mix(1.12, 0.92, (lv - hi.y - 0.02) / 0.06);
      } else if (hasWin && w > 0.5) {
        float wst = fHash(vec2(seed * 5.0, 1.0));
        vec3 glass = vec3(0.24, 0.29, 0.34); // dusty glass reflecting the sky
        if (zi == 0 && wst < 0.6) {
          glass = mix(vec3(0.28, 0.20, 0.12), vec3(0.20, 0.40, 0.35), step(0.5, fHash(vec2(seed, 9.0)))); // painted wooden shutters
          glass *= 0.75 + 0.25 * mix(0.5, step(0.5, fract(lu * 6.0)), detail);
        } else if (wst < 0.4) {
          glass *= 1.0 - 0.6 * detail * max(step(0.85, fract((lu - lo.x) * 16.0)), step(0.85, fract((lv - lo.y) * 10.0))); // grille
        }
        // Recessed window: shadow under the chajja and along the left reveal.
        float shade = 1.0 - 0.45 * smoothstep(hi.y - 0.22, hi.y, lv) * (front ? 1.0 : 0.4) - 0.25 * (1.0 - smoothstep(lo.x, lo.x + 0.06, lu));
        col = glass * shade; rough = 0.12; metal = wst < 0.6 && zi == 0 ? 0.0 : 0.35;
        float lit = step(fHash(vec2(bay * 7.0 + seed * 101.0, floorIdx * 3.0)), mix(0.55, 0.2, step(23.0, uHour) + step(uHour, 5.0)));
        vec3 lamp = fHash(vec2(bay, floorIdx + seed)) > 0.5 ? vec3(1.0, 0.78, 0.48) : vec3(0.82, 0.92, 1.0);
        emis = lamp * lit * uNight * 0.85;
      } else if (frame > 0.5 && hasWin) {
        col = plaster * 0.75;
      }
      // Floor ledge at each slab, with a shadow line beneath it.
      if (!balcony || lv >= 0.38) {
        if (lv < 0.035) col = plaster * 1.08;
        else if (lv < 0.09) col *= mix(0.78, 1.0, (lv - 0.035) / 0.055);
      }
      // Split AC outdoor unit under some windows.
      if (front && fHash(vec2(bay * 3.3, seed + floorIdx)) > 0.82 && fBox(vec2(lu, lv), vec2(0.62, 0.06), vec2(0.86, 0.24)) > 0.5) {
        col = vec3(0.82, 0.82, 0.80); rough = 0.6;
      }
    } else {
      // Industrial shed: corrugated sheet + a big shutter on front walls.
      col *= 0.85 + 0.15 * sin(u * 25.0) * detail;
      if (front && fBox(vec2(fract(u / 12.0), y), vec2(0.3, 0.0), vec2(0.7, 4.5)) > 0.5) col = vec3(0.4, 0.42, 0.44);
      rough = 0.6;
    }
  } else if (y >= roofH) {
    col = plaster * 0.95; // parapet band
    if (y > roofH + 0.9) col = plaster * 1.1; // coping
  }
  // Contact shadow where walls meet the ground.
  col *= 0.72 + 0.28 * smoothstep(0.0, 1.2, y);
  if (kind > 1.5 && kind < 2.5) col *= 0.82; // shared walls exposed: unpainted, darker
  // Far away: blend window patterns to their average so facades don't shimmer.
  if (!solid && y > groundH && y < roofH && !isZ6) {
    vec3 avg = mix(plaster, vec3(0.24, 0.29, 0.34), front ? 0.32 : 0.12);
    col = mix(avg, col, detailW);
    float litAvg = mix(0.45, 0.2, step(23.0, uHour) + step(uHour, 5.0)) * (front ? 0.45 : 0.15);
    emis = mix(vec3(1.0, 0.86, 0.62) * litAvg * uNight * 1.3, emis, detailW);
  }
  diffuseColor.rgb = pow(col, vec3(2.2)); // colours above are designed in sRGB`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = rough;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = metal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += pow(emis, vec3(2.2)) * 0.55; // emissive also designed in sRGB; kept below tone-map white`);
  };
  m.customProgramCacheKey = () => 'facade-v2';
  return m;
}

/** Road surface material: colour by surface code, subtle wear and patches. */
export function roadMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = worldUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float surface; attribute vec2 fuv; varying float vSurface; varying vec2 vWuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurface = surface; vWuv = fuv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSurface; varying vec2 vWuv; uniform float uWet;
${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  int s = int(vSurface + 0.5);
  vec3 c = s == 0 ? vec3(0.40, 0.39, 0.38) : (s == 1 ? vec3(0.66, 0.65, 0.62) : (s == 2 ? vec3(0.50, 0.34, 0.28) : vec3(0.52, 0.42, 0.30)));
  float n1 = fNoise(vWuv * 0.35), n2 = fNoise(vWuv * 3.0), patchy = smoothstep(0.62, 0.7, fNoise(vWuv * 0.08 + 7.0));
  c *= 0.85 + 0.2 * n1 + 0.08 * n2;
  if (s == 0) c = mix(c, vec3(0.30, 0.29, 0.28), patchy * 0.8); // patch repairs
  if (s == 1) c *= 1.0 - 0.12 * step(0.94, fract(vWuv.x * 0.25)) - 0.12 * step(0.94, fract(vWuv.y * 0.25)); // RCC joints
  if (s == 2) c *= 0.85 + 0.15 * step(0.12, fract(vWuv.x * 4.0)) * step(0.12, fract(vWuv.y * 2.0)); // paver blocks
  diffuseColor.rgb = pow(c, vec3(2.2));
  // Wet: darker, with puddles in the low patches.
  float puddle = smoothstep(0.55, 0.7, fNoise(vWuv * 0.21 + 3.0)) * uWet;
  diffuseColor.rgb *= 1.0 - 0.4 * uWet - 0.2 * puddle;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.12, clamp(uWet * 0.75 + puddle, 0.0, 1.0));`);
  };
  m.customProgramCacheKey = () => 'road-v2';
  m.envMapIntensity = 0.45; // dusty asphalt: less blue sky light, so roads stay grey in the shade
  return m;
}

export function vertexColorMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...opts });
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x6e8a3e, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = worldUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vWuv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = fuv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vWuv; uniform float uWet;\n${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float g = fNoise(vWuv * 0.15) * 0.6 + fNoise(vWuv * 1.3) * 0.4;
  vec3 dry = mix(vec3(0.42, 0.48, 0.24), vec3(0.60, 0.56, 0.34), g); // dry-season grass with bald patches
  vec3 lush = mix(vec3(0.20, 0.36, 0.12), vec3(0.30, 0.42, 0.17), g); // monsoon green
  diffuseColor.rgb = pow(mix(dry, lush, uWet), vec3(2.2));`);
  };
  m.customProgramCacheKey = () => 'grass-v2';
  m.envMapIntensity = 0.6;
  return m;
}

/** Lakes: a deep green-blue with moving ripples (perturbed normals) that catch the sky and the sun. */
export function waterMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x35565a, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.93 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldW;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWorldW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldW; uniform float uTime;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec2 p = vWorldW.xz;
    float t = uTime;
    // Several wave trains at odd angles and scales: no visible grid.
    vec2 g = vec2(0.0);
    g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.37 + t * 1.3);
    g += vec2(-0.5, 0.87) * cos(dot(p, vec2(-0.5, 0.87)) * 0.53 + t * 1.7);
    g += vec2(0.97, -0.26) * cos(dot(p, vec2(0.97, -0.26)) * 0.91 + t * 2.1) * 0.6;
    g += vec2(-0.2, -0.98) * cos(dot(p, vec2(-0.2, -0.98)) * 1.7 + t * 2.9) * 0.35;
    g *= 0.03;
    vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`);
  };
  m.customProgramCacheKey = () => 'water-v2';
  return m;
}

/** Riverbeds (Aji, Nyari): dry sand most of the year, muddy flowing water in the monsoon (uRiver). */
export function sandMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRiver = worldUniforms.uRiver;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRiver;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.12, 0.07), uRiver);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.08, uRiver);`);
  };
  m.customProgramCacheKey = () => 'riverbed-v1';
  return m;
}

/** Far-LOD tiles: vertex colours, cheap Lambert shading, and a faint glow of lit windows at night. */
export function farMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * vGlow * uNight * 0.06;');
  };
  m.customProgramCacheKey = () => 'far-v1';
  return m;
}

/** Lamp glass and other small lights: vertex colour, glowing at night. */
export function lampMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uNight * 3.0;');
  };
  m.customProgramCacheKey = () => 'lamp-v1';
  return m;
}

/** Warm pool of street light on the ground: additive, radial falloff, only at night. */
export function lightPoolMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uNight: worldUniforms.uNight },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uNight; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0;' +
      ' float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.6) * uNight * 0.35; gl_FragColor = vec4(vec3(1.0, 0.78, 0.48) * a, 1.0); }',
  });
}

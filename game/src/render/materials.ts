import * as THREE from 'three';

/** Shared uniforms driven by the clock (see render/sky.ts). */
export const worldUniforms = {
  uNight: { value: 0 }, // 0 day .. 1 full night
  uHour: { value: 18.5 }, // local time, hours
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
  vec3 col = plaster;
  vec3 emis = vec3(0.0);
  float rough = 0.92;
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
        if (w > 0.5 && (front || fHash(vec2(bay, seed * 5.0)) > 0.6)) { col = vec3(0.12, 0.14, 0.16); rough = 0.3; }
        col *= y < 0.45 ? 0.7 : 1.0; // plinth band
      }
    } else if (isZ4 && front && style > 0.35) {
      // Glass-front commercial complex: continuous glazing bands per floor.
      float g = fBox(vec2(lu, lv), vec2(0.02, 0.18), vec2(0.98, 0.92));
      if (g > 0.5) {
        col = mix(vec3(0.20, 0.32, 0.40), vec3(0.45, 0.6, 0.7), fHash(vec2(bay, floorIdx)) * 0.4);
        rough = 0.12;
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
      } else if (hasWin && w > 0.5) {
        float wst = fHash(vec2(seed * 5.0, 1.0));
        vec3 glass = vec3(0.10, 0.13, 0.16);
        if (zi == 0 && wst < 0.6) {
          glass = mix(vec3(0.28, 0.20, 0.12), vec3(0.20, 0.40, 0.35), step(0.5, fHash(vec2(seed, 9.0)))); // painted wooden shutters
          glass *= 0.75 + 0.25 * mix(0.5, step(0.5, fract(lu * 6.0)), detail);
        } else if (wst < 0.4) {
          glass *= 1.0 - 0.6 * detail * max(step(0.85, fract((lu - lo.x) * 16.0)), step(0.85, fract((lv - lo.y) * 10.0))); // grille
        }
        col = glass; rough = 0.25;
        float lit = step(fHash(vec2(bay * 7.0 + seed * 101.0, floorIdx * 3.0)), mix(0.55, 0.2, step(23.0, uHour) + step(uHour, 5.0)));
        vec3 lamp = fHash(vec2(bay, floorIdx + seed)) > 0.5 ? vec3(1.0, 0.78, 0.48) : vec3(0.82, 0.92, 1.0);
        emis = lamp * lit * uNight * 0.85;
      } else if (frame > 0.5 && hasWin) {
        col = plaster * 0.75;
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
  }
  if (kind > 1.5 && kind < 2.5) col *= 0.82; // shared walls exposed: unpainted, darker
  // Far away: blend window patterns to their average so facades don't shimmer.
  if (!solid && y > groundH && y < roofH && !isZ6) {
    vec3 avg = mix(plaster, vec3(0.12, 0.13, 0.15), front ? 0.32 : 0.12);
    col = mix(avg, col, detailW);
    float litAvg = mix(0.45, 0.2, step(23.0, uHour) + step(uHour, 5.0)) * (front ? 0.45 : 0.15);
    emis = mix(vec3(1.0, 0.86, 0.62) * litAvg * uNight * 1.3, emis, detailW);
  }
  diffuseColor.rgb = pow(col, vec3(2.2)); // colours above are designed in sRGB`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = rough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += emis;`);
  };
  m.customProgramCacheKey = () => 'facade-v1';
  return m;
}

/** Road surface material: colour by surface code, subtle wear and patches. */
export function roadMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float surface; attribute vec2 fuv; varying float vSurface; varying vec2 vWuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSurface = surface; vWuv = fuv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSurface; varying vec2 vWuv;
${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  int s = int(vSurface + 0.5);
  vec3 c = s == 0 ? vec3(0.20, 0.20, 0.21) : (s == 1 ? vec3(0.58, 0.57, 0.54) : (s == 2 ? vec3(0.50, 0.34, 0.28) : vec3(0.52, 0.42, 0.30)));
  float n1 = fNoise(vWuv * 0.35), n2 = fNoise(vWuv * 3.0), patchy = smoothstep(0.62, 0.7, fNoise(vWuv * 0.08 + 7.0));
  c *= 0.85 + 0.2 * n1 + 0.08 * n2;
  if (s == 0) c = mix(c, vec3(0.30, 0.29, 0.28), patchy * 0.8); // patch repairs
  if (s == 1) c *= 1.0 - 0.12 * step(0.94, fract(vWuv.x * 0.25)) - 0.12 * step(0.94, fract(vWuv.y * 0.25)); // RCC joints
  if (s == 2) c *= 0.85 + 0.15 * step(0.12, fract(vWuv.x * 4.0)) * step(0.12, fract(vWuv.y * 2.0)); // paver blocks
  diffuseColor.rgb = pow(c, vec3(2.2));`);
  };
  m.customProgramCacheKey = () => 'road-v1';
  return m;
}

export function vertexColorMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...opts });
}

export function grassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x6e8a3e, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fuv; varying vec2 vWuv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = fuv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vWuv;\n${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float g = fNoise(vWuv * 0.15) * 0.6 + fNoise(vWuv * 1.3) * 0.4;
  diffuseColor.rgb = pow(mix(vec3(0.42, 0.48, 0.24), vec3(0.60, 0.56, 0.34), g), vec3(2.2)); // dry-season grass with bald patches`);
  };
  m.customProgramCacheKey = () => 'grass-v1';
  return m;
}

export function waterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x3d5a5c, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92 });
}

export function sandMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}

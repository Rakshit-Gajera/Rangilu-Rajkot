import { hash01, rng } from '../core/rng';
import { heightAt, type Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';
import { segment, sphere, type V3 } from './prims';

/** Species order matches pipeline/rajkot_bake/trees.py SPECIES. */
export const SPECIES = ['neem', 'peepal', 'banyan', 'gulmohar', 'ashoka', 'palm', 'prosopis'] as const;
export const N_SPECIES = SPECIES.length;
export const GULMOHAR = 3;

const BARK = [0.36, 0.28, 0.2];
const BARK_GREY = [0.5, 0.46, 0.4];

/** Per species: a column-major 4×4 matrix per tree (position, yaw, scale), for InstancedMesh. */
export type TreeInstances = Float32Array[];

export function treeInstances(tile: Tile): TreeInstances {
  const per: number[][] = Array.from({ length: N_SPECIES }, () => []);
  const t = tile.trees;
  for (let k = 0; k < t.species.length; k++) {
    const sp = t.species[k];
    if (sp >= N_SPECIES) continue;
    const x = t.x[k], n = t.n[k];
    const y = heightAt(tile, x, n) - 0.15;
    const s = t.scale[k];
    const a = hash01((Math.round(x * 10) * 73856093) ^ (Math.round(n * 10) * 19349663)) * Math.PI * 2;
    const c = Math.cos(a) * s, si = Math.sin(a) * s;
    // Column-major: rotation about y, uniform scale, translation (tile-local, z = −north).
    per[sp].push(c, 0, -si, 0, 0, s, 0, 0, si, 0, c, 0, x, y, -n, 1);
  }
  return per.map((m) => new Float32Array(m));
}

/** Low-poly tree models (tile-independent; built once on the main thread). Colours are sRGB. */
export function treeModel(species: number, bloom = false, lo = false): GeoBuf {
  const b = new Builder(false, { color: 3 });
  const r = rng(1000 + species);
  const leaf = (base: number[], v = 0.12) => base.map((c) => c * (1 - v / 2 + r() * v));
  // Low-poly version for distant trees (no shadows): fewer sides on everything.
  const blob = (c: V3, rad: number, col: number[], sy = 0.75) => sphere(b, c, rad, leaf(col), sy, lo ? 5 : 7);
  const seg = (p0: V3, p1: V3, r0: number, r1: number, col: number[], sides: number, caps = true) =>
    segment(b, p0, p1, r0, r1, col, lo ? Math.max(3, sides - 3) : sides, caps);
  switch (SPECIES[species]) {
    case 'neem': {
      seg([0, 0, 0], [0.1, 3.0, 0], 0.22, 0.15, BARK, 6);
      seg([0.1, 2.6, 0], [1.2, 3.8, 0.4], 0.12, 0.07, BARK, 5);
      seg([0.05, 2.7, 0], [-1.0, 3.9, -0.5], 0.12, 0.07, BARK, 5);
      const g = [0.22, 0.38, 0.13];
      blob([0, 5.0, 0], 2.4, g);
      blob([1.4, 4.4, 0.6], 1.7, g);
      blob([-1.3, 4.5, -0.6], 1.8, g);
      blob([0.3, 4.3, -1.5], 1.6, g);
      blob([-0.4, 4.2, 1.5], 1.6, g);
      break;
    }
    case 'peepal': {
      seg([0, 0, 0], [0, 3.6, 0], 0.45, 0.3, BARK_GREY, 7);
      seg([0, 3.2, 0], [1.8, 5.0, 0.6], 0.22, 0.12, BARK_GREY, 5);
      seg([0, 3.2, 0], [-1.6, 5.2, -0.8], 0.22, 0.12, BARK_GREY, 5);
      const g = [0.3, 0.47, 0.17];
      blob([0, 7.0, 0], 3.4, g, 0.7);
      blob([2.4, 6.0, 0.8], 2.4, g);
      blob([-2.3, 6.1, -0.9], 2.5, g);
      blob([0.6, 5.8, 2.4], 2.2, g);
      blob([-0.8, 5.9, -2.4], 2.2, g);
      break;
    }
    case 'banyan': {
      // Several trunks and hanging aerial roots under a very wide, low canopy.
      for (const [x, z] of [[0, 0], [1.4, 0.6], [-1.2, 0.9], [0.4, -1.3]]) {
        seg([x, 0, z], [x * 0.6, 3.4, z * 0.6], 0.35, 0.25, BARK_GREY, 6);
      }
      for (let k = 0; k < (lo ? 0 : 10); k++) {
        const a = r() * Math.PI * 2, d = 2.5 + r() * 3.5;
        seg([Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * d, 4.2, Math.sin(a) * d], 0.06, 0.05, BARK_GREY, 4, false);
      }
      const g = [0.2, 0.36, 0.14];
      blob([0, 5.6, 0], 3.6, g, 0.55);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        blob([Math.cos(a) * 4.2, 5.0, Math.sin(a) * 4.2], 2.6, g, 0.55);
      }
      break;
    }
    case 'gulmohar': {
      seg([0, 0, 0], [0, 2.6, 0], 0.22, 0.17, BARK, 6);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        seg([0, 2.4, 0], [Math.cos(a) * 2.2, 3.9, Math.sin(a) * 2.2], 0.1, 0.06, BARK, 5);
      }
      // Umbrella-shaped canopy: wide and flat; flame-red in May–June.
      const g = bloom ? [0.85, 0.22, 0.1] : [0.3, 0.5, 0.18];
      blob([0, 4.6, 0], 3.2, g, 0.38);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        blob([Math.cos(a) * 2.6, 4.3, Math.sin(a) * 2.6], 2.0, bloom && k % 2 ? [0.95, 0.4, 0.1] : g, 0.4);
      }
      break;
    }
    case 'ashoka': {
      // Tall, narrow column of drooping leaves.
      seg([0, 0, 0], [0, 1.2, 0], 0.15, 0.12, BARK, 5);
      const g = [0.14, 0.32, 0.1];
      for (let k = 0; k < 6; k++) {
        const y = 1.2 + k * 1.6, w = 1.25 - k * 0.15;
        seg([0, y, 0], [0, y + 2.0, 0], w, w * 0.55, leaf(g), 7);
      }
      break;
    }
    case 'palm': {
      // Curved coconut trunk and a crown of fronds.
      let p: V3 = [0, 0, 0];
      for (let k = 0; k < 6; k++) {
        const q: V3 = [p[0] + 0.22 + k * 0.05, p[1] + 1.7, p[2]];
        seg(p, q, 0.2 - k * 0.015, 0.19 - k * 0.015, BARK_GREY, 6, k === 0);
        p = q;
      }
      const g = [0.32, 0.48, 0.16];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const tip: V3 = [p[0] + Math.cos(a) * 3.2, p[1] - 1.1, p[2] + Math.sin(a) * 3.2];
        const mid: V3 = [p[0] + Math.cos(a) * 1.6, p[1] + 0.35, p[2] + Math.sin(a) * 1.6];
        seg(p, mid, 0.18, 0.32, leaf(g), 4);
        seg(mid, tip, 0.32, 0.05, leaf(g), 4);
      }
      sphere(b, [p[0], p[1] - 0.2, p[2]], 0.35, [0.5, 0.42, 0.18], 1, lo ? 4 : 6);
      break;
    }
    case 'prosopis':
    default: {
      // Babool / prosopis: low, scraggly, see-through.
      for (const [x, z, h] of [[0, 0, 2.2], [0.5, 0.2, 1.8], [-0.4, 0.3, 1.9]]) {
        seg([0, 0, 0], [x * 2, h, z * 2], 0.1, 0.05, BARK, 4);
      }
      const g = [0.4, 0.45, 0.22];
      blob([0.6, 2.4, 0.3], 1.4, g, 0.45);
      blob([-0.7, 2.3, 0.5], 1.2, g, 0.45);
      blob([0, 2.7, -0.4], 1.1, g, 0.45);
      break;
    }
  }
  const out = b.build();
  const c = out.attrs.color[0];
  for (let k = 0; k < c.length; k++) c[k] = Math.pow(c[k], 2.2); // sRGB -> linear
  return out;
}

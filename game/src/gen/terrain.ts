import type { Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';

const SPACING = 10;

/**
 * Terrain mesh for one tile from its 51 × 51 height grid. Tile-local coordinates:
 * three.js x = east, z = −north, y = up. Vertex colour carries a little dusty variation.
 */
export function terrainMesh(tile: Tile): GeoBuf {
  const n = tile.hn;
  const h = tile.heights;
  const b = new Builder(true, { color: 3 });
  const at = (r: number, c: number) => h[Math.min(Math.max(r, 0), n - 1) * n + Math.min(Math.max(c, 0), n - 1)];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const y = at(r, c);
      // Central-difference normal; three z = −north, so dz uses the north gradient negated.
      const dx = (at(r, c + 1) - at(r, c - 1)) / (2 * SPACING);
      const dn = (at(r + 1, c) - at(r - 1, c)) / (2 * SPACING);
      let nx = -dx, ny = 1, nz = dn;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const x = c * SPACING, north = r * SPACING;
      // Dry, dusty Saurashtra ground with a hint of variation by slope.
      const slope = 1 - ny;
      const k = 0.92 + 0.08 * Math.sin(x * 0.013 + north * 0.007) * Math.cos(north * 0.011);
      b.vertex(x, y, -north, nx, ny, nz, x, north, {
        color: [(0.62 - slope) * k, (0.53 - slope * 0.8) * k, (0.40 - slope * 0.6) * k],
      });
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const a = r * n + c, bb = a + 1, d = a + n, e = d + 1;
      // Counter-clockwise seen from above (+y): in x/−north space.
      b.tri(a, bb, e);
      b.tri(a, e, d);
    }
  }
  return b.build();
}

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GeoBuf } from '../src/gen/geobuf';
import { buildTile } from '../src/gen/tile';

const WORLD = resolve(__dirname, '../../world');
const hasWorld = existsSync(resolve(WORLD, 'manifest.json'));

/** Fraction of triangles whose geometric normal agrees with the stored vertex normal. */
function windingAgreement(g: GeoBuf): number {
  const p = g.position, n = g.normal, idx = g.index;
  let ok = 0, total = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const area = Math.hypot(cx, cy, cz);
    if (area < 1e-6) continue;
    total++;
    if (cx * n[a] + cy * n[a + 1] + cz * n[a + 2] > 0) ok++;
  }
  return total ? ok / total : 1;
}

function finite(g: GeoBuf) {
  for (const v of g.position) if (!Number.isFinite(v)) return false;
  return true;
}

describe.skipIf(!hasWorld)('tile generators', () => {
  const manifest = JSON.parse(readFileSync(resolve(WORLD, 'manifest.json'), 'utf8'));
  // The densest tile: Race Course / Jubilee area near the origin.
  const entry = manifest.tiles['-1,0'] ?? Object.values(manifest.tiles)[0];
  const [file, off, len] = entry as [string, number, number];
  const buf = readFileSync(resolve(WORLD, 'packs', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const build = buildTile(ab, off, len, manifest.tileSize);
  const meshes: [string, GeoBuf][] = [
    ['terrain', build.terrain], ['walls', build.buildings.walls], ['roofs', build.buildings.roofs],
    ['props', build.buildings.props], ['road surfaces', build.roads.surfaces], ['markings', build.roads.markings],
    ['bridges', build.roads.bridges], ['grass', build.areas.grass], ['water', build.areas.water], ['sand', build.areas.sand],
  ];

  it.each(meshes)('%s has finite positions and indices in range', (_, g) => {
    expect(finite(g)).toBe(true);
    const nv = g.position.length / 3;
    for (const i of g.index) expect(i).toBeLessThan(nv);
  });

  it.each(meshes)('%s triangles face the way their normals point', (_, g) => {
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
  });

  it('is deterministic for the same tile', () => {
    const again = buildTile(ab, off, len, manifest.tileSize);
    expect(again.buildings.walls.position).toEqual(build.buildings.walls.position);
    expect(again.buildings.props.position).toEqual(build.buildings.props.position);
  });

  it('stays inside the triangle budget for one tile', () => {
    expect(build.stats.triangles).toBeLessThan(400_000);
  });
});

describe('facade bays', async () => {
  const { edgeBays } = await import('../src/gen/buildings');
  it('fits a whole number of bays on each edge', () => {
    const r = edgeBays(10, 3.2, 5);
    expect(r.u0).toBeCloseTo(16);
    expect((r.u1 - r.u0) / 3.2).toBeCloseTo(3);
  });
  it('keeps very short edges blank', () => {
    const r = edgeBays(1, 3.2, 0);
    expect(r.u1 / 3.2).toBeLessThan(0.22); // window region starts at 0.22 of a bay
  });
});

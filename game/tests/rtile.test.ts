import { describe, expect, it } from 'vitest';
import { decodeTile, heightAt } from '../src/world/rtile';
import { hasWorld, openWorld } from './world';


describe.skipIf(!hasWorld)('rtile decoder on the baked world', () => {
  const { manifest, tile: load } = openWorld();
  const key = Object.keys(manifest.tiles).includes('-1,0') ? '-1,0' : Object.keys(manifest.tiles)[0];
  const tile = decodeTile(...load(key));

  it('reads the header', () => {
    expect(`${tile.i},${tile.j}`).toBe(key);
    expect(tile.hn).toBe(51);
    expect(tile.heights.length).toBe(51 * 51);
  });

  it('has sane heights and buildings', () => {
    for (const h of tile.heights) expect(Number.isFinite(h) && h > -60 && h < 200).toBe(true);
    for (const b of tile.buildings) {
      expect(b.outline.length).toBe(b.edgeKinds.length * 2);
      expect(b.height).toBeGreaterThanOrEqual(3);
      expect(b.zone).toBeGreaterThanOrEqual(1);
      expect(b.zone).toBeLessThanOrEqual(7);
    }
  });

  it('polygons have closed-ring data inside the tile', () => {
    for (const e of [...tile.roadSurfaces, ...tile.areas]) {
      for (const rings of e.polygons) {
        for (const r of rings) {
          expect(r.length % 2).toBe(0);
          expect(r.length / 2).toBeGreaterThanOrEqual(3);
          for (const v of r) expect(v > -1 && v < 501).toBe(true);
        }
      }
    }
  });
});

describe('heightAt', () => {
  it('interpolates bilinearly and clamps at edges', () => {
    const heights = new Float32Array([0, 10, 20, 30]);
    const t = { heights, hn: 2 };
    expect(heightAt(t, 0, 0)).toBe(0);
    expect(heightAt(t, 10, 0)).toBe(10);
    expect(heightAt(t, 5, 5)).toBe(15);
    expect(heightAt(t, 7.5, 2.5)).toBeCloseTo(0 + 10 * 0.75 + 20 * 0.25); // lower-right triangle
    expect(heightAt(t, 2.5, 7.5)).toBeCloseTo(0 + 20 * 0.75 + 10 * 0.25); // upper-left triangle
    expect(heightAt(t, -50, 999)).toBe(20);
  });
});

describe('polygon triangulation on the terrain grid', async () => {
  const { triangulate, clipRect } = await import('../src/gen/polys');
  const area = (v: Float32Array, idx: Uint32Array) => {
    let a = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
      a += Math.abs((v[2 * j] - v[2 * i]) * (v[2 * k + 1] - v[2 * i + 1]) - (v[2 * k] - v[2 * i]) * (v[2 * j + 1] - v[2 * i + 1])) / 2;
    }
    return a;
  };
  it('clips a convex polygon to a rectangle', () => {
    const out = clipRect([0, 0, 20, 0, 0, 20], 5, 5, 10, 10);
    expect(out.length / 2).toBeGreaterThanOrEqual(3);
  });
  it('keeps total area and puts every piece in one cell', () => {
    // 30 x 25 m square with a 10 x 5 m hole, crossing several 10 m cells.
    const outer = new Float32Array([3, 2, 33, 2, 33, 27, 3, 27]);
    const hole = new Float32Array([10, 10, 10, 15, 20, 15, 20, 10]);
    const m = triangulate({ code: 0, level: null, polygons: [[outer, hole]] }, 10);
    expect(area(m.vertices, m.indices)).toBeCloseTo(30 * 25 - 10 * 5, 3);
    for (let t = 0; t < m.indices.length; t += 3) {
      const cx = Math.floor((m.vertices[2 * m.indices[t]] + m.vertices[2 * m.indices[t + 1]] + m.vertices[2 * m.indices[t + 2]]) / 3 / 10);
      for (let q = 0; q < 3; q++) {
        const x = m.vertices[2 * m.indices[t + q]];
        expect(x).toBeGreaterThanOrEqual(cx * 10 - 1e-4);
        expect(x).toBeLessThanOrEqual(cx * 10 + 10 + 1e-4);
      }
    }
  });
});

describe.skipIf(!hasWorld)('tile section table', () => {
  it('has each section exactly once in every tile', () => {
    const { manifest, tile: load } = openWorld();
    for (const key of Object.keys(manifest.tiles).slice(0, 200)) {
      const [buf, off, len] = load(key);
      const dv = new DataView(buf, off, len);
      const tags: string[] = [];
      for (let s = 0; s < dv.getUint16(12, true); s++) {
        tags.push(String.fromCharCode(...[0, 1, 2, 3].map((q) => dv.getUint8(16 + s * 12 + q))));
      }
      expect(new Set(tags).size, `${key}: ${tags.join(',')}`).toBe(tags.length);
    }
  });
});

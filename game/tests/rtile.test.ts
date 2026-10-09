import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeTile, heightAt } from '../src/world/rtile';

const WORLD = resolve(__dirname, '../../world');
const hasWorld = existsSync(resolve(WORLD, 'manifest.json'));

describe.skipIf(!hasWorld)('rtile decoder on the baked world', () => {
  const manifest = JSON.parse(readFileSync(resolve(WORLD, 'manifest.json'), 'utf8'));
  const [key, [file, off, len]] = Object.entries<[string, number, number]>(manifest.tiles)[0];
  const buf = readFileSync(resolve(WORLD, 'packs', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tile = decodeTile(ab, off, len);

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

  it('mesh indices are in range', () => {
    for (const m of [...tile.roadSurfaces, ...tile.areas]) {
      const nv = m.vertices.length / 2;
      for (const i of m.indices) expect(i).toBeLessThan(nv);
      expect(m.indices.length % 3).toBe(0);
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
    expect(heightAt(t, -50, 999)).toBe(20);
  });
});

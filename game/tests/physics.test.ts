import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { heightfieldData } from '../src/physics/heightfield';
import { heightAt } from '../src/world/rtile';

describe('terrain heightfield collider', () => {
  beforeAll(async () => { await RAPIER.init(); });

  it('matches heightAt under ray casts', () => {
    const n = 51;
    const heights = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = 20 + 0.3 * c + 0.1 * r + Math.sin(r * 0.7) * 2;
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const swx = 1000, swn = 2000, span = 500;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(swx, 0, -swn));
    world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, heightfieldData(heights, n), { x: span, y: 1, z: span })
      .setTranslation(span / 2, 0, -span / 2), body);
    world.step();
    for (const [x, north] of [[5, 5], [123, 77], [250, 499], [499, 1], [333.3, 412.7]]) {
      const hit = world.castRay(new RAPIER.Ray({ x: swx + x, y: 500, z: -(swn + north) }, { x: 0, y: -1, z: 0 }), 1000, true);
      expect(hit).not.toBeNull();
      expect(500 - hit!.timeOfImpact).toBeCloseTo(heightAt({ heights, hn: n }, x, north), 1);
    }
  });
});

describe('collider chunking', async () => {
  const { chunkTrimesh } = await import('../src/physics/physics');
  it('splits a mesh into compact chunks that keep every triangle', () => {
    const n = 10_000;
    const pos = new Float32Array(n * 9).map((_, k) => k * 0.01);
    const idx = new Uint32Array(n * 3).map((_, k) => k);
    const chunks = chunkTrimesh(pos, idx, 1500);
    expect(chunks.length).toBe(Math.ceil(n / 1500));
    let tris = 0;
    for (const [p, i] of chunks) {
      tris += i.length / 3;
      expect(Math.max(...i)).toBeLessThan(p.length / 3);
    }
    expect(tris).toBe(n);
    // First triangle of the second chunk keeps its original coordinates.
    const [p1, i1] = chunks[1];
    expect(p1[i1[0] * 3]).toBeCloseTo(pos[1500 * 9]);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { RoadGraph, type MapData } from '../src/world/roadgraph';
import { hasWorld, WORLD } from './world';

function tiny(): MapData {
  // Square A(0,0) B(100,0) C(100,100) D(0,100); B->C is one-way.
  return {
    version: 1, nodes: [0, 0, 100, 0, 100, 100, 0, 100],
    edges: { a: [0, 1, 2, 3], b: [1, 2, 3, 0], rank: [3, 3, 3, 3], flags: [0, 1, 0, 0], name: [-1, -1, -1, -1],
      len: [1000, 1000, 1000, 1000], start: [0, 2, 4, 6, 8] },
    pts: [0, 0, 100, 0, 100, 0, 100, 100, 100, 100, 0, 100, 0, 100, 0, 0], labels: [], bounds: [0, 0, 100, 100], playable: [],
  };
}

describe('GPS routing', () => {
  it('respects one-way streets', () => {
    const g = new RoadGraph(tiny());
    expect(g.route(0, 0, 100, 100)!.length).toBe(200); // A->B->C allowed
    expect(g.route(100, 100, 100, 0)!.length).toBe(300); // C->B must go round: C->D->A->B
  });

  it.skipIf(!hasWorld)('routes from Race Course to Rajkot Junction on real roads', () => {
    const raw = gunzipSync(readFileSync(resolve(WORLD, 'map.json.gz')));
    const g = new RoadGraph(JSON.parse(raw.toString('utf8')));
    // Race Course ring road spawn -> Rajkot Junction (PROMPT §1.4 success criterion).
    const r = g.route(-1067, 473, 49, 1945);
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThan(1800); // straight line ~1.9 km
    expect(r!.length).toBeLessThan(5000);
  });
});

describe.skipIf(!hasWorld)('GPS reaches every landmark', () => {
  it('routes from the spawn to all landmark labels', () => {
    const raw = gunzipSync(readFileSync(resolve(WORLD, 'map.json.gz')));
    const g = new RoadGraph(JSON.parse(raw.toString('utf8')));
    const missing = g.data.labels.filter((l) => l.kind === 'landmark' && !g.route(-1067, 473, l.x, l.n)).map((l) => l.t);
    expect(missing).toEqual([]);
  });
});

describe.skipIf(!hasWorld)('world package', () => {
  it('manifest points at the road graph', () => {
    const manifest = JSON.parse(readFileSync(resolve(WORLD, 'manifest.json'), 'utf8'));
    expect(manifest.map).toBe('map.json.gz');
  });
});

describe.skipIf(!hasWorld)('nearest node', () => {
  it('grid lookup matches a brute-force scan and is fast', () => {
    const raw = gunzipSync(readFileSync(resolve(WORLD, 'map.json.gz')));
    const g = new RoadGraph(JSON.parse(raw.toString('utf8')));
    const brute = (x: number, n: number, ground: boolean) => {
      let bd = Infinity;
      for (let u = 0; u < g.nodeCount; u++) {
        if (!g.outgoing(u).length || g.nearestNode(g.nodeXY(u)[0], g.nodeXY(u)[1], ground) !== u) continue;
        const [ux, un] = g.nodeXY(u);
        bd = Math.min(bd, (ux - x) ** 2 + (un - n) ** 2);
      }
      return bd;
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 5; k++) {
      const x = (rnd() - 0.5) * 16000, n = (rnd() - 0.5) * 16000;
      const u = g.nearestNode(x, n, true);
      const [ux, un] = g.nodeXY(u);
      expect((ux - x) ** 2 + (un - n) ** 2).toBeCloseTo(brute(x, n, true), 3);
    }
    const t0 = performance.now();
    for (let k = 0; k < 1000; k++) g.nearestNode((rnd() - 0.5) * 8000, (rnd() - 0.5) * 8000, true);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

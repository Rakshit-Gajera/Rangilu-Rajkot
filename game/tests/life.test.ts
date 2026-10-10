import { describe, expect, it } from 'vitest';
import { idm, trafficDensity } from '../src/actors/life';

describe('traffic model', () => {
  it('IDM accelerates on a free road and brakes hard behind a stopped vehicle', () => {
    expect(idm(5, 12, Infinity, 0)).toBeGreaterThan(1);
    expect(idm(12, 12, Infinity, 0)).toBeCloseTo(0, 5);
    expect(idm(10, 12, 5, 10)).toBeLessThan(-5);
  });

  it('follows Rajkot rhythm: busy evenings, quiet afternoon rest and nights', () => {
    expect(trafficDensity(19.5)).toBeGreaterThan(0.85);
    expect(trafficDensity(14.5)).toBeLessThan(trafficDensity(10) * 0.6);
    expect(trafficDensity(3)).toBeLessThan(0.15);
  });
});

import { describe, expect, it } from 'vitest';
import { bodyPosition, Clock, goldenHour, skyDirection } from '../src/render/sky';

describe('sun position for Rajkot', () => {
  const day = new Date(Date.UTC(2026, 9, 9));
  const at = (h: number) => new Clock(h, day).instant();

  it('is high in the south at noon IST in October', () => {
    const p = bodyPosition('sun', at(12.75));
    expect(p.altitude).toBeGreaterThan(1.0); // ~60 degrees
    expect(p.altitude).toBeLessThan(1.15);
    const d = skyDirection(p.altitude, p.azimuth);
    expect(d.z).toBeGreaterThan(0); // south is +z
  });

  it('is low in the west before sunset and below the horizon at night', () => {
    const evening = bodyPosition('sun', at(17.5));
    expect(evening.altitude).toBeGreaterThan(0);
    expect(evening.altitude).toBeLessThan(0.35);
    expect(skyDirection(evening.altitude, evening.azimuth).x).toBeLessThan(0); // west is -x
    expect(bodyPosition('sun', at(22)).altitude).toBeLessThan(-0.3);
  });

  it('puts golden hour shortly before an evening sunset', () => {
    const h = goldenHour(new Date(2026, 9, 9));
    expect(h).toBeGreaterThan(17);
    expect(h).toBeLessThan(18.5);
  });
});

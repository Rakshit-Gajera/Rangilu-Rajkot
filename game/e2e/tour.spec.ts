import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 gate (PROMPT §13): cross-city travel streams without errors and memory stays bounded.
 * 1) Fly the camera along the GPS route Race Course -> Darshan University (~17 km) at riding speed.
 * 2) Visit far-apart places twice; the second round must not use more geometry or heap than the first.
 */
const PLACES: [string, number, number][] = [
  ['aji-dam', 4777, -3637], ['nyari-dam', -9094, -6830], ['saurashtra-university', -6161, -416],
  ['atal-sarovar', -7297, 2696], ['ishwariya-park', -3830, 6450], ['pradyuman-park', 3881, 526],
];
const OUT = resolve(import.meta.dirname, '../../shots');
const g = (page: Page, expr: string) => page.evaluate(`window.__game.${expr}`) as Promise<any>;

async function viewAt(page: Page, x: number, n: number, hx: number, hn: number) {
  const ground = (await g(page, `terrain(${x}, ${-n})`)) ?? 30;
  await page.evaluate(([px, py, pz, lx, lz]) => (window as any).__game.setView([px, py, pz], [lx, py - 25, lz], 11),
    [x, ground + 35, -n, hx, -hn]);
}

async function settle(page: Page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => (window as any).__game.idle(), null, { timeout: 120_000 });
}

test('cross-city tour streams without errors and without leaking', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?shadows=0&date=2026-10-09');
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 120_000 });
  await settle(page);

  const route: number[] = await g(page, 'route(-1067, 473, -2123, 16169)');
  expect(route && route.length).toBeGreaterThan(20);
  let maxQueue = 0, steps = 0, last: [number, number] | null = null;
  for (let q = 0; q < route.length - 2; q += 2) {
    const x = route[q], n = route[q + 1];
    if (last && Math.hypot(x - last[0], n - last[1]) < 150) continue;
    const ahead = route.slice(q, q + 40);
    await viewAt(page, x, n, ahead[ahead.length - 2], ahead[ahead.length - 1]);
    await page.waitForTimeout(160); // ~150 m per frame-burst: faster than riding at 85 km/h
    maxQueue = Math.max(maxQueue, (await g(page, 'worldStats()')).queued);
    last = [x, n];
    steps++;
  }
  await settle(page);
  await page.screenshot({ path: `${OUT}/22-arrived-darshan-university.png` });

  const rounds: { geometries: number; heap: number; tiles: number; far: number; colliders: number }[][] = [[], []];
  for (const round of [0, 1]) {
    for (const [name, x, n] of PLACES) {
      await viewAt(page, x, n, x + 200, n + 200);
      await settle(page);
      const s = await g(page, 'worldStats()');
      rounds[round].push({ geometries: await g(page, 'geometries()'), heap: await g(page, 'heap()'), tiles: s.tiles,
        far: s.farTiles, colliders: s.colliders });
      if (round === 0) await page.screenshot({ path: `${OUT}/23-tour-${name}.png` });
    }
  }
  const max = (r: typeof rounds[0], k: keyof typeof rounds[0][0]) => Math.max(...r.map((v) => v[k]));
  const report = { steps, maxQueue, rounds, failures: (await g(page, 'worldStats()')).failures, errors };
  writeFileSync(`${OUT}/tour.json`, JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
  expect(report.failures).toBe(0);
  expect(max(rounds[1], 'geometries')).toBeLessThanOrEqual(max(rounds[0], 'geometries') * 1.25 + 50);
  if (max(rounds[0], 'heap') > 0) expect(max(rounds[1], 'heap')).toBeLessThanOrEqual(max(rounds[0], 'heap') * 1.3);
});

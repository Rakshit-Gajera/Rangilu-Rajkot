import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Fixed camera poses for visual review (PROMPT §12). x east, n north from Trikon Baug; heights above ground. */
const VIEWS: { name: string; cam: [number, number, number]; look: [number, number, number]; hour: number }[] = [
  { name: '01-race-course-sunset', cam: [-1030, 6, 440], look: [-1130, 2, 520], hour: 18.4 },
  { name: '02-jubilee-watson', cam: [70, 4, 545], look: [0, 6, 595], hour: 10 },
  { name: '05-trikon-baug', cam: [60, 14, -60], look: [0, 2, 0], hour: 11 },
  { name: '04-soni-bazaar', cam: [600, 2.2, 225], look: [650, 4, 275], hour: 11 },
  { name: '04b-old-city-afternoon-rest', cam: [290, 2.2, 215], look: [330, 4, 250], hour: 14.5 },
  { name: '15-aerial-centre-night', cam: [-450, 320, -550], look: [-250, 0, 450], hour: 21 },
  { name: '15b-aerial-centre-day', cam: [-450, 320, -550], look: [-250, 0, 450], hour: 12 },
];
const OUT = resolve(import.meta.dirname, '../../shots');

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 120_000 });
  const bootMs = Date.now() - t0;
  return { errors, bootMs };
}

test('boots to playable and captures viewpoints', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const { errors, bootMs } = await boot(page);
  // Load the whole slice before the fixed views.
  await page.evaluate(() => (window as any).__game.ensure(-500, -500, 3000));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-spawn-third-person.png` });
  const results: Record<string, unknown> = { bootMs };
  for (const v of VIEWS) {
    const pose = await page.evaluate(([cam, look]) => {
      const g = (window as any).__game;
      const gc = g.terrain(cam[0], -cam[2]) ?? 30;
      const gl = g.terrain(look[0], -look[2]) ?? gc;
      return { pos: [cam[0], gc + cam[1], -cam[2]], look: [look[0], gl + look[1], -look[2]] };
    }, [v.cam, v.look] as const);
    await page.evaluate(([p, l, h]) => (window as any).__game.setView(p, l, h), [pose.pos, pose.look, v.hour] as const);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${v.name}.png` });
    results[v.name] = await page.evaluate(() => (window as any).__game.stats());
  }
  writeFileSync(`${OUT}/stats.json`, JSON.stringify(results, null, 2));
  expect(errors, errors.join('\n')).toEqual([]);
  expect(bootMs).toBeLessThan(60_000);
});

/** Wait for simulated (not wall-clock) seconds; needs ?fixedstep=1. */
const waitSim = (page: Page, secs: number) => page.evaluate((d) => new Promise<void>((r) => {
  const g = (window as any).__game;
  const t0 = g.simTime();
  const f = () => (g.simTime() - t0 >= d ? r() : requestAnimationFrame(f));
  f();
}), secs);

test('walks and rides the scooter without falling through the world', async ({ page }) => {
  await page.goto('/?fixedstep=1&shadows=0');
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 120_000 });
  const start = await page.evaluate(() => (window as any).__game.player());
  await page.locator('#game').click();
  await page.keyboard.down('KeyW');
  await waitSim(page, 2.5);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => (window as any).__game.player());
  const walked = Math.hypot(after[0] - start[0], after[2] - start[2]);
  expect(walked).toBeGreaterThan(2);
  expect(after[1]).toBeGreaterThan(start[1] - 5);

  // Walk back towards the scooter and get on.
  const s = await page.evaluate(() => (window as any).__game.scooter());
  await page.evaluate(([x, y, z]) => (window as any).__game.teleportPlayer?.(x - 1.5, y, z), s.pos);
  await waitSim(page, 0.3);
  await page.keyboard.press('KeyE');
  await waitSim(page, 0.2);
  expect((await page.evaluate(() => (window as any).__game.scooter())).riding).toBe(true);
  await page.keyboard.down('KeyW');
  await waitSim(page, 4);
  await page.keyboard.up('KeyW');
  const ride = await page.evaluate(() => (window as any).__game.scooter());
  const moved = Math.hypot(ride.pos[0] - s.pos[0], ride.pos[2] - s.pos[2]);
  expect(moved).toBeGreaterThan(25); // ~0 -> 50 km/h in 4 s along the ring road
  expect(ride.up[1]).toBeGreaterThan(0.9); // still upright
  mkdirSync(OUT, { recursive: true });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await waitSim(page, 0.6);
  await page.screenshot({ path: `${OUT}/06-riding-scooter.png` });
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  expect(ride.pos[1]).toBeGreaterThan(s.pos[1] - 5);
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Fixed camera poses for visual review (PROMPT §12). x east, n north from Trikon Baug; heights above ground. */
const VIEWS: { name: string; cam: [number, number, number]; look: [number, number, number]; hour: number }[] = [
  // Eye height 1.7 m on real road centrelines near each landmark (computed from data/interim/roads.parquet).
  { name: '01-race-course-sunset', cam: [-1217.5, 1.7, 1364.6], look: [-1220.4, 3, 1226.1], hour: 17.9 },
  { name: '02-jubilee-watson', cam: [-65.7, 1.7, 622.2], look: [0.6, 6, 595.2], hour: 10 },
  { name: '03-kaba-gandhi-no-delo', cam: [282.1, 1.7, 252.2], look: [318.2, 5, 241.0], hour: 11 },
  { name: '04-soni-bazaar', cam: [604.8, 1.7, 262.4], look: [639.4, 5, 261.3], hour: 11 },
  { name: '04b-soni-bazaar-afternoon-rest', cam: [604.8, 1.7, 262.4], look: [639.4, 5, 261.3], hour: 14.5 },
  { name: '04c-soni-bazaar-night', cam: [604.8, 1.7, 262.4], look: [639.4, 5, 261.3], hour: 20.5 },
  { name: '05-trikon-baug', cam: [-16.0, 1.7, 2.4], look: [0.5, 3, 0.1], hour: 11 },
  { name: '07-rajkumar-college', cam: [-322.9, 1.7, -188.1], look: [-400.7, 6, -153.1], hour: 9 },
  // Phase 3: flyovers and chowks (positions from data/interim/roads.parquet and chowks.parquet).
  { name: '30-flyover-ambedkar-chowk', cam: [36, 2, 1014], look: [210, 8, 1060], hour: 10 },
  { name: '31-flyover-150ft-ring-road', cam: [-3075, 12, -1000], look: [-3125, 8, -800], hour: 16 },
  { name: '32-indira-gandhi-statue', cam: [-3125, 4, -760], look: [-3144, 5, -741], hour: 10 },
  { name: '33-mahatma-gandhi-statue', cam: [-22, 4, 470], look: [-41, 4, 491], hour: 10 },
  { name: '34-hanumanji-statue', cam: [185, 4, 1050], look: [170, 8, 1075], hour: 10 },
  { name: '35-fountain-chowk', cam: [-1045, 6, 345], look: [-1071, 2, 375], hour: 11 },
  { name: '36-bhaktinagar-circle', cam: [10, 6, -1590], look: [37, 1, -1621], hour: 18 },
  { name: '37-chowk-night', cam: [-1045, 6, 345], look: [-1071, 2, 375], hour: 21 },
  { name: '15-aerial-centre-night', cam: [-450, 320, -550], look: [-250, 0, 450], hour: 21 },
  { name: '15b-aerial-centre-day', cam: [-450, 320, -550], look: [-250, 0, 450], hour: 12 },
];
const OUT = resolve(import.meta.dirname, '../../shots');

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto('/?date=2026-10-09');
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 120_000 });
  const bootMs = Date.now() - t0;
  return { errors, bootMs };
}

test('boots to playable and captures viewpoints', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  mkdirSync(OUT, { recursive: true });
  const { errors, bootMs } = await boot(page);
  // Load the whole slice before the fixed views.
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => (window as any).__game.idle(), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-spawn-third-person.png` });
  const results: Record<string, unknown> = { bootMs };
  // VIEWS=3 captures only views whose name starts with "3" (quick iteration on one area).
  const only = process.env.VIEWS;
  for (const v of VIEWS.filter((x) => !only || x.name.startsWith(only))) {
    // Load the area first, and stand on the nearest real road (never inside a building or under the ground).
    const [rx, rn] = await page.evaluate(([x, n]) => (window as any).__game.roadNear(x, n), [v.cam[0], v.cam[2]]);
    if (v.cam[1] < 100 && Math.hypot(rx - v.cam[0], rn - v.cam[2]) < 60) { v.cam[0] = rx; v.cam[2] = rn; }
    await page.evaluate(([x, n]) => (window as any).__game.ensure(x, -n, 300), [v.cam[0], v.cam[2]]);
    const pose = await page.evaluate(([cam, look]) => {
      const g = (window as any).__game;
      const gc = g.terrain(cam[0], -cam[2]) ?? 30;
      const gl = g.terrain(look[0], -look[2]) ?? gc;
      return { pos: [cam[0], gc + cam[1], -cam[2]], look: [look[0], gl + look[1], -look[2]] };
    }, [v.cam, v.look] as const);
    await page.evaluate(([p, l, h]) => (window as any).__game.setView(p, l, h), [pose.pos, pose.look, v.hour] as const);
    await page.waitForTimeout(400);
    await page.waitForFunction(() => (window as any).__game.idle(), null, { timeout: 120_000 });
    await page.waitForTimeout(300);
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
  test.setTimeout(420_000); // fixed-step simulation in a software renderer is slow
  await page.goto('/?fixedstep=1&shadows=0&date=2026-10-09');
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

test('map: waypoint, GPS route and fast travel to Rajkot Junction', async ({ page }) => {
  await page.goto('/?shadows=0&date=2026-10-09');
  await page.waitForFunction(() => (window as any).__game?.ready, null, { timeout: 120_000 });
  await page.keyboard.press('KeyM');
  await expect(page.locator('#citymap')).toBeVisible();
  await page.locator('#map-places li', { hasText: 'Rajkot Junction' }).click();
  await expect(page.locator('#map-route')).toContainText('km', { timeout: 10_000 });
  const km = parseFloat((await page.locator('#map-route').textContent())!.replace(/[^\d.]/g, ''));
  expect(km).toBeGreaterThan(1.8);
  expect(km).toBeLessThan(5);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/20-map-route.png` });
  await page.keyboard.press('KeyF');
  await expect(page.locator('#citymap')).toBeHidden();
  await page.waitForFunction(() => {
    const p = (window as any).__game.player();
    return Math.hypot(p[0] - 49, -p[2] - 1945) < 150;
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => (window as any).__game.player());
  const ground = await page.evaluate(([x, z]) => (window as any).__game.terrain(x, z), [p[0], p[2]]);
  expect(Math.abs(p[1] - ground)).toBeLessThan(3); // standing on the ground, not inside or under it
  await page.screenshot({ path: `${OUT}/21-after-fast-travel.png` });
});

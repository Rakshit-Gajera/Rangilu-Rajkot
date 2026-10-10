import { chromium } from '@playwright/test';
// Close look at street life: pick a walking person, a cow and a car near the player and frame each.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 520 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?dynres=0&quality=high&date=2026-10-09&hour=10&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(25000);
const pl = await p.evaluate(() => window.__game.player());
const ag = await p.evaluate(() => window.__game.agents());
const near = (k) => ag.filter((a) => a.kind === k).sort((a, b2) => Math.hypot(a.x - pl[0], a.n + pl[2]) - Math.hypot(b2.x - pl[0], b2.n + pl[2]))[0];
for (const [k, d, h] of [['ped', 3.2, 1.3], ['cow', 4.5, 1.4], ['vehicle', 7, 2.2], ['parked', 6, 2]]) {
  const a = near(k);
  if (!a) { console.log('none', k); continue; }
  const sx = a.x + Math.sin(a.yaw + 0.7) * d, sn = a.n + Math.cos(a.yaw + 0.7) * d;
  await p.evaluate(([cx, cy, cz, lx, ly, lz]) => window.__game.setView([cx, cy, cz], [lx, ly, lz], 10), [sx, a.y + h, -sn, a.x, a.y + 0.8, -a.n]);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `../shots/street-${k}.png` });
  console.log('shot', k);
}
await b.close();

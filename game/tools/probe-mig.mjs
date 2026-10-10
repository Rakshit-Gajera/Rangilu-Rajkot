import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const shots = [['44-kotecha-mig27', -2399, -510, -2380, -478], ['45-limda-chowk-neem', -353, 164, -333, 190], ['46-hospital-chowk-ambedkar', 1, 998, 20, 1020]];
for (const [name, tx, tn, cx, cn] of shots) {
  await p.evaluate(([x, n]) => window.__game.setView([x, 200, -n], [x + 10, 0, -n], 11), [cx, cn]);
  await p.evaluate(([x, n]) => window.__game.ensure(x, -n, 300), [cx, cn]);
  await p.waitForFunction(() => window.__game.idle(), null, { timeout: 120000 });
  const gy = await p.evaluate(([x, n]) => window.__game.terrain(x, -n), [cx, cn]);
  const ty = await p.evaluate(([x, n]) => window.__game.terrain(x, -n), [tx, tn]);
  await p.evaluate(([cx, cy, cn, tx, ty, tn]) => window.__game.setView([cx, cy, -cn], [tx, ty, -tn], 11), [cx, gy + 4, cn, tx, ty + 5, tn]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `../shots/${name}.png` });
}
await b.close();

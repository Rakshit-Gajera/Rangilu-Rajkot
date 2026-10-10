import { chromium } from '@playwright/test';
// Views of the hand-built landmark models: camera in front of each, looking at it.
const only = process.env.ONLY?.split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 720, height: 450 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&dynres=0&quality=medium&date=2026-10-09&hour=10&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
const sites = await p.evaluate(() => window.__game.sites());
for (const s of sites) {
  if (only && !only.includes(s.id)) continue;
  const dist = Math.min(Math.max(s.w, s.d), 90) * 0.9 + 18;
  const cx = s.x + s.fx * dist, cn = s.n + s.fn * dist;
  // Point the camera there first, so streaming keeps the area loaded.
  await p.evaluate(([cx, cz, lx, lz]) => window.__game.setView([cx, 200, cz], [lx, 30, lz], 10), [cx, -cn, s.x, -s.n]);
  await p.evaluate(([x, n]) => window.__game.ensure(x, -n, 300), [s.x, s.n]);
  const gy = await p.evaluate(([x, n]) => window.__game.terrain(x, -n), [s.x, s.n]);
  await p.evaluate(([cx, cy, cz, lx, ly, lz]) => window.__game.setView([cx, cy, cz], [lx, ly, lz], 10), [cx, gy + 28, -cn, s.x, gy + 5, -s.n]);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `../shots/lm-${s.id}.png` });
  console.log('shot', s.id, s.model);
}
await b.close();

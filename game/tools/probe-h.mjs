import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
for (const [x, n] of [[-2399, -470], [-3075, -1000], [604, 262]]) {
  await p.evaluate(([x, n]) => window.__game.setView([x, 200, -n], [x + 10, 0, -n], 11), [x, n]);
  await p.evaluate(([x, n]) => window.__game.ensure(x, -n, 300), [x, n]);
  await p.waitForFunction(() => window.__game.idle(), null, { timeout: 120000 });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(([x, n]) => ({ t: window.__game.terrain(x, -n), g: window.__game.ground(x, -n, 400) }), [x, n]);
  console.log(x, n, JSON.stringify(r));
}
await b.close();

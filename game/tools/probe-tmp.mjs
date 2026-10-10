import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.goto('http://localhost:5173/?shadows=0&dynres=0&quality=low&hour=10&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
const s = (await p.evaluate(() => window.__game.sites())).find((q) => q.id === 'baps_kalawad');
await p.evaluate(([x, n]) => window.__game.ensure(x, -n, 300), [s.x, s.n]);
console.log(JSON.stringify(s), await p.evaluate(([x, n, fx, fn]) => [window.__game.terrain(x, -n), window.__game.terrain(x + fx * 70, -(n + fn * 70))], [s.x, s.n, s.fx, s.fn]));
await b.close();

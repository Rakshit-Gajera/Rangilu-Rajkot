import { chromium } from '@playwright/test';
// Signal junctions: how many, and a look at the nearest one with traffic.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 720, height: 450 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&dynres=0&quality=low&date=2026-10-09&hour=17.2&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
await p.locator('#game').click(); // unlocks audio (ambience)
await p.waitForTimeout(3000);
const s = await p.evaluate(() => window.__game.signals());
console.log('signal junctions', s.count, 'near spawn', JSON.stringify(s.near));
const [x, n] = s.near[0] ?? [0, 0];
await p.evaluate(([x, n]) => { window.__game.teleportPlayer(x + 15, window.__game.terrain(x + 15, -n) + 0.3, -n - 15); }, [x, n]);
await p.waitForTimeout(25000);
await p.evaluate(([x, n]) => window.__game.setView([x + 30, window.__game.terrain(x, -n) + 14, -n + 30], [x, window.__game.terrain(x, -n) + 2, -n]), [x, n]);
await p.waitForTimeout(3000);
await p.screenshot({ path: '../shots/81-signal.png' });
await b.close();

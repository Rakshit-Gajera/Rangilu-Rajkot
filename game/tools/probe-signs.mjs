import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
// "Mahavir Sweets" board at (765.8, 31.4, -154.5) facing +x: stand 7 m in front of it.
await p.evaluate(() => window.__game.ensure(766, -155, 300));
await p.evaluate(() => window.__game.setView([773, 31.0, -156], [765.8, 31.4, -154.5], 11));
await p.waitForTimeout(1000);
await p.waitForFunction(() => window.__game.idle(), null, { timeout: 120000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '../shots/40-signboard-closeup.png' });
await p.evaluate(() => window.__game.setView([773, 31.0, -156], [765.8, 31.4, -154.5], 21));
await p.waitForTimeout(800);
await p.screenshot({ path: '../shots/41-signboard-night.png' });
await b.close();

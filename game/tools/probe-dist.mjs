import { chromium } from '@playwright/test';
// Production build smoke test (vite preview on :4173): boots, no errors, private file not served.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
const t0 = Date.now();
await p.goto('http://localhost:4173/?quality=medium');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
console.log('boot ms', Date.now() - t0);
await p.waitForTimeout(5000);
await p.screenshot({ path: '../shots/95-dist.png' });
const priv = await p.evaluate(async () => (await fetch('world/private.local.json')).status);
console.log('private file status (want 404):', priv, '| errors:', errors);
console.log('map + GPS working:', !!(await p.evaluate(() => window.__game.route(-1067, 473, 49, 1945))), '| signals', (await p.evaluate(() => window.__game.signals())).count);
await b.close();

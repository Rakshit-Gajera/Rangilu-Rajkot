import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09&hour=18.5');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
for (let k = 0; k < 6; k++) {
  await p.waitForTimeout(5000);
  console.log(JSON.stringify(await p.evaluate(() => window.__game.life())));
}
await p.screenshot({ path: '../shots/50-traffic-race-course.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();

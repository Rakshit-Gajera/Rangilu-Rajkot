import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
await p.keyboard.press('KeyM');
await p.locator('#map-places li', { hasText: 'Rajkot Junction' }).click();
await p.waitForTimeout(1000);
await p.keyboard.press('KeyF');
await p.waitForTimeout(8000);
for (let k = 0; k < 5; k++) {
  const pl = await p.evaluate(() => window.__game.player());
  const t = await p.evaluate(([x, z]) => window.__game.terrain(x, z), [pl[0], pl[2]]);
  const g = await p.evaluate(([x, z, y]) => window.__game.ground(x, z), [pl[0], pl[2], pl[1]]);
  console.log(pl.map((v) => v.toFixed(1)).join(','), 'terrain', t?.toFixed(1), 'physicsGround(from 500)', g?.toFixed(1));
  await p.waitForTimeout(1000);
}
await p.screenshot({ path: '../shots/21-after-fast-travel.png' });
await b.close();

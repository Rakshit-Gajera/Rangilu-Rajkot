import { chromium } from '@playwright/test';
// Private: start at home (?home=1), look around, try the map teleport. Screenshots stay in shots/ (git-ignored).
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?home=1&shadows=0&dynres=0&quality=high&date=2026-10-09&hour=10&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(8000);
await p.screenshot({ path: '../shots/90-home-start.png' });
const pl = await p.evaluate(() => window.__game.player());
await p.evaluate(([x, y, z]) => window.__game.setView([x + 40, y + 35, z + 40], [x, y, z]), pl);
await p.waitForTimeout(6000);
await p.screenshot({ path: '../shots/91-home-above.png' });
await p.evaluate(() => window.__game.freeView());
// Map teleport: open the map, double-click a point 1.5 km east.
await p.keyboard.press('KeyM');
await p.waitForTimeout(500);
const box = await p.locator('#citymap canvas').boundingBox();
await p.mouse.dblclick(box.x + box.width / 2 + 120, box.y + box.height / 2);
const t0 = Date.now();
await p.waitForFunction(() => !document.getElementById('travel-fade').classList.contains('on'), null, { timeout: 120000 });
const pl2 = await p.evaluate(() => window.__game.player());
console.log('teleported', Math.round(Math.hypot(pl2[0] - pl[0], pl2[2] - pl[2])), 'm in', Date.now() - t0, 'ms; height above terrain',
  (pl2[1] - await p.evaluate(([x, z]) => window.__game.terrain(x, z), [pl2[0], pl2[2]])).toFixed(2));
await p.screenshot({ path: '../shots/92-teleported.png' });
await b.close();

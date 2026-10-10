import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 720, height: 450 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1&dynres=0&quality=low&date=2026-10-09&hour=17&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
const waitSim = (d) => p.evaluate((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), d);
await p.locator('#game').click();
console.log('cricket', await p.evaluate(() => window.__game.startActivity('cricket')));
for (let k = 0; k < 3; k++) {
  await waitSim(2.7 + k * 0.03); // pause 1.5 + run-up 1.2, then the ball flies ~0.6–0.95 s
  await waitSim(0.7);
  await p.keyboard.press('Space');
  await waitSim(2.2);
  console.log(JSON.stringify(await p.evaluate(() => window.__game.activity())));
}
const pl = await p.evaluate(() => window.__game.player());
await p.evaluate(([x, y, z]) => window.__game.setView([x + 6, y + 3, z + 6], [x, y + 1, z]), pl);
await waitSim(0.2);
await p.screenshot({ path: '../shots/100-cricket.png' });
await p.evaluate(() => window.__game.freeView());
await p.keyboard.press('KeyX');
console.log('lokmelo', await p.evaluate(() => window.__game.startActivity('lokmelo')));
await waitSim(1);
console.log(JSON.stringify(await p.evaluate(() => window.__game.activity())));
const pl2 = await p.evaluate(() => window.__game.player());
await p.evaluate(([x, y, z]) => window.__game.setView([x - 40, y + 25, z + 50], [x - 40, y + 3, z]), pl2);
await waitSim(0.5);
await p.screenshot({ path: '../shots/101-lokmelo.png' });
await b.close();

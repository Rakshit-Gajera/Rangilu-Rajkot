import { chromium } from '@playwright/test';
// Sandbox menu, monsoon rain with wet roads, summer haze, a ramp jump.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 720, height: 450 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1&dynres=0&quality=low&date=2026-10-09&hour=11');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const waitSim = (d) => p.evaluate((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), d);
await waitSim(1);
await p.keyboard.press('Tab');
await waitSim(0.2);
await p.screenshot({ path: '../shots/72-sandbox-menu.png' });
await p.keyboard.press('Tab');
await waitSim(0.2);
console.log('menu closed', await p.evaluate(() => document.getElementById('sandbox').hidden));
// Monsoon rain.
await p.evaluate(() => window.__game.setWeather('rain'));
await waitSim(0.3);
await p.screenshot({ path: '../shots/73-monsoon.png' });
await p.evaluate(() => window.__game.setWeather('haze'));
await waitSim(0.3);
await p.screenshot({ path: '../shots/74-haze.png' });
console.log(JSON.stringify(await p.evaluate(() => window.__game.weather())));
// Ramp jump on a motorcycle.
await p.evaluate(() => window.__game.setWeather('clear'));
await p.evaluate(() => window.__game.sandbox.spawnVehicle('motorcycle'));
await waitSim(0.8);
await p.evaluate(() => window.__game.sandbox.spawnProp('ramp'));
await waitSim(0.5);
await p.locator('#game').click();
await p.keyboard.down('KeyW');
let maxY = -1e9, y0 = null;
for (let k = 0; k < 40; k++) {
  await waitSim(0.1);
  const d = await p.evaluate(() => window.__game.driving());
  y0 ??= d.pos[1];
  maxY = Math.max(maxY, d.pos[1]);
  if (k === 22) await p.screenshot({ path: '../shots/75-ramp.png' });
}
await p.keyboard.up('KeyW');
const d = await p.evaluate(() => window.__game.driving());
console.log('ramp: rose', (maxY - y0).toFixed(2), 'm; now upright', d.up[1].toFixed(2), 'speed', (d.speed * 3.6).toFixed(0));
await b.close();

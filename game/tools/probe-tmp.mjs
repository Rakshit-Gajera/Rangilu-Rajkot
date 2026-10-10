import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 600, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('http://localhost:5173/?quality=medium&dynres=0&hour=10&save=0&title=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
for (let k = 0; k < 4; k++) {
  await p.waitForTimeout(6000);
  console.log(await p.evaluate(() => {
    const pl = window.__game.player();
    const ag = window.__game.agents();
    const peds = ag.filter((a) => a.kind === 'ped').map((a) => Math.round(Math.hypot(a.x - pl[0], a.n + pl[2])));
    return JSON.stringify({ peds: peds.length, near70: peds.filter((d) => d < 70).length, min: Math.min(...peds), bubbles: document.querySelectorAll('#talk .bubble').length, life: window.__game.life() });
  }));
}
await b.close();

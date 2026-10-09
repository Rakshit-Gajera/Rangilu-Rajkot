import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const s0 = await p.evaluate(() => window.__game.scooter());
await p.evaluate(([x, y, z]) => window.__game.teleportPlayer(x - 1.5, y, z), s0.pos);
const waitSim = (secs) => p.evaluate((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), secs);
await waitSim(0.5);
await p.locator('#game').click();
await p.keyboard.press('KeyE');
await waitSim(0.2);
await p.keyboard.down('KeyW');
let prev = null;
for (let k = 0; k < 16; k++) {
  await waitSim(0.5);
  const s = await p.evaluate(() => window.__game.scooter());
  const step = prev ? Math.hypot(s.pos[0] - prev[0], s.pos[2] - prev[2]) : 0;
  prev = s.pos;
  console.log(((k + 1) * 0.5).toFixed(1) + 's', 'speed', (s.speed * 3.6).toFixed(1), 'km/h', 'moved', step.toFixed(2), 'm', 'up', s.up[1].toFixed(2), 'contacts', s.contacts.map(Number).join(''));
}
await b.close();

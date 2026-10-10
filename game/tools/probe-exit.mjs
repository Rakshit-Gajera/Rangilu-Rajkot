import { chromium } from '@playwright/test';
// Ride the scooter at speed, get off (E) mid-ride, and check the scooter stays put, upright and above ground.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1&dynres=0&quality=low&date=2026-10-09&hour=11');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const waitSim = (d) => p.evaluate((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), d);
const s0 = await p.evaluate(() => window.__game.scooter());
await p.evaluate(([x, y, z]) => window.__game.teleportPlayer(x - 1.2, y - 0.5, z), s0.pos);
await waitSim(0.5);
await p.locator('#game').click();
await p.keyboard.press('KeyE');
await waitSim(0.3);
await p.keyboard.down('KeyW');
await waitSim(4);
const s1 = await p.evaluate(() => window.__game.scooter());
console.log('riding', s1.riding, 'speed', (s1.speed * 3.6).toFixed(0), 'km/h');
await p.keyboard.press('KeyE');
await p.keyboard.up('KeyW');
for (const t of [0.5, 2, 5]) {
  await waitSim(t);
  const s = await p.evaluate(() => window.__game.scooter());
  const pl = await p.evaluate(() => window.__game.player());
  const ground = await p.evaluate(([x, z]) => window.__game.terrain(x, z), [s.pos[0], s.pos[2]]);
  console.log(`+${t}s riding`, s.riding, 'speed', (s.speed * 3.6).toFixed(1), 'up', s.up[1].toFixed(2),
    'height above ground', (s.pos[1] - ground).toFixed(2), 'distance to player', Math.hypot(s.pos[0] - pl[0], s.pos[2] - pl[2]).toFixed(1));
}
const s = await p.evaluate(() => window.__game.scooter());
await p.evaluate(([x, y, z]) => window.__game.setView([x + 4, y + 2, z + 3], [x, y, z]), s.pos);
await waitSim(0.2);
await p.screenshot({ path: '../shots/71-exit-parked.png' });
await b.close();

import { chromium } from '@playwright/test';
// Spawns and drives every vehicle type: speed after 5 s of throttle, upright, wheel contacts; side shots.
const kinds = (process.env.KINDS ?? 'bicycle,scooter,motorcycle,chhakdo,auto,hatchback,suv,bus,tractor').split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1&dynres=0&quality=low&date=2026-10-09&hour=11');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const waitSim = (d) => p.evaluate((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), d);
await p.locator('#game').click();
for (const kind of kinds) {
  const start = await p.evaluate(() => window.__game.roadNear(-1067, 473));
  await p.evaluate(([x, n]) => window.__game.teleportPlayer(x, window.__game.terrain(x, -n) + 0.2, -n), start);
  await waitSim(0.3);
  await p.evaluate((k) => window.__game.spawnVehicle(k, true), kind);
  await waitSim(1.0);
  const s0 = await p.evaluate(() => window.__game.driving());
  await p.evaluate(([x, y, z]) => window.__game.setView([x + 4, y + 1.6, z + 3], [x, y, z]), s0.pos);
  await waitSim(0.2);
  await p.screenshot({ path: `../shots/70-${kind}.png` });
  await p.evaluate(() => window.__game.freeView());
  await p.keyboard.down('KeyW');
  await waitSim(5);
  await p.keyboard.up('KeyW');
  const s1 = await p.evaluate(() => window.__game.driving());
  const moved = Math.hypot(s1.pos[0] - s0.pos[0], s1.pos[2] - s0.pos[2]);
  console.log(kind.padEnd(11), 'settled up', s0.up[1].toFixed(2), 'contacts', s0.contacts.map(Number).join(''),
    '| 5 s: speed', (s1.speed * 3.6).toFixed(0), 'km/h moved', moved.toFixed(1), 'm up', s1.up[1].toFixed(2));
  await p.keyboard.press('KeyE');
  await waitSim(0.3);
}
await b.close();

import { chromium } from '@playwright/test';
// Runs each activity by teleporting to its targets: rickshaw (2 rides), delivery, time trial lap, BRTS stops, garba.
const only = process.env.ONLY?.split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?shadows=0&fixedstep=1&dynres=0&quality=low&date=2026-10-09&hour=11&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
const g = (fn, arg) => p.evaluate(fn, arg);
const waitSim = (d) => g((d) => new Promise((r) => { const t0 = window.__game.simTime(); const f = () => window.__game.simTime() - t0 >= d ? r() : requestAnimationFrame(f); f(); }), d);
async function reach(times = 1, settle = 0.6) {
  for (let k = 0; k < times; k++) {
    const w = await g(() => window.__game.waypoint());
    if (!w) return;
    await g(([x, n]) => window.__game.moveTo(x, n), [w.x, w.n]);
    await waitSim(settle);
  }
}
const log = async (label) => console.log(label.padEnd(16), JSON.stringify(await g(() => window.__game.activity())), '₹' + await g(() => window.__game.money()));
await waitSim(0.5);
console.log('discovered at start', await g(() => window.__game.discovered()));
if (!only || only.includes('rickshaw')) {
  console.log('rickshaw no auto:', await g(() => window.__game.startActivity('rickshaw')));
  await g(() => window.__game.spawnVehicle('auto', true));
  await waitSim(0.5);
  console.log('rickshaw:', await g(() => window.__game.startActivity('rickshaw')));
  await log('pickup');
  await reach(); await log('riding');
  await reach(); await log('paid, next');
  await p.keyboard.press('KeyX'); await waitSim(0.2); await log('quit');
}
if (!only || only.includes('delivery')) {
  await g(() => window.__game.spawnVehicle('scooter', true));
  await waitSim(0.5);
  console.log('delivery:', await g(() => window.__game.startActivity('delivery')));
  await reach(); await log('to customer');
  await reach(); await log('delivered');
  await p.keyboard.press('KeyX'); await waitSim(0.2);
}
if (!only || only.includes('timetrial')) {
  console.log('timetrial:', await g(() => window.__game.startActivity('timetrial')));
  for (let k = 0; k < 11; k++) { await reach(1, 0.3); }
  await log('lap done');
}
if (!only || only.includes('brts')) {
  console.log('brts:', await g(() => window.__game.startActivity('brts')));
  await waitSim(0.5);
  await log('bus start');
  for (let k = 0; k < 2; k++) { await reach(1, 3.6); await log('station'); }
  await p.keyboard.press('KeyX'); await waitSim(0.2);
}
if (!only || only.includes('garba')) {
  await p.keyboard.press('KeyE'); await waitSim(0.5);
  console.log('garba:', await g(() => window.__game.startActivity('garba')));
  await waitSim(3.1);
  for (const k of ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight']) await p.keyboard.press(k);
  await waitSim(0.4);
  await p.screenshot({ path: '../shots/80-garba.png' });
  await log('garba');
}
await b.close();

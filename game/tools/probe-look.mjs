import { chromium } from '@playwright/test';
// Look test: the same street view at several hours (and weather), for judging sky, light and materials.
const hours = (process.env.HOURS ?? '10,17.6').split(',').map(Number);
const tag = process.env.TAG ?? 'look';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:5173/?dynres=0&quality=high&date=2026-10-09&hour=10&save=0${process.env.WEATHER ? '&weather=' + process.env.WEATHER : ''}`);
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
for (const h of hours) {
  // Race Course ring road, looking along the street with buildings and sky.
  // VIEW = [[dx,dy,dz],[lx,ly,lz]] relative to the player's feet.
  const v = JSON.parse(process.env.VIEW ?? '[[3,1.7,7],[-25,8,-30]]');
  const pl = await p.evaluate(() => window.__game.player());
  await p.evaluate(([h, a, b]) => window.__game.setView(a, b, h),
    [h, v[0].map((d, i) => pl[i] + d), v[1].map((d, i) => pl[i] + d)]);
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `../shots/${tag}-${h}.png` });
}
await b.close();

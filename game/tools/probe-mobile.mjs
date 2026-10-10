import { chromium } from '@playwright/test';
// Phone (landscape and portrait): boot time, title screen, in-game touch controls, a tap on E.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [tag, vp] of [['land', { width: 844, height: 390 }], ['port', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'pageerror', e.message));
  await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const t0 = Date.now();
  await p.goto('http://localhost:5173/?hour=11&save=0&spawn=default');
  await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
  console.log(tag, 'boot ms', Date.now() - t0, 'quality', await p.evaluate(() => window.__game.quality()));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `../shots/mob-${tag}-title.png` });
  await p.tap('#t-play');
  await p.waitForTimeout(1200);
  const welcome = await p.$('#welcome button');
  if (welcome) await welcome.tap();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `../shots/mob-${tag}-game.png` });
  await ctx.close();
}
await b.close();

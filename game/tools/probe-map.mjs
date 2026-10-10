import { chromium } from '@playwright/test';
// Map: open, pan and zoom with timing; screenshots at city, area and street zoom. VIEWPORT=mobile for a phone.
const mobile = process.env.VIEWPORT === 'mobile';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1100, height: 650 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?quality=low&hour=11&save=0&title=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(2000);
await p.keyboard.press('KeyM');
await p.waitForTimeout(800);
const tag = mobile ? 'm' : 'd';
await p.screenshot({ path: `../shots/map-${tag}-area.png` });
const box = await p.locator('#citymap canvas').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
// Pan: measure frame intervals during a drag.
const t0 = Date.now();
await p.mouse.move(cx, cy);
await p.mouse.down();
for (let k = 0; k < 30; k++) await p.mouse.move(cx + k * 8, cy + k * 4);
await p.mouse.up();
console.log('30-step pan took', Date.now() - t0, 'ms');
for (let k = 0; k < 4; k++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(150); }
await p.waitForTimeout(800);
await p.screenshot({ path: `../shots/map-${tag}-city.png` });
for (let k = 0; k < 9; k++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(150); }
await p.waitForTimeout(800);
await p.screenshot({ path: `../shots/map-${tag}-street.png` });
await b.close();

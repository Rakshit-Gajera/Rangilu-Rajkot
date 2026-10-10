import { chromium } from '@playwright/test';
// Title screen (forced on with ?title=1 despite automation): orbit shot, Gujarati toggle, Play.
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 560 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
await p.goto('http://localhost:5173/?shadows=0&quality=medium&spawn=default&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(8000);
await p.screenshot({ path: '../shots/96-title.png' });
await p.click('#t-lang');
await p.click('[data-shirt="12592959"]').catch(() => {});
await p.waitForTimeout(500);
await p.screenshot({ path: '../shots/97-title-gu.png' });
await p.click('#t-play');
await p.waitForTimeout(4000);
await p.screenshot({ path: '../shots/98-after-play.png' });
await b.close();

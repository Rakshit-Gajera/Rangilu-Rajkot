import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.goto('http://localhost:5173/?shadows=0&dynres=0&quality=high&hour=10&save=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(5000);
console.log(JSON.stringify(await p.evaluate(() => window.__game.bench())));
await b.close();

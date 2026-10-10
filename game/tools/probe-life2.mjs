import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5173/?shadows=0&date=2026-10-09&hour=10');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
await p.waitForTimeout(30000);
const ag = await p.evaluate(() => window.__game.agents());
const moving = ag.filter((a) => a.kind === 'vehicle' && a.v > 3);
console.log('agents', ag.length, 'moving vehicles', moving.length);
const a = moving[0];
// Camera 12 m behind and 5 m above the vehicle, looking ahead of it.
const bx = a.x - Math.sin(a.yaw) * 14, bn = a.n - Math.cos(a.yaw) * 14;
await p.evaluate(([cx, cy, cn, lx, ly, ln]) => window.__game.setView([cx, cy, -cn], [lx, ly, -ln], 10),
  [bx, a.y + 5, bn, a.x + Math.sin(a.yaw) * 10, a.y + 1, a.n + Math.cos(a.yaw) * 10]);
await p.waitForTimeout(1500);
await p.screenshot({ path: '../shots/52-traffic-follow.png' });
await b.close();

import { chromium } from '@playwright/test';
// Per-frame cost on a preset with traffic. Usage: node tools/probe-perf.mjs high
const q = process.argv[2] ?? 'high';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:5173/?quality=${q}&dynres=0&date=2026-10-09&hour=10`);
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
await p.waitForTimeout(25000);
const r = await p.evaluate(() => {
  const g = window.__game;
  const ft = g.frameTimes(); ft.sort((a, b) => a - b);
  return { life: g.life(), stats: g.stats(), worst: g.worst(), p50: ft[ft.length >> 1], p95: ft[Math.floor(ft.length * 0.95)], lifeMs: g.lifeMs?.() };
});
console.log(JSON.stringify(r, null, 1));
await b.close();

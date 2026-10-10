import { chromium } from '@playwright/test';
// Counts agents standing inside buildings near the player (a ray from above hits a roof).
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
await p.goto('http://localhost:5173/?shadows=0&quality=low&date=2026-10-09&hour=10');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 120000 });
for (const wait of [20000, 15000]) {
  await p.waitForTimeout(wait);
  const r = await p.evaluate(() => {
    const g = window.__game, pl = g.player();
    const out = { checked: 0, inside: [], kinds: g.life() };
    for (const a of g.agents()) {
      if (Math.hypot(a.x - pl[0], -a.n - pl[2]) > 200) continue;
      out.checked++;
      const top = g.ground(a.x, -a.n);
      if (top !== null && top > a.y + 2.2) out.inside.push([a.kind, Math.round(a.x), Math.round(a.n), +(top - a.y).toFixed(1)]);
    }
    return out;
  });
  console.log(JSON.stringify(r));
}
await b.close();

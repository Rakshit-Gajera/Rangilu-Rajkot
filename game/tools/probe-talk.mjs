import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 520 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5173/?quality=medium&dynres=0&hour=10&save=0&title=0');
await p.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
for (let k = 0; k < 15; k++) {
  await p.waitForTimeout(3000);
  const t = (await p.evaluate(() => window.__game.agents())).filter((a) => a.kind === 'ped' && a.talk > 1);
  if (t.length >= 2) {
    const a = t[0];
    await p.evaluate(([x, y, n, yaw]) => window.__game.setView([x + Math.sin(yaw + 1.6) * 5, y + 2, -(n + Math.cos(yaw + 1.6) * 5)], [x, y + 1.4, -n]), [a.x, a.y, a.n, a.yaw]);
    await p.waitForTimeout(3500);
    await p.screenshot({ path: '../shots/talk.png' });
    console.log('talkers', t.length);
    break;
  }
}
await b.close();

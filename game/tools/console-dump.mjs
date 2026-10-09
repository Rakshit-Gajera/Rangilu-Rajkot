import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const seen = new Set();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!seen.has(t.slice(0, 300))) { seen.add(t.slice(0, 300)); console.log('---', m.type(), t.slice(0, 2500)); } } });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(12000);
console.log(await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
await b.close();

#!/usr/bin/env node
// P7 — Mesure A/B ALTERNÉE (référence, courante, référence…) du premier affichage mobile (390 px, CPU ×4) :
// élimine l'effet de la charge du poste entre deux séries successives.
//   PLAYWRIGHT_CORE_DIR=… node tests/perf/accueil-ab-mobile.mjs <url-référence> <url-courante> [passages=7]
// P8 : PROFILE=desktop pour le même essai en 1366 × 900, sans ralentissement du processeur.
import { createRequire } from 'node:module';
import path from 'node:path';
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');
const urls = { 'référence': process.argv[2], 'courante': process.argv[3] };
const RUNS = Number(process.argv[4] || 7);
const desktop = process.env.PROFILE === 'desktop';
const browser = await pw.chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const res = { 'référence': [], 'courante': [] };
for (let i = 0; i < RUNS; i++) {
  for (const [label, url] of (i % 2 ? Object.entries(urls).reverse() : Object.entries(urls))) {
    const ctx = await browser.newContext(desktop ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.route(/googletagmanager|google-analytics|ipapi|fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (!desktop) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => { window.__lcp = null; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = { t: e.startTime, el: e.element ? `${e.element.tagName}.${String(e.element.className).slice(0, 30)}` : '?', size: e.size }; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => ({ fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0), lcp: Math.round(window.__lcp?.t ?? 0), el: window.__lcp?.el, size: window.__lcp?.size }));
    res[label].push(r);
    await ctx.close();
  }
}
await browser.close();
const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const [label, list] of Object.entries(res)) {
  console.log(`${label.padEnd(10)} FCP médiane ${med(list.map(r => r.fcp))} ms | LCP médiane ${med(list.map(r => r.lcp))} ms | LCP ${list.map(r => r.lcp).join('/')} | élément ${[...new Set(list.map(r => `${r.el} (${r.size})`))].join(', ')}`);
}

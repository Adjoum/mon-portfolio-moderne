#!/usr/bin/env node
// P7 — Banc de performance de l'accueil : version de référence contre version courante.
//   1. Construire chaque version : node node_modules/vite/bin/vite.js build --mode recette --outDir <dossier>
//      (référence : git worktree add <dossier hors dépôt> <commit>, node_modules relié par jonction)
//   2. Servir : vite preview --mode recette --outDir <dossier> --port 4173 (référence) / 4174 (courante)
//   3. PLAYWRIGHT_CORE_DIR=<dossier de playwright-core> node tests/perf/accueil.perf.mjs http://localhost:4173/ http://localhost:4174/ [passages]
// Mesures : LCP, CLS, TBT, FCP, octets JS et images (desktop 1366 ; mobile 390 à CPU ×4), puis coût du fil
// principal (CDP Performance.getMetrics) au repos et pendant 5 s de mouvement de souris. Chromium avec GPU,
// services tiers neutralisés, médiane des passages.
import { createRequire } from 'node:module';
import path from 'node:path';
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');
const [base, cur, runsArg] = process.argv.slice(2);
const RUNS = Number(runsArg || 3);
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, longTasks: [] };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
};

async function load(browser, url, { width, height, cpu, mobile }) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await context.route(/googletagmanager|google-analytics|ipapi|fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(OBSERVE);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const tbt = window.__perf.longTasks.filter(([s]) => s >= fcp).reduce((t, [, d]) => t + Math.max(0, d - 50), 0);
    const res = performance.getEntriesByType('resource');
    const kb = re => Math.round(res.filter(e => re.test(e.name) || re.test(e.initiatorType)).reduce((t, e) => t + (e.transferSize || e.encodedBodySize || 0), 0) / 1024);
    return { lcp: Math.round(window.__perf.lcp), cls: +window.__perf.cls.toFixed(3), tbt: Math.round(tbt), fcp: Math.round(fcp), js: kb(/\.m?js(\?|$)/), img: kb(/\.(png|jpe?g|webp|avif|gif|svg|mp4)(\?|$)/) };
  });
  return { ...r, context, page, cdp };
}

const metrics = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

async function profile(label, url) {
  const browser = await pw.chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const out = {};
  for (const [name, opts] of [['desktop 1366', { width: 1366, height: 900, cpu: 1, mobile: false }], ['mobile 390 (CPU ×4)', { width: 390, height: 844, cpu: 4, mobile: true }]]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await load(browser, url, opts);
      await r.context.close();
      runs.push(r);
    }
    out[name] = Object.fromEntries(['lcp', 'cls', 'tbt', 'fcp', 'js', 'img'].map(k => [k, median(runs.map(r => r[k]))]));
  }
  // Coût du fil principal : animation du Hero au repos (5 s) puis souris en mouvement (5 s)
  const idle = [], move = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await load(browser, url, { width: 1366, height: 900, cpu: 1, mobile: false });
    await r.cdp.send('Performance.enable');
    await r.page.mouse.move(683, 450);
    await r.page.waitForTimeout(1500);
    let a = await metrics(r.cdp);
    await r.page.waitForTimeout(5000);
    let b = await metrics(r.cdp);
    idle.push({ task: (b.TaskDuration - a.TaskDuration) * 1000, script: (b.ScriptDuration - a.ScriptDuration) * 1000, style: b.RecalcStyleCount - a.RecalcStyleCount, layout: b.LayoutCount - a.LayoutCount });
    a = await metrics(r.cdp);
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 5000) {
      const t = k++ / 30;
      await r.page.mouse.move(683 + 500 * Math.sin(t), 450 + 300 * Math.sin(t * 1.7));
    }
    b = await metrics(r.cdp);
    move.push({ events: k, task: (b.TaskDuration - a.TaskDuration) * 1000, script: (b.ScriptDuration - a.ScriptDuration) * 1000, style: b.RecalcStyleCount - a.RecalcStyleCount, layout: b.LayoutCount - a.LayoutCount });
    await r.context.close();
  }
  const med = list => Object.fromEntries(Object.keys(list[0]).map(k => [k, Math.round(median(list.map(x => x[k])))]));
  out['repos 5 s (fil principal, ms)'] = med(idle);
  out['souris 5 s (fil principal, ms)'] = med(move);
  await browser.close();
  console.log(`\n== ${label} (${url})`);
  for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(32)} ${JSON.stringify(v)}`);
}

await profile(process.env.BASE_LABEL || 'Référence', base);
await profile('Version courante', cur);

#!/usr/bin/env node
// P8.4 — Coût des scènes 3D de l'accueil sur un build de production.
//   1. node node_modules/vite/bin/vite.js build --mode recette --outDir <dossier>
//   2. vite preview --mode recette --outDir <dossier> --port 4174
//   3. PLAYWRIGHT_CORE_DIR=<dossier de playwright-core> node tests/perf/p8-3d.perf.mjs http://localhost:4174/ [passages]
// Pour chaque profil : JavaScript téléchargé au chargement puis en descendant, tâches longues au démarrage de
// la 3D, intervalle entre images et coût du fil principal scène à l'écran. Chromium avec GPU, services tiers
// neutralisés, médiane des passages. Le coût du GPU lui-même n'est pas mesuré ici.
import { createRequire } from 'node:module';
import path from 'node:path';

const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');
const [url, runsArg] = process.argv.slice(2);
const RUNS = Number(runsArg || 3);
const median = list => [...list].sort((a, b) => a - b)[list.length >> 1];

const PROFILES = [
  { name: 'desktop 1366', width: 1366, height: 900, cpu: 1, mobile: false, dpr: 1 },
  { name: 'tablette 820 (CPU ×2)', width: 820, height: 1100, cpu: 2, mobile: true, dpr: 2 },
  { name: 'mobile 390 (CPU ×4)', width: 390, height: 844, cpu: 4, mobile: true, dpr: 2 },
];

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, longTasks: [] };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  window.__frames = (ms) => new Promise(resolve => {
    const gaps = [];
    let last = performance.now();
    const start = last;
    const tick = now => {
      gaps.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(tick);
      else resolve(gaps);
    };
    requestAnimationFrame(tick);
  });
};

const kb = bytes => Math.round(bytes / 1024);
const jsBytes = page => page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\.m?js(\?|$)/.test(e.name)).reduce((t, e) => t + (e.transferSize || e.encodedBodySize || 0), 0));
const metrics = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

async function sceneCost(page, cdp, selector, sectionSelector) {
  await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const t0 = await page.evaluate(() => performance.now());
  const live = await page.waitForFunction(sel => document.querySelector(sel)?.dataset.mode === 'live', sectionSelector, { timeout: 15_000 }).then(() => true).catch(() => false);
  const t1 = await page.evaluate(() => performance.now());
  if (!live) return { actif: false, mode: await page.locator(sectionSelector).getAttribute('data-mode') };
  await page.waitForTimeout(1500);
  const before = await metrics(cdp);
  const gaps = await page.evaluate(() => window.__frames(4000));
  const after = await metrics(cdp);
  const start = await page.evaluate(([a, b]) => window.__perf.longTasks.filter(([s]) => s >= a - 200 && s <= b + 200).map(([, d]) => Math.round(d)), [t0, t1]);
  return {
    actif: true,
    'démarrage ms': Math.round(t1 - t0),
    'tâches longues au démarrage ms': start.length ? Math.max(...start) : 0,
    'image médiane ms': +median(gaps).toFixed(1),
    'image p95 ms': +[...gaps].sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)].toFixed(1),
    'fil principal %': +(((after.TaskDuration - before.TaskDuration) / 4) * 100).toFixed(1),
  };
}

async function run(browser, profile) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, isMobile: profile.mobile, hasTouch: profile.mobile, deviceScaleFactor: profile.dpr });
  await context.route(/googletagmanager|google-analytics|ipapi|fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Performance.enable');
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await page.addInitScript(OBSERVE);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const first = await page.evaluate(() => ({ lcp: Math.round(window.__perf.lcp), cls: +window.__perf.cls.toFixed(4) }));
  const loaded = await jsBytes(page);
  await page.waitForTimeout(3500);
  const idle = await jsBytes(page);
  const cylinder = await page.locator('.hc-stage').count() ? await sceneCost(page, cdp, '.hc-stage', '.hc-root') : { actif: false, mode: 'carrousel' };
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(400);
  }
  const globe = await sceneCost(page, cdp, '.gl-stage', '.gl-section');
  const full = await jsBytes(page);
  const cls = await page.evaluate(() => +window.__perf.cls.toFixed(4));
  await context.close();
  return { first, loaded, idle, full, cylinder, globe, cls };
}

const browser = await pw.chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const profile of PROFILES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await run(browser, profile));
  const pick = key => runs[0][key].actif === false ? runs[0][key] : Object.fromEntries(Object.keys(runs[0][key]).map(k => [k, typeof runs[0][key][k] === 'number' ? median(runs.filter(r => r[key].actif).map(r => r[key][k])) : runs[0][key][k]]));
  console.log(`\n== ${profile.name}`);
  console.log(`LCP ${median(runs.map(r => r.first.lcp))} ms, CLS au chargement ${median(runs.map(r => r.first.cls))}, CLS page entière ${median(runs.map(r => r.cls))}`);
  console.log(`JavaScript : ${kb(median(runs.map(r => r.loaded)))} Ko au chargement, ${kb(median(runs.map(r => r.idle)))} Ko après 4 s, ${kb(median(runs.map(r => r.full)))} Ko page parcourue`);
  console.log(`Cylindre : ${JSON.stringify(pick('cylinder'))}`);
  console.log(`Globe : ${JSON.stringify(pick('globe'))}`);
}
await browser.close();

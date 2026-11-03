#!/usr/bin/env node
// P8.3 — Génère src/assets/globe/globe-poster.webp : image du vrai globe, sur fond transparent.
// Affichée avant la 3D, et à sa place si le mouvement est réduit ou l'appareil modeste.
//
//   PLAYWRIGHT_CORE_DIR=<dossier de playwright-core> node scripts/capture-globe-poster.mjs [adresse]
//
// À relancer si l'aspect du globe change. Nécessite ffmpeg (libwebp) et Vite en marche.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');
const url = process.argv[2] || 'http://localhost:5173/';
const SIZE = 900;

const browser = await pw.chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
// Disque de 660 px à 1440 px de large : l'échelle donne directement l'image finale, sans rééchantillonnage
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SIZE / 660 });
await page.route(/ipapi\.co|googletagmanager\.com|google-analytics\.com/, r => r.fulfill({ status: 200, body: '' }));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.locator('.gl-section').scrollIntoViewIfNeeded({ timeout: 20000 });
await page.waitForFunction(() => document.querySelector('.gl-section')?.dataset.mode === 'live', null, { timeout: 30000 });
await page.waitForTimeout(1400);
// Seul le globe reste : tout le reste de la page, fonds compris, devient transparent
await page.addStyleTag({ content: `
  html, body, #root, #root * { background: transparent !important; box-shadow: none !important; }
  body * { visibility: hidden !important; }
  .gl-stage, .gl-stage * { visibility: visible !important; }
  .gl-poster { display: none !important; }
` });
const tmp = path.join(os.tmpdir(), `globe-poster-${process.pid}.png`);
const box = await page.locator('.gl-stage').boundingBox();
if (Math.round(box.width) !== 660) throw new Error(`Disque de ${box.width} px : ajuster SIZE / 660`);
await page.locator('.gl-stage').screenshot({ path: tmp, omitBackground: true });
await browser.close();

const out = path.join(ROOT, 'src/assets/globe/globe-poster.webp');
fs.mkdirSync(path.dirname(out), { recursive: true });
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', `scale=${SIZE}:${SIZE}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', out], { encoding: 'utf8' });
fs.rmSync(tmp, { force: true });
if (r.status !== 0) throw new Error(r.stderr);
console.log(`${path.relative(ROOT, out)} : ${(fs.statSync(out).size / 1024).toFixed(1)} Ko`);

#!/usr/bin/env node
// Parcours navigateur du studio LaTeX, sur la recette locale en marche (npm run recette:up).
//
//   PLAYWRIGHT_CORE_DIR=<dossier contenant node_modules/playwright-core> node tests/e2e/latex-studio.e2e.mjs [scénario…]
//
// Navigateurs de Playwright (Chromium, WebKit) déjà installés sur le poste ; aucune dépendance ajoutée au projet.
// Les fonctionnalités IA sont SIMULÉES par interception réseau : aucun appel à un fournisseur, aucun coût.
// Les compilations passent par la vraie chaîne API → latex-runner, avec une adresse fictive
// (198.18.0.0/15) : les quotas de votre navigateur ne sont pas consommés.
// Captures d'écran : secrets/recette/e2e (ignoré par Git).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = process.env.RECETTE_WEB || 'http://localhost:5173';
const OUT = path.join(ROOT, 'secrets', 'recette', 'e2e');
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.PLAYWRIGHT_CORE_DIR) {
  console.error('PLAYWRIGHT_CORE_DIR requis (dossier contenant node_modules/playwright-core)');
  process.exit(2);
}
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');

let failures = 0;
export function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
}

export const BROKEN = ['\\documentclass{article}', '\\usepackage[utf8]{inputenc}', '\\begin{document}', 'Awa Konan', '\\textbfz{Data Analyst}', '\\end{document}'].join('\n');

/** Toutes les fonctionnalités IA annoncées disponibles (la disponibilité réelle dépend de vos affectations) */
const FEATURES = ['latex.generate', 'latex.improve', 'latex.fix', 'latex.import.structure', 'latex.import.ocr', 'latex.rewrite'];

export async function newStudio(browser, { width = 1366, height = 900, draft, ai = {}, mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    extraHTTPHeaders: { 'X-Forwarded-For': `198.18.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 254)}` },
  });
  const page = await context.newPage();
  const calls = [];
  // Monaco (CDN) bloqué : zone de texte, déterministe et lisible par le test
  await page.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await page.route('**/api/ai/features', r => r.fulfill({ json: { features: FEATURES.map(id => ({ id, available: true })) } }));
  await page.route('**/api/ai/run/**', async route => {
    const feature = route.request().url().split('/api/ai/run/')[1];
    const body = JSON.parse(route.request().postData() ?? '{}');
    calls.push({ feature, input: body.input });
    const handler = ai[feature];
    if (!handler) return route.fulfill({ status: 503, json: { code: 'AI_FEATURE_UNAVAILABLE', error: 'indisponible' } });
    const content = await handler(body.input, calls.filter(c => c.feature === feature).length);
    return route.fulfill({ json: { content: typeof content === 'string' ? content : JSON.stringify(content), requestId: 'e2e' } });
  });
  await page.addInitScript(([d]) => {
    if (sessionStorage.getItem('e2e-init')) return;
    sessionStorage.clear();
    sessionStorage.setItem('e2e-init', '1');
    if (d !== null) sessionStorage.setItem('latex-studio:draft', JSON.stringify(d));
  }, [draft ?? null]);
  await page.goto(`${WEB}/latex-cv-editor`);
  return { context, page, calls };
}

export const status = page => page.getByRole('status').filter({ hasText: /PDF prêt|Erreur|Compilation|Modifié|En attente|indisponible|Limite/ }).first();
export const codeArea = page => page.getByLabel('Code LaTeX du CV').first();

async function p1(browser) {
  console.log('\n▶ P1 — Correction intelligente des erreurs LaTeX (IA simulée)');
  const fixed = { edits: [{ start: 5, end: 5, replacement: '\\textbf{Data Analyst}' }], explanation: 'La commande \\textbfz n’existe pas : remplacée par \\textbf.' };
  const { context, page, calls } = await newStudio(browser, { draft: BROKEN, ai: { 'latex.fix': () => fixed } });

  const alert = page.getByRole('alert').filter({ hasText: 'Undefined control sequence' });
  await alert.waitFor({ timeout: 30_000 });
  check('erreur de compilation affichée, ligne 5 indiquée', await alert.getByRole('button', { name: 'Ligne 5' }).isVisible());
  const text = await alert.innerText();
  check('message sans chemin interne ni version', !/\/usr\/|\/work\/|texlive|TeX Live/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'p1-erreur.png') });

  await alert.getByRole('button', { name: 'Corriger l’erreur avec l’IA' }).click();
  const dialog = page.getByRole('dialog', { name: /Correction proposée/ });
  await dialog.waitFor();
  check('proposition affichée avant application (ligne retirée et ajoutée)', (await dialog.innerText()).includes('\\textbfz{Data Analyst}') && (await dialog.innerText()).includes('\\textbf{Data Analyst}'));
  const sent = calls.find(c => c.feature === 'latex.fix')?.input;
  check('envoyé au serveur : code, erreurs avec numéro de ligne, tentative 1', sent?.code === BROKEN && sent?.errors?.[0]?.line === 5 && sent?.attempt === 1);
  check('aucun changement avant acceptation', (await codeArea(page).inputValue()) === BROKEN);
  await page.screenshot({ path: path.join(OUT, 'p1-proposition.png') });

  await dialog.getByRole('button', { name: 'Accepter et compiler' }).click();
  await page.getByText('PDF prêt').waitFor({ timeout: 30_000 });
  check('après acceptation : code corrigé, compilation sécurisée réussie', (await codeArea(page).inputValue()).includes('\\textbf{Data Analyst}'));
  await page.locator('img[alt="Page 1 du CV"]').waitFor();
  check('aperçu PDF affiché', await page.locator('img[alt="Page 1 du CV"]').isVisible());

  await page.getByRole('button', { name: /Précédente/ }).first().click();
  await alert.waitFor({ timeout: 30_000 });
  check('retour à la version précédente : code d’origine restauré', (await codeArea(page).inputValue()) === BROKEN);
  await context.close();

  // Deux tentatives au plus, chacune déclenchée par l'utilisateur
  const useless = { edits: [{ start: 4, end: 4, replacement: 'Awa KONAN' }], explanation: 'Essai.' };
  const second = await newStudio(browser, { draft: BROKEN, ai: { 'latex.fix': () => useless } });
  const alert2 = second.page.getByRole('alert').filter({ hasText: 'Undefined control sequence' });
  for (const attempt of [1, 2]) {
    await alert2.waitFor({ timeout: 30_000 });
    await alert2.getByRole('button', { name: attempt === 1 ? 'Corriger l’erreur avec l’IA' : /Nouvelle tentative de correction/ }).click();
    await second.page.getByRole('dialog').getByRole('button', { name: 'Accepter et compiler' }).click();
    await second.page.waitForTimeout(500);
  }
  await alert2.getByText('Deux corrections automatiques ont été tentées').waitFor({ timeout: 30_000 });
  check('deux tentatives au maximum, puis plus de bouton (aucune boucle)', !(await alert2.getByRole('button', { name: /Corriger|Nouvelle tentative/ }).count()));
  check('tentatives envoyées : 1 puis 2', second.calls.filter(c => c.feature === 'latex.fix').map(c => c.input.attempt).join(',') === '1,2');
  await second.context.close();
}

const SCENARIOS = { p1 };

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
const browser = await pw.chromium.launch();
try {
  for (const name of selected) await SCENARIOS[name](browser);
} catch (err) {
  failures++;
  console.error(`✗ arrêt : ${err.message.split('\n')[0]}`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} contrôle(s) en échec` : '\nTous les contrôles sont réussis. Aucun appel à un fournisseur IA.');
process.exitCode = failures ? 1 : 0;

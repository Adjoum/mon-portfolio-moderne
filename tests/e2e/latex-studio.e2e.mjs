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

export async function newStudio(browser, { width = 1366, height = 900, draft, ai = {}, mobile = false, session = {} } = {}) {
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
  await page.addInitScript(([d, extra]) => {
    if (sessionStorage.getItem('e2e-init')) return;
    sessionStorage.clear();
    sessionStorage.setItem('e2e-init', '1');
    if (d !== null) sessionStorage.setItem('latex-studio:draft', JSON.stringify(d));
    for (const [key, value] of Object.entries(extra)) sessionStorage.setItem(key, JSON.stringify(value));
  }, [draft ?? null, session]);
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

  await page.getByRole('button', { name: /précédente/i }).first().click();
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

const FIXTURES = path.join(ROOT, 'tests', 'extract', 'fixtures');
const IMPORTED = {
  identity: { fullName: 'Awa Konan', headline: 'Data Analyst', email: 'awa.konan@exemple.ci', phone: '', location: 'Abidjan', links: [] },
  summary: 'Analyste de données en santé publique.',
  experiences: [{ id: 'e1', role: 'Data Analyst', organization: 'Institut fictif de santé', location: 'Abidjan', start: '2023', end: 'aujourd’hui', bullets: ['Tableaux de bord Power BI pour 12 districts sanitaires', 'Automatisation des rapports hebdomadaires'] }],
  education: [{ id: 'd1', degree: 'Master Big Data', institution: 'Université fictive', location: '', start: '', end: '2022', details: '' }],
  skills: [{ id: 's1', category: 'Données', items: ['Python', 'SQL', 'Power BI'] }],
  projects: [], languages: [{ name: 'Français', level: 'natif' }], certifications: [], publications: [], interests: [],
};

async function p2(browser) {
  console.log('\n▶ P2 — Import et reconstruction d’un CV (extraction réelle isolée, IA simulée)');
  const rewritten = JSON.parse(JSON.stringify(IMPORTED));
  rewritten.summary = 'Analyste de données orientée santé publique et aide à la décision.'
  rewritten.experiences[0].bullets = ['Conception de tableaux de bord Power BI pour 12 districts sanitaires', 'Automatisation des rapports hebdomadaires de suivi'];
  const { context, page, calls } = await newStudio(browser, {
    ai: {
      'latex.import.structure': () => IMPORTED,
      'latex.import.ocr': () => 'AWA KONAN\nData Analyst',
      'latex.rewrite': () => ({ cv: rewritten, flags: [{ path: 'experiences.e1.bullets[1]', reason: 'number' }], suggestions: ['Ajoutez vos certifications si vous en avez.'] }),
    },
  });
  await page.getByRole('tab', { name: /Importer/ }).click();
  const input = page.locator('input[type=file][accept*=".docx"]');

  // DOCX : extraction par cv-extractor via l'API, puis structuration (simulée)
  await input.setInputFiles(path.join(FIXTURES, 'cv.docx'));
  await page.getByRole('tab', { name: /Données/, selected: true }).waitFor({ timeout: 30_000 });
  const structure = calls.find(c => c.feature === 'latex.import.structure')?.input;
  check('DOCX extrait dans l’environnement isolé, texte transmis à la structuration', /Awa Konan/.test(structure?.text ?? '') && /12 districts/.test(structure?.text ?? ''));
  check('données importées présentées pour vérification', (await page.getByLabel('Nom complet').inputValue()) === 'Awa Konan');
  check('aucun nom de fichier transmis à l’IA', !JSON.stringify(calls).includes('cv.docx'));

  // Réécriture ciblée : organisme obligatoire
  const rewriteButton = page.getByRole('button', { name: /Réécriture professionnelle/ });
  check('réécriture impossible sans organisme visé', await rewriteButton.isDisabled());
  await page.getByLabel(/Organisme ou institution/).first().fill('Organisation mondiale fictive');
  await page.getByLabel(/Poste visé/).first().fill('Data Scientist');
  await rewriteButton.click();
  const dialog = page.getByRole('dialog', { name: /Réécriture proposée/ });
  await dialog.waitFor();
  check('modifications présentées avant / après, propositions chiffrées écartées signalées', (await dialog.innerText()).includes('aide à la décision') && /chiffre absent/.test(await dialog.innerText()));
  const sent = calls.find(c => c.feature === 'latex.rewrite')?.input;
  check('cible transmise : organisme et poste', sent?.target?.organization === 'Organisation mondiale fictive' && sent?.target?.role === 'Data Scientist');
  await page.screenshot({ path: path.join(OUT, 'p2-reecriture.png') });
  await dialog.getByRole('button', { name: /Appliquer/ }).click();

  // Génération depuis le modèle choisi, compilation réelle
  await page.getByRole('button', { name: /Générer le CV avec le modèle/ }).click();
  await page.getByText('PDF prêt').waitFor({ timeout: 30_000 });
  const code = await codeArea(page).inputValue();
  check('code LaTeX généré à partir des données (texte reformulé accepté)', code.includes('Awa Konan') && code.includes('aide à la décision'));
  check('aucune coordonnée inventée dans le code', !/XX XX|00 00 00|votreemail/.test(code));
  await page.locator('img[alt="Page 1 du CV"]').waitFor();
  await page.screenshot({ path: path.join(OUT, 'p2-cv-genere.png') });

  // Fichier à macros refusé ; image lue par l'IA (capacité visuelle annoncée)
  await page.getByRole('tab', { name: /Importer/ }).click();
  await input.setInputFiles(path.join(FIXTURES, 'cv-macro.docx'));
  await page.getByRole('alert').filter({ hasText: 'macros' }).waitFor({ timeout: 30_000 });
  check('DOCX à macros refusé avec un message clair', true);
  await input.setInputFiles(path.join(FIXTURES, 'cv-image.jpg'));
  await page.getByRole('tab', { name: /Données/, selected: true }).waitFor({ timeout: 30_000 });
  const ocr = calls.filter(c => c.feature === 'latex.import.ocr');
  check('image réencodée en JPEG puis lue par l’IA', ocr.length === 1 && /^data:image\/jpeg;base64,/.test(ocr[0].input.image));
  await context.close();
}

async function p3(browser) {
  console.log('\n▶ P3 — Modèles premium et contrôle qualité (compilation réelle)');
  const { context, page } = await newStudio(browser);
  await page.getByRole('tab', { name: /Modèles/ }).click();
  const thumbs = page.getByRole('list', { name: 'Modèles de CV' }).getByRole('button');
  check('huit modèles avec miniature', (await thumbs.count()) === 8 && (await page.locator('ul[aria-label="Modèles de CV"] img').evaluateAll(imgs => imgs.every(i => i.naturalWidth > 0))));
  for (const name of ['Software Architect', 'Minimal ATS Pro']) {
    await thumbs.filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Générer le CV avec ce modèle' }).click();
    await page.getByText('PDF prêt').waitFor({ timeout: 30_000 });
    const report = page.getByText(/Contrôle qualité/).first();
    await report.waitFor({ timeout: 15_000 });
    const text = await report.innerText();
    check(`${name} : compilé, contrôle qualité affiché (« ${text.slice(0, 60)} »)`, /Contrôle qualité/.test(text));
  }
  check('modèle ATS : pas d’option photo', (await page.getByLabel('Emplacement pour la photo').count()) === 0);
  await page.locator('summary', { hasText: 'Contrôle qualité' }).click();
  check('textes d’exemple signalés par le contrôle qualité', await page.getByText(/Contenu d’exemple ou fictif encore présent/).first().isVisible());
  await page.screenshot({ path: path.join(OUT, 'p3-modeles.png') });
  await context.close();
}

// ── P4 : Mes CV ──────────────────────────────────────────────
const STACK = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'secrets/recette/stack.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const GATEWAY = 'http://127.0.0.1:58521';
const { spawnSync } = await import('node:child_process');
const sql = q => spawnSync('docker', ['exec', 'recette-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', q], { encoding: 'utf8' }).stdout.trim();

function totp(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = crypto.createHmac('sha1', key).update(counter).digest();
  const o = mac[mac.length - 1] & 0xf;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

/** Administrateur TEMPORAIRE avec MFA ; renvoie sa session (jamais votre compte) */
async function temporaryAdmin() {
  const email = `p4-e2e-${crypto.randomUUID()}@recette.test`;
  const password = crypto.randomBytes(16).toString('hex');
  const adminApi = (p, init) => fetch(`${GATEWAY}/auth/v1${p}`, { ...init, headers: { apikey: STACK.RECETTE_SERVICE_KEY, Authorization: `Bearer ${STACK.RECETTE_SERVICE_KEY}`, 'Content-Type': 'application/json' } }).then(r => r.json());
  const authApi = (p, token, body) => fetch(`${GATEWAY}/auth/v1${p}`, { method: 'POST', headers: { apikey: STACK.RECETTE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const user = await adminApi('/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  sql(`insert into public.admin_users (user_id, email) values ('${user.id}', '${email}');`);
  const aal1 = await authApi('/token?grant_type=password', STACK.RECETTE_ANON_KEY, { email, password });
  const factor = await authApi('/factors', aal1.access_token, { factor_type: 'totp', friendly_name: 'e2e' });
  const challenge = await authApi(`/factors/${factor.id}/challenge`, aal1.access_token, {});
  const session = await authApi(`/factors/${factor.id}/verify`, aal1.access_token, { challenge_id: challenge.id, code: totp(factor.totp.secret) });
  return { id: user.id, session, remove: () => adminApi(`/admin/users/${user.id}`, { method: 'DELETE', body: '{}' }) };
}

async function saveAndManage(page, label) {
  await page.getByText('PDF prêt').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '💾 Enregistrer' }).click();
  const save = page.getByRole('dialog', { name: /Enregistrer dans Mes CV/ });
  check(`${label} : enregistrement impossible sans accord explicite`, await save.getByRole('button', { name: 'Enregistrer' }).isDisabled());
  await save.getByLabel('Titre').fill('CV recette P4');
  await save.getByRole('checkbox').check();
  await save.getByRole('button', { name: 'Enregistrer' }).click();
  await save.waitFor({ state: 'detached', timeout: 15_000 });
  await page.getByRole('button', { name: '🗂 Mes CV' }).click();
  const list = page.getByRole('dialog', { name: 'Mes CV' });
  await list.getByText('CV recette P4').waitFor({ timeout: 15_000 });
  const mode = label === 'serveur' ? 'Espace privé : ces CV ne sont visibles que par vous.' : 'CV conservés dans ce navigateur, sur cet appareil uniquement.';
  check(`${label} : CV retrouvé dans Mes CV, mode attendu affiché`, await list.getByText(mode).isVisible());
  await list.getByRole('button', { name: '👁 Aperçu' }).click();
  await page.getByRole('dialog', { name: /Aperçu — CV recette P4/ }).locator('img[alt="Page 1 du CV"]').waitFor({ timeout: 15_000 });
  check(`${label} : aperçu du PDF enregistré`, true);
  await page.getByRole('dialog', { name: /Aperçu — CV recette P4/ }).getByRole('button', { name: 'Fermer' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), list.getByRole('button', { name: '⬇ PDF' }).click()]);
  const file = path.join(OUT, `p4-${label}.pdf`);
  await download.saveAs(file);
  check(`${label} : PDF téléchargé (${download.suggestedFilename()})`, fs.readFileSync(file).subarray(0, 5).toString() === '%PDF-');
  await list.getByRole('button', { name: '🗑 Supprimer' }).click();
  await list.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await list.getByText('Aucun CV enregistré').waitFor({ timeout: 15_000 });
  check(`${label} : CV supprimé`, true);
  await page.screenshot({ path: path.join(OUT, `p4-${label}.png`) });
  await list.getByRole('button', { name: 'Fermer' }).click();
}

async function p4(browser) {
  console.log('\n▶ P4 — Mes CV : appareil (visiteur), espace privé serveur (administrateur avec MFA)');
  const visitor = await newStudio(browser);
  await saveAndManage(visitor.page, 'appareil');
  check('visiteur : aucune requête vers le stockage Supabase', !(await visitor.page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/storage/v1/')))));
  await visitor.context.close();

  const admin = await temporaryAdmin();
  try {
    const host = 'localhost';
    const ctx = await newStudio(browser, {});
    await ctx.page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${host}-auth-token`, JSON.stringify({ ...admin.session, expires_at: Math.floor(Date.now() / 1000) + admin.session.expires_in })]);
    await ctx.page.reload();
    await saveAndManage(ctx.page, 'serveur');
    check('serveur : plus aucun fichier ni document après suppression',
      sql(`select (select count(*) from storage.objects where bucket_id = 'cv-private' and name like '${admin.id}/%') + (select count(*) from public.cv_documents where owner_id = '${admin.id}');`) === '0');
    await ctx.context.close();
  } finally {
    await admin.remove();
  }
}

// ── P5 : responsive, ergonomie, accessibilité ────────────────
const WIDTHS = [320, 375, 390, 768, 1024, 1366, 1920];

/** Éléments qui dépassent du viewport horizontalement, et défilement horizontal de la page */
const overflow = page => page.evaluate(() => {
  const w = window.innerWidth;
  const out = [...document.querySelectorAll('header *, nav *, [role="tablist"] *, [role="dialog"] *')]
    .filter(el => el.offsetParent !== null && !el.closest('.overflow-auto, .overflow-x-auto, figure, details:not([open]) > :not(summary)'))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.right > w + 1 || r.left < -1))
    .map(({ el }) => `${el.tagName.toLowerCase()} « ${(el.textContent ?? '').trim().slice(0, 20)} »`);
  return { scroll: document.documentElement.scrollWidth - w, out: [...new Set(out)].slice(0, 5) };
});

/** Boutons visibles sans nom accessible, images sans texte alternatif, cibles tactiles trop petites */
const a11y = (page, touch) => page.evaluate(min => {
  const visible = el => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const unnamed = [...document.querySelectorAll('button, a[href], [role="tab"], summary')].filter(visible)
    .filter(el => !(el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title'))).length;
  const noAlt = [...document.querySelectorAll('img')].filter(visible).filter(i => !i.hasAttribute('alt')).length;
  const small = min ? [...document.querySelectorAll('header button, header summary, nav button, [role="tab"]')].filter(visible)
    .filter(el => el.getBoundingClientRect().height < min - 0.5).map(el => (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 15)) : [];
  return { unnamed, noAlt, small };
}, touch ? 44 : 0);

/** Barres d'outils visibles dont le contenu déborde (boutons coupés ou à faire défiler) */
const clippedBars = page => page.evaluate(() => [...document.querySelectorAll('[role="toolbar"], header')]
  .filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0)
  .map(el => ({ name: el.getAttribute('aria-label') ?? el.tagName, scroll: el.scrollWidth - el.clientWidth }))
  .filter(b => b.scroll > 1));

async function p5(browser, engine = 'chromium') {
  console.log(`\n▶ P5 — Responsive (${engine}) : ${WIDTHS.join(', ')} px`);
  for (const width of WIDTHS) {
    const mobile = width < 768;
    const { context, page } = await newStudio(browser, { width, height: mobile ? 760 : 900, mobile });
    await page.getByText('PDF prêt').waitFor({ timeout: 45_000 });
    const o = await overflow(page);
    const a = await a11y(page, mobile);
    check(`${width} px : aucun défilement ni élément coupé horizontalement`, o.scroll <= 1 && !o.out.length, o.out.join(', ') || (o.scroll > 1 ? `défilement ${o.scroll} px` : ''));
    check(`${width} px : noms accessibles, textes alternatifs${mobile ? ', cibles tactiles ≥ 44 px' : ''}`, !a.unnamed && !a.noAlt && !a.small.length, JSON.stringify(a));
    const bars = await clippedBars(page);
    check(`${width} px : en-tête et barres d’outils sans débordement`, !bars.length, JSON.stringify(bars));
    await page.screenshot({ path: path.join(OUT, `p5-${engine}-${width}.png`) });

    if (mobile) {
      const nav = page.getByRole('navigation', { name: 'Sections du studio' });
      await nav.getByRole('button', { name: /Code/ }).click();
      await codeArea(page).fill(`${await codeArea(page).inputValue()}\n% modification conservée`);
      await nav.getByRole('button', { name: /Aperçu/ }).click();
      await page.locator('img[alt="Page 1 du CV"]').waitFor({ timeout: 30_000 });
      const previewBox = await page.locator('img[alt="Page 1 du CV"]').boundingBox();
      await page.screenshot({ path: path.join(OUT, `p5-${engine}-${width}-apercu.png`) });
      check(`${width} px : aperçu PDF lisible sur toute la largeur`, !!previewBox && previewBox.width >= width * 0.8, previewBox ? `${Math.round(previewBox.width)} px` : 'absent');
      const previewBars = await clippedBars(page);
      check(`${width} px : barre de l’aperçu sans débordement`, !previewBars.length, JSON.stringify(previewBars));
      await nav.getByRole('button', { name: /Informations/ }).click();
      await page.getByRole('tab', { name: /Modèles/ }).waitFor();
      await nav.getByRole('button', { name: /Code/ }).click();
      check(`${width} px : travail conservé en changeant d’onglet`, (await codeArea(page).inputValue()).includes('% modification conservée'));
      await page.getByLabel('Plus d’actions').click();
      const menuBox = await page.getByRole('button', { name: '🗂 Mes CV' }).boundingBox();
      check(`${width} px : menu « ⋯ » entièrement visible`, !!menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width, menuBox ? `${Math.round(menuBox.x)} → ${Math.round(menuBox.x + menuBox.width)} px` : 'absent');
      await page.getByRole('button', { name: '🗂 Mes CV' }).click();
      const box = await page.getByRole('dialog', { name: 'Mes CV' }).boundingBox();
      check(`${width} px : fenêtre « Mes CV » en plein écran`, !!box && Math.abs(box.width - width) <= 1, box ? `${Math.round(box.width)} px` : 'absente');
      await page.keyboard.press('Escape');
      check(`${width} px : fermeture au clavier (Échap), menu refermé`, (await page.getByRole('dialog').count()) === 0 && !(await page.locator('header details[open]').count()));
    } else if (width < 1024) {
      await page.getByRole('radio', { name: 'Aperçu' }).click();
      await page.locator('img[alt="Page 1 du CV"]').waitFor({ timeout: 30_000 });
      await page.screenshot({ path: path.join(OUT, `p5-${engine}-${width}-apercu.png`) });
      check(`${width} px : vue « Aperçu » seule (éditeur masqué, contenu conservé)`, !(await codeArea(page).isVisible()));
      await page.getByRole('button', { name: '☰ Outils' }).click();
      const drawer = page.getByRole('dialog', { name: 'Outils' });
      check(`${width} px : outils dans un tiroir`, await drawer.getByRole('tab', { name: /Données/ }).isVisible());
      check(`${width} px : focus placé dans le tiroir`, await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
      await page.keyboard.press('Escape');
      check(`${width} px : tiroir fermé au clavier (Échap), focus rendu au bouton`, !(await drawer.count()) && await page.evaluate(() => document.activeElement?.textContent?.includes('Outils') ?? false));
    } else {
      const pageImg = page.locator('img[alt="Page 1 du CV"]');
      await pageImg.waitFor({ timeout: 30_000 });
      const preview = await pageImg.boundingBox();
      await page.screenshot({ path: path.join(OUT, `p5-${engine}-${width}-apercu.png`) });
      check(`${width} px : outils, code et aperçu côte à côte`, (await page.getByRole('complementary', { name: 'Outils' }).isVisible()) && (await codeArea(page).isVisible()) && !!preview && preview.width >= 300, preview ? `aperçu ${Math.round(preview.width)} px` : 'aperçu absent');
      const sep = page.getByRole('separator', { name: 'Partage entre code et aperçu' });
      const before = Number(await sep.getAttribute('aria-valuenow'));
      await sep.focus();
      await page.keyboard.press('ArrowRight');
      check(`${width} px : panneaux redimensionnables au clavier`, Number(await sep.getAttribute('aria-valuenow')) > before);
      await page.getByRole('tab', { selected: true }).focus();
      await page.keyboard.press('ArrowRight');
      const focused = await page.evaluate(() => ({ role: document.activeElement?.getAttribute('role'), selected: document.activeElement?.getAttribute('aria-selected'), text: document.activeElement?.textContent?.trim() }));
      await page.keyboard.press('End');
      const last = await page.getByRole('tab', { selected: true }).textContent();
      check(`${width} px : onglets d’outils au clavier (flèches, Fin)`, focused.role === 'tab' && focused.selected === 'true' && /Design/.test(focused.text ?? '') && /Versions/.test(last ?? ''), JSON.stringify(focused));

      if (width === 1366) {
        // Confirmations : remplacement du code annulable, effacement de la session en deux temps
        await page.getByRole('button', { name: '🧹 Effacer toutes les données de cette session' }).click();
        const confirmBox = page.getByRole('group', { name: 'Confirmer l’effacement' });
        check('effacement de la session : confirmation demandée, focus sur « Annuler »', await confirmBox.isVisible() && await page.evaluate(() => document.activeElement?.textContent === 'Annuler'));
        await confirmBox.getByRole('button', { name: 'Annuler' }).click();
        await codeArea(page).fill(`${await codeArea(page).inputValue()}\n% repère avant modèle`);
        await page.getByRole('tab', { name: /Données/ }).click();
        await page.getByRole('button', { name: /Générer le CV avec le modèle/ }).click();
        const toast = page.getByRole('status').filter({ hasText: 'CV généré avec le modèle.' });
        await toast.waitFor({ timeout: 5_000 });
        check('modèle appliqué : confirmation affichée, code remplacé', !(await codeArea(page).inputValue()).includes('% repère avant modèle'));
        await toast.getByRole('button', { name: '↶ Annuler' }).click();
        check('« Annuler » rétablit le code précédent', (await codeArea(page).inputValue()).includes('% repère avant modèle') && !(await toast.count()));
      }
    }
    await context.close();
  }
}

// ── Phase avancée, P2 : changement de modèle dynamique ───────
/** Signature de chaque modèle dans le code (macro de section) */
const SIGNATURES = {
  'Silicon Valley Engineer': 'textls[60]', 'Executive Prestige': 'textls[110]', 'AI & Data Scientist': 'rule[-0.5pt]{7pt}{7pt}',
  'Software Architect': 'textls[50]', 'Healthcare & Research': '\\setlength{\\cvrulewidth}{0.8pt}', 'Minimal ATS Pro': '\\colorlet{cvrule}{black}',
  'Modern Creative': 'rule[-1.5pt]{3pt}{12pt}', 'Academic Research': 'textls[40]',
};

async function v2p2(browser) {
  console.log('\n▶ Phase avancée P2 — Changement de modèle : code et PDF régénérés depuis les données (compilation réelle)');
  const { context, page, calls } = await newStudio(browser, { session: { 'latex-studio:cv': IMPORTED } });
  const compiles = [];
  page.on('request', r => { if (r.url().includes('/api/cv/compile') && r.method() === 'POST') compiles.push(r.postData() ?? ''); });
  const pdfImage = page.locator('img[alt="Page 1 du CV"]');
  const ready = async () => {
    await page.getByRole('status').filter({ hasText: 'PDF prêt' }).first().waitFor({ timeout: 45_000 });
    await pdfImage.waitFor({ timeout: 15_000 });
  };
  await page.getByRole('tab', { name: /Modèles/ }).click();
  const gallery = page.getByRole('list', { name: 'Modèles de CV' });
  const status = page.getByTestId('template-status');
  await ready();

  // 1. Sélection : code régénéré à partir des données, PDF recompilé, sans IA
  const beforeSrc = await pdfImage.getAttribute('src');
  const compilesBefore = compiles.length;
  await gallery.getByRole('button', { name: /Executive Prestige/ }).click();
  const afterClick = await codeArea(page).inputValue();
  check('sélection : code régénéré immédiatement avec le nouveau modèle', afterClick.includes(SIGNATURES['Executive Prestige']) && !afterClick.includes(SIGNATURES['Silicon Valley Engineer']));
  check('données du CV conservées dans le nouveau code', ['Awa Konan', 'Institut fictif de santé', 'Master Big Data', 'Power BI', 'Tableaux de bord Power BI pour 12 districts sanitaires'].every(t => afterClick.includes(t)));
  await page.getByRole('status').filter({ hasText: /Modèle « Executive Prestige » appliqué/ }).waitFor({ timeout: 5_000 });
  await ready();
  // Les pages sont rendues en images après réception du PDF
  const renewed = await page.waitForFunction(old => document.querySelector('img[alt="Page 1 du CV"]')?.getAttribute('src') !== old, beforeSrc, { timeout: 15_000 }).then(() => true, () => false);
  check('compilation sécurisée lancée automatiquement, PDF affiché et renouvelé', compiles.length > compilesBefore && renewed);
  check('dernière compilation = code du modèle choisi', compiles.at(-1).includes(SIGNATURES['Executive Prestige']));
  check('aucune génération IA pour un simple changement de modèle', calls.length === 0);
  check('statut : code et aperçu à jour avec ce modèle', /à jour avec ce modèle/.test(await status.innerText()));
  await page.getByRole('tab', { name: /Design/ }).click();
  check('réglages du thème actualisés (police du modèle)', (await page.getByLabel('Police').inputValue()) === 'charter');
  await page.getByRole('tab', { name: /Modèles/ }).click();
  await page.screenshot({ path: path.join(OUT, 'v2-p2-modele.png') });

  // 2. Changements rapides : seule la dernière version compte
  const rapidStart = compiles.length;
  for (const name of ['AI & Data Scientist', 'Software Architect', 'Modern Creative']) await gallery.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForTimeout(300);
  await ready();
  await page.waitForTimeout(1500);
  await ready();
  const finalCode = await codeArea(page).inputValue();
  check('changements rapides : code final = dernier modèle choisi', finalCode.includes(SIGNATURES['Modern Creative']));
  check('changements rapides : dernière compilation = dernier modèle, PDF à jour', compiles.at(-1).includes(SIGNATURES['Modern Creative']) && !(await page.getByRole('status').filter({ hasText: 'Modifié' }).count()),
    `${compiles.length - rapidStart} compilation(s) pour 3 changements`);

  // 3. Retour au modèle précédent
  await page.getByRole('button', { name: /Revenir au modèle précédent \(« Software Architect »\)/ }).click();
  check('retour au modèle précédent : code et modèle rétablis', (await codeArea(page).inputValue()).includes(SIGNATURES['Software Architect'])
    && (await gallery.getByRole('button', { name: /Software Architect/ }).getAttribute('aria-pressed')) === 'true');
  await ready();

  // 4. Modifications manuelles : confirmation avant d'écraser
  await codeArea(page).fill(`${await codeArea(page).inputValue()}\n% retouche manuelle e2e`);
  await status.getByText(/modifié à la main/).waitFor({ timeout: 5_000 });
  check('code modifié à la main signalé dans la galerie', true);
  await gallery.getByRole('button', { name: /Minimal ATS Pro/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Remplacer le code actuel ?' });
  await dialog.waitFor({ timeout: 5_000 });
  check('changement de modèle après édition manuelle : confirmation demandée', /modifié à la main/.test(await dialog.innerText()));
  await page.screenshot({ path: path.join(OUT, 'v2-p2-confirmation.png') });
  await dialog.getByRole('button', { name: 'Garder mon code' }).click();
  check('« Garder mon code » : code et modèle inchangés', (await codeArea(page).inputValue()).includes('% retouche manuelle e2e')
    && (await gallery.getByRole('button', { name: /Software Architect/ }).getAttribute('aria-pressed')) === 'true');
  await gallery.getByRole('button', { name: /Minimal ATS Pro/ }).click();
  await dialog.getByRole('button', { name: /Appliquer « Minimal ATS Pro »/ }).click();
  check('confirmation acceptée : code régénéré, retouche remplacée', (await codeArea(page).inputValue()).includes(SIGNATURES['Minimal ATS Pro']) && !(await codeArea(page).inputValue()).includes('% retouche manuelle e2e'));
  await page.getByRole('status').filter({ hasText: /Modèle « Minimal ATS Pro » appliqué/ }).getByRole('button', { name: '↶ Annuler' }).click();
  check('annulation : la retouche manuelle revient', (await codeArea(page).inputValue()).includes('% retouche manuelle e2e'));

  // 5. Réglage du thème : code mis à jour, compilation après temporisation
  await gallery.getByRole('button', { name: /Silicon Valley Engineer/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Remplacer le code actuel ?' });
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Appliquer/ }).click();
  await ready();
  const beforeColor = compiles.length;
  await page.getByRole('tab', { name: /Design/ }).click();
  await page.getByRole('radio', { name: 'Bordeaux' }).click();
  check('couleur choisie : code mis à jour immédiatement', (await codeArea(page).inputValue()).includes('\\definecolor{accent}{HTML}{7A1E2C}'));
  await page.waitForTimeout(2_000);
  await ready();
  check('couleur : recompilation automatique après temporisation', compiles.length > beforeColor && compiles.at(-1).includes('7A1E2C'));
  check('toujours aucun appel IA', calls.length === 0);
  await page.screenshot({ path: path.join(OUT, 'v2-p2-couleur.png') });
  await context.close();
}

// ── Phase avancée, P5 : panneau Design ───────────────────────
async function v2p5(browser) {
  console.log('\n▶ Phase avancée P5 — Design : typographie, mise en page, couleurs (compilation réelle)');
  const { context, page, calls } = await newStudio(browser, { session: { 'latex-studio:cv': IMPORTED } });
  const compiles = [];
  page.on('request', r => { if (r.url().includes('/api/cv/compile') && r.method() === 'POST') compiles.push(r.postData() ?? ''); });
  const ready = () => page.getByRole('status').filter({ hasText: 'PDF prêt' }).first().waitFor({ timeout: 45_000 });
  const code = () => codeArea(page).inputValue();
  await ready();
  const initial = await code();
  await page.getByRole('tab', { name: /Design/ }).click();

  // Typographie
  await page.getByLabel('Police').selectOption('palatino');
  check('police Palatino : variable de police dans le code', (await code()).includes('\\renewcommand{\\rmdefault}{ppl}'));
  await page.waitForTimeout(1_200);
  await ready();
  check('police : PDF recompilé après temporisation', compiles.at(-1).includes('{ppl}'));

  const before = compiles.length;
  const slider = page.getByLabel('Taille du nom');
  await slider.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  check('taille du nom au clavier : 24 → 30 pt dans le code', (await code()).includes('\\newcommand{\\cvnamefont}{\\fontsize{30}{35}\\selectfont}'));
  await page.waitForTimeout(1_500);
  await ready();
  check('six réglages rapprochés : une seule compilation', compiles.length - before === 1, `${compiles.length - before} compilation(s)`);
  await page.getByRole('button', { name: 'Annuler le dernier réglage' }).first().click();
  check('« Annuler le dernier réglage » : toute la rafale annulée en un clic', (await code()).includes('\\fontsize{24}{28}') && (await code()).includes('{ppl}'));

  await page.getByLabel('Titres de section en gras').uncheck();
  await page.getByLabel('Titre professionnel en italique').check();
  check('graisse et italique : variables mises à jour', (await code()).includes('\\newcommand{\\cvsectionfont}{\\normalsize\\mdseries}') && (await code()).includes('\\large\\itshape}'));

  // Couleurs
  const heading = page.getByLabel('Couleur des titres (hexadécimal)');
  await heading.fill('#0F766E');
  await heading.press('Enter');
  check('couleur des titres en hexadécimal', (await code()).includes('\\definecolor{heading}{HTML}{0F766E}'));
  await heading.fill('#zzz');
  await heading.press('Enter');
  check('valeur hexadécimale invalide ignorée', (await code()).includes('\\definecolor{heading}{HTML}{0F766E}') && !(await code()).includes('zzz'));
  await page.getByRole('button', { name: 'Palette Bordeaux' }).click();
  const palette = await code();
  check('palette prédéfinie : principale, secondaire, titres, texte, filets', ['{accent}{HTML}{7A1E2C}', '{accent2}{HTML}{B45309}', '{heading}{HTML}{7A1E2C}', '{bodytext}{HTML}{292524}', '{cvrule}{HTML}{D6C7C2}'].every(c => palette.includes(c)));

  // Mise en page
  await page.getByLabel('Format', { exact: true }).selectOption('letter');
  await page.getByLabel('Densité').selectOption('airy');
  await page.getByLabel('Alignement des titres').selectOption('center');
  await page.getByLabel('Séparateurs').selectOption('none');
  const layout = await code();
  const sectionMacro = /\\newcommand\{\\cvsection\}.*$/m.exec(layout)?.[0] ?? '';
  check('format Letter, densité aérée, titres centrés, sans séparateur', layout.includes('letterpaper') && layout.includes('itemsep=3pt') && sectionMacro.includes('\\centering') && !sectionMacro.includes('\\hrule'));
  const imageBefore = await page.locator('img[alt="Page 1 du CV"]').getAttribute('src');
  await page.getByLabel('Ne pas couper une expérience ou une formation entre deux pages').uncheck();
  check('saut de page : entrées libres', !(await code()).includes('\\needspace{3\\baselineskip}'));
  await page.waitForTimeout(1_500);
  await ready();
  await page.waitForFunction(old => document.querySelector('img[alt="Page 1 du CV"]')?.getAttribute('src') !== old, imageBefore, { timeout: 15_000 });
  // Pages rendues : l'aperçu n'est plus « en cours de mise à jour »
  await page.locator('[data-preview][aria-busy="false"]').waitFor({ timeout: 15_000 });
  check('mise en page complète : compilation réussie', compiles.at(-1).includes('letterpaper') && !(await page.getByRole('alert').filter({ hasText: /Erreur/ }).count()));
  await page.screenshot({ path: path.join(OUT, 'v2-p5-design.png') });
  check('données du CV intactes après tous les réglages', ['Awa Konan', 'Institut fictif de santé', 'Master Big Data'].every(t => layout.includes(t)));

  await page.getByRole('button', { name: 'Réinitialiser au style du modèle' }).click();
  check('réinitialisation : code identique au style d’origine du modèle', (await code()) === initial);
  check('aucun appel IA pendant le design', calls.length === 0);
  await context.close();

  // Smartphone : panneau utilisable sans défilement horizontal
  const mobile = await newStudio(browser, { width: 390, height: 844, mobile: true, session: { 'latex-studio:cv': IMPORTED } });
  await mobile.page.getByRole('button', { name: /Informations/ }).click();
  await mobile.page.getByRole('tab', { name: /Design/ }).click();
  await mobile.page.getByLabel('Taille du nom').waitFor();
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mobile.page.getByLabel('Densité').selectOption('compact');
  check('smartphone 390 px : panneau Design sans débordement, réglage appliqué', overflow <= 1 && (await codeArea(mobile.page).inputValue()).includes('itemsep=0pt'), `${overflow} px`);
  await mobile.page.screenshot({ path: path.join(OUT, 'v2-p5-mobile.png') });
  await mobile.context.close();
}

// ── Phase avancée, P6 : réorganisation des sections ──────────
async function v2p6(browser) {
  console.log('\n▶ Phase avancée P6 — Sections : ordre, masquage, titres, sections personnalisées (compilation réelle)');
  const { context, page, calls } = await newStudio(browser, { session: { 'latex-studio:cv': IMPORTED } });
  const compiles = [];
  page.on('request', r => { if (r.url().includes('/api/cv/compile') && r.method() === 'POST') compiles.push(r.postData() ?? ''); });
  const ready = async () => {
    await page.getByRole('status').filter({ hasText: 'PDF prêt' }).first().waitFor({ timeout: 45_000 });
    await page.locator('[data-preview][aria-busy="false"]').waitFor({ timeout: 15_000 });
  };
  const code = () => codeArea(page).inputValue();
  const sections = async () => [...(await code()).matchAll(/\\cvsection\{([^}]*)\}/g)].map(m => m[1]);
  await ready();
  await page.getByRole('tab', { name: /Données/ }).click();
  const list = page.getByRole('list', { name: 'Ordre des sections du CV' });
  await list.waitFor();
  const shown = await list.locator('li').evaluateAll(items => items.map(li => li.getAttribute('data-section')));
  check('ordre affiché = ordre du modèle (Silicon Valley)', shown.slice(0, 5).join() === 'summary,experience,projects,skills,education', shown.join());

  // 1. Compétences avant Expériences, aux boutons (clavier et mobile)
  await page.getByRole('button', { name: 'Monter Compétences' }).click();
  await page.getByRole('button', { name: 'Monter Compétences' }).click();
  const after = await sections();
  check('« Monter » deux fois : Compétences avant Expériences dans le code', after.indexOf('Compétences') < after.indexOf('Expérience professionnelle'), after.join(' › '));
  await page.waitForTimeout(1_500);
  await ready();
  const last = compiles.at(-1);
  check('recompilation : le PDF suit le nouvel ordre', last.indexOf('\\cvsection{Compétences}') < last.indexOf('\\cvsection{Expérience professionnelle}'));
  await page.screenshot({ path: path.join(OUT, 'v2-p6-ordre.png') });

  // 2. Glisser-déposer : Formation en tête
  await list.locator('li[data-section="education"]').dragTo(list.locator('li[data-section="summary"]'));
  check('glisser-déposer : Formation en première position', (await sections())[0] === 'Formation', (await sections()).join(' › '));

  // 3. Masquer, renommer (espaces conservés pendant la frappe)
  await page.getByLabel('Afficher Langues').uncheck();
  check('section masquée : absente du code', !(await sections()).includes('Langues'));
  const rename = page.getByLabel('Titre de la section Compétences');
  await rename.click();
  await rename.pressSequentially('Savoir faire clés', { delay: 20 });
  check('section renommée, espaces conservés', (await sections()).includes('Savoir faire clés'));

  // 4. Section personnalisée, puis suppression confirmée et annulable
  await page.getByLabel('Titre de la nouvelle section').fill('Bénévolat');
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  await page.getByLabel('Contenu de « Bénévolat » (une ligne par élément)').fill('Mentor, association fictive\nTrésorier, club fictif');
  const custom = await code();
  check('section personnalisée : titre et liste dans le code', custom.includes('\\cvsection{Bénévolat}') && custom.includes('\\item Trésorier, club fictif'));
  await page.waitForTimeout(1_500);
  await ready();
  check('section personnalisée compilée', compiles.at(-1).includes('\\cvsection{Bénévolat}'));
  await list.locator('li[data-section="x1"]').getByRole('button', { name: 'Supprimer…' }).click();
  const confirmGroup = page.getByRole('group', { name: /Confirmer la suppression de Bénévolat/ });
  check('suppression : confirmation demandée', await confirmGroup.isVisible());
  await confirmGroup.getByRole('button', { name: 'Supprimer définitivement' }).click();
  check('section supprimée du code', !(await code()).includes('Bénévolat'));
  await page.getByRole('button', { name: /Annuler le dernier réglage/ }).first().click();
  check('annulation : la section supprimée revient', (await code()).includes('\\cvsection{Bénévolat}'));

  // 5. Nouvelle page avant une section
  await page.getByLabel('Nouvelle page avant Formation').check();
  check('saut de page avant Formation', /\\clearpage\n\\cvsection\{Formation\}/.test(await code()));

  // 6. Éléments d'une section : la saisie suit dans le code, ordre des expériences
  await page.locator('details > summary').filter({ hasText: /^Expériences/ }).click();
  await page.getByRole('button', { name: '+ Ajouter une expérience' }).click();
  const roles = page.getByLabel('Poste');
  await roles.last().fill('Stagiaire en statistique');
  check('édition simple : la nouvelle expérience apparaît dans le code', (await code()).includes('Stagiaire en statistique'));
  const before = await code();
  const role = name => `\\textbf{${name}}`;
  check('nouvelle expérience ajoutée en fin de section', before.indexOf(role('Data Analyst')) >= 0 && before.indexOf(role('Data Analyst')) < before.indexOf(role('Stagiaire en statistique')));
  await page.getByRole('button', { name: 'Monter', exact: true }).last().click();
  const reordered = await code();
  check('éléments réordonnés à l’intérieur de la section (« Monter »)', reordered.indexOf(role('Stagiaire en statistique')) >= 0 && reordered.indexOf(role('Stagiaire en statistique')) < reordered.indexOf(role('Data Analyst')));

  // 7. L'organisation suit le CV d'un modèle à l'autre
  await page.getByRole('tab', { name: /Modèles/ }).click();
  await page.getByRole('list', { name: 'Modèles de CV' }).getByRole('button', { name: /Healthcare & Research/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Remplacer le code actuel ?' });
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: /Appliquer/ }).click();
  const healthcare = await sections();
  check('changement de modèle : ordre, masquage, titres et section personnalisée conservés',
    healthcare[0] === 'Formation' && healthcare.includes('Savoir faire clés') && healthcare.includes('Bénévolat') && !healthcare.includes('Langues'), healthcare.join(' › '));
  await page.waitForTimeout(1_500);
  await ready();
  await page.screenshot({ path: path.join(OUT, 'v2-p6-modele.png') });
  check('aucun appel IA', calls.length === 0);
  await context.close();

  // Smartphone : boutons Monter/Descendre utilisables, pas de débordement
  const mobile = await newStudio(browser, { width: 390, height: 844, mobile: true, session: { 'latex-studio:cv': IMPORTED } });
  await mobile.page.getByRole('button', { name: /Informations/ }).click();
  await mobile.page.getByRole('tab', { name: /Données/ }).click();
  await mobile.page.getByRole('button', { name: 'Descendre Profil' }).click();
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const box = await mobile.page.getByRole('button', { name: 'Descendre Expériences professionnelles' }).boundingBox().catch(() => null)
    ?? await mobile.page.getByRole('button', { name: /^Descendre Expérience/ }).first().boundingBox();
  const mobileSections = [...(await codeArea(mobile.page).inputValue()).matchAll(/\\cvsection\{([^}]*)\}/g)].map(m => m[1]);
  check('smartphone 390 px : réordonné au toucher, sans débordement, cibles ≥ 44 px', overflow <= 1 && mobileSections[0] !== 'Profil' && box && box.height >= 43, `${overflow} px, cible ${box ? Math.round(box.height) : '?'} px`);
  await mobile.page.screenshot({ path: path.join(OUT, 'v2-p6-mobile.png') });
  await mobile.context.close();
}

async function p5webkit() {
  // Moteur de Safari (iPhone, iPad) : mêmes contrôles
  const webkit = await pw.webkit.launch();
  try { await p5(webkit, 'webkit'); } finally { await webkit.close(); }
}

const SCENARIOS = { p1, p2, p3, p4, p5, p5webkit, v2p2, v2p5, v2p6 };

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

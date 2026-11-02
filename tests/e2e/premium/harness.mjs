// Harnais commun de la recette navigateur premium (tests/e2e/premium.e2e.mjs).
// Recette locale uniquement : Vite en mode recette (5173), Supabase local (58521), API (5000).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readSegment } from '../../../scripts/lib/admin-route.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const WEB = process.env.RECETTE_WEB || 'http://localhost:5173';
export const GATEWAY = 'http://127.0.0.1:58521';
export const API = 'http://127.0.0.1:5000';
export const OUT = path.join(ROOT, 'secrets', 'recette', 'e2e', 'premium');
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.PLAYWRIGHT_CORE_DIR) {
  console.error('PLAYWRIGHT_CORE_DIR requis (dossier contenant node_modules/playwright-core)');
  process.exit(2);
}
export const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR, 'noop.js'))('playwright-core');

export const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1366, 1440, 1920];
const HEIGHT = w => (w < 768 ? 800 : w < 1366 ? 1000 : 900);

// Chemin d'administration de la recette (secrets/admin-route/recette.txt, généré par recette.mjs up) :
// jamais écrit dans les scénarios ni affiché ; « /<admin> » le remplace dans les sorties.
const ADMIN_SEGMENT = readSegment('recette');
export const ADMIN = ADMIN_SEGMENT ? `/${ADMIN_SEGMENT}` : '/chemin-admin-absent';
export const redact = text => (ADMIN_SEGMENT ? String(text).split(ADMIN_SEGMENT).join('<admin>') : String(text));

export const results = { failures: 0, report: [] };
export function check(label, ok, detail = '') {
  if (!ok) results.failures++;
  label = redact(label);
  detail = redact(detail);
  results.report.push({ label, ok: !!ok, detail });
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
}

/** Services tiers neutralisés sur un contexte (géolocalisation IP, Google Analytics) */
export async function neutralize(target) {
  await target.route(/ipapi\.co/, r => r.fulfill({ status: 200, json: {} }));
  await target.route(/googletagmanager\.com|google-analytics\.com/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
}

/** Nouveau contexte : services tiers neutralisés, erreurs de console relevées */
export async function open(browser, route, { width = 1366, height, reducedMotion, mobile, beforeGoto } = {}) {
  const isMobile = mobile ?? width < 768;
  const context = await browser.newContext({
    viewport: { width, height: height ?? HEIGHT(width) },
    hasTouch: isMobile,
    isMobile: isMobile && browser.browserType().name() !== 'firefox',
    deviceScaleFactor: 1,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  await neutralize(page);
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (beforeGoto) await beforeGoto(page, context);
  await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

/** Défilement horizontal parasite et éléments visibles coupés par les bords de l'écran */
export async function layoutIssues(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth - vw;
    const clipped = [];
    for (const el of document.querySelectorAll('nav a, nav button, main a, main button, section a, section button, h1, h2')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!r.width || style.visibility === 'hidden' || style.display === 'none') continue;
      // Éléments d'une zone défilable horizontalement (onglets, filtres en carrousel) : coupure voulue,
      // l'élément reste atteignable par glissement et au clavier
      let scroller = el.parentElement;
      while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
      if (scroller && scroller !== document.documentElement && scroller !== document.body) continue;
      if (r.right > vw + 1 || r.left < -1) clipped.push(`${el.tagName.toLowerCase()} « ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)} » ${Math.round(r.left)}→${Math.round(r.right)}`);
    }
    return { overflowX, clipped };
  });
}

export const shot = (page, name, options = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...options });

export const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ── Base de recette et comptes temporaires ────────────────────
function stackEnv() {
  const file = path.join(ROOT, 'secrets', 'recette', 'stack.env');
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}

export function sql(query) {
  const r = spawnSync('docker', ['exec', '-i', 'recette-db', 'psql', '-X', '-q', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql : ${r.stderr.slice(-300)}`);
  return r.stdout.trim();
}

export function totp(base32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = crypto.createHmac('sha1', key).update(counter).digest();
  const o = mac[mac.length - 1] & 0xf;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

/** Compte administrateur temporaire (jamais le compte du propriétaire), TOTP déjà enrôlé */
export async function tempAdmin(label) {
  const env = stackEnv();
  const email = `e2e-${label}-${crypto.randomUUID()}@recette.test`;
  const password = `${crypto.randomBytes(12).toString('base64url')}-E2e!`;
  const gotrue = async (pathname, token, body, method = 'POST', apikey = env.RECETTE_ANON_KEY) => {
    const res = await fetch(`${GATEWAY}/auth/v1${pathname}`, {
      method,
      headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`auth ${pathname} : HTTP ${res.status}`);
    return json;
  };
  const user = await gotrue('/admin/users', env.RECETTE_SERVICE_KEY, { email, password, email_confirm: true }, 'POST', env.RECETTE_SERVICE_KEY);
  sql(`insert into public.admin_users (user_id, email) values ('${user.id}', '${email}');`);
  const aal1 = (await gotrue('/token?grant_type=password', env.RECETTE_ANON_KEY, { email, password })).access_token;
  const factor = await gotrue('/factors', aal1, { factor_type: 'totp', friendly_name: 'e2e' });
  const challenge = await gotrue(`/factors/${factor.id}/challenge`, aal1, {});
  const usedAt = Date.now();
  await gotrue(`/factors/${factor.id}/verify`, aal1, { challenge_id: challenge.id, code: totp(factor.totp.secret, usedAt) });
  return {
    id: user.id, email, password, secret: factor.totp.secret, anon: env.RECETTE_ANON_KEY,
    lastCodeWindow: Math.floor(usedAt / 30000),
    remove: () => gotrue(`/admin/users/${user.id}`, env.RECETTE_SERVICE_KEY, {}, 'DELETE', env.RECETTE_SERVICE_KEY),
  };
}

/** Connexion par l'interface : e-mail et mot de passe, puis code TOTP (jamais deux fois le même code) */
export async function loginUi(page, admin) {
  await page.getByLabel('E-mail').fill(admin.email);
  await page.getByLabel('Mot de passe').fill(admin.password);
  // Sans attente de stabilité : compatible avec l'horloge simulée de WebKit (clic réel quand même)
  await page.getByRole('button', { name: 'Se connecter' }).click({ force: true });
  const code = page.getByLabel(/Code à 6 chiffres/);
  await code.waitFor({ timeout: 20_000 });
  while (Math.floor(Date.now() / 30000) <= admin.lastCodeWindow) await new Promise(r => setTimeout(r, 1000));
  admin.lastCodeWindow = Math.floor(Date.now() / 30000);
  await code.fill(totp(admin.secret));
  await page.getByRole('button', { name: 'Valider' }).click({ force: true });
}

/** Jeton d'accès Supabase conservé par le navigateur (pour vérifier qu'il est refusé ensuite) */
export const accessToken = page => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
  return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
});

/**
 * Écart moyen (0-255, par canal) entre deux captures PNG de même taille, décodées dans la page :
 * aucune dépendance de décodage d'image dans le projet.
 */
export async function pixelDiff(page, pngA, pngB) {
  return page.evaluate(async ([a, b]) => {
    const pixels = async b64 => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
    if (pa.length !== pb.length) return 255;
    let sum = 0, n = 0;
    for (let i = 0; i < pa.length; i += 4) {
      sum += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
      n += 3;
    }
    return sum / n;
  }, [pngA.toString('base64'), pngB.toString('base64')]);
}

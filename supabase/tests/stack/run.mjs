#!/usr/bin/env node
// Banc d'intégration sur une pile Supabase locale RÉELLE (Postgres, Auth, PostgREST, Storage) :
// CV public (P0.CV) et centre d'administration multi-IA (ai.mjs).
//   node supabase/tests/stack/run.mjs [--keep]
// Jetons et MFA TOTP réels, blog-api compilée et réellement démarrée, aucune clé réelle,
// aucune donnée de production. Projet Docker isolé « p0cv-stack » (ports 58321-58333).
// Avec PLAYWRIGHT_CORE_DIR=<dossier contenant playwright-core> : parcours navigateur (browser.mjs).

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAiScenarios } from './ai.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const API_DIR = path.join(ROOT, 'blog-api');
const jwt = createRequire(path.join(API_DIR, 'noop.js'))('jsonwebtoken');

// ── Valeurs factices, propres à ce banc ─────────────────────
const JWT_SECRET  = 'local-stack-test-jwt-secret-not-used-anywhere-0123456789';
const DB_PASSWORD = 'local-stack-test-db-password';
const AI_DB_PASSWORD = 'local-stack-test-ai-backend-password';
const PROVIDER_IDS = ['openai', 'groq', 'xai', 'gemini', 'openrouter', 'anthropic'];
const GATEWAY     = 'http://127.0.0.1:58321';
const API         = 'http://127.0.0.1:58400';
const staticJwt = role => jwt.sign({ role, iss: 'supabase-local-test', iat: 1700000000, exp: 2000000000 }, JWT_SECRET);
export const ANON_KEY = staticJwt('anon');
const SERVICE_KEY = staticJwt('service_role');

const COMPOSE = path.join(HERE, 'compose.yml');
const composeEnv = {
  ...process.env,
  STACK_JWT_SECRET: JWT_SECRET, STACK_DB_PASSWORD: DB_PASSWORD, STACK_PUBLIC_URL: GATEWAY,
  STACK_ANON_KEY: ANON_KEY, STACK_SERVICE_KEY: SERVICE_KEY,
};
const compose = (...args) => spawnSync('docker', ['compose', '-f', COMPOSE, ...args], { env: composeEnv, encoding: 'utf8' });
const psql = (user, sql, extra = []) => {
  const r = spawnSync('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'db', 'psql', '-X', '-q', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extra],
    { env: composeEnv, encoding: 'utf8', input: sql });
  if (r.status !== 0) throw new Error(`psql (${user}) : ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
};
const sqlValue = sql => psql('supabase_admin', sql, ['-At']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
export const check = (label, ok, detail = '') => {
  results.push({ label, ok: !!ok });
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
};

// ── Passerelle (rôle de Kong) ───────────────────────────────
const gatewayState = { failRpc: false };
const ROUTES = { '/auth/v1': 58331, '/rest/v1': 58332, '/storage/v1': 58333 };
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization']);
const gateway = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-upsert,prefer,accept-profile,content-profile,x-supabase-api-version,cache-control',
    'Access-Control-Expose-Headers': 'content-range,content-disposition',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (gatewayState.failRpc && req.url.startsWith('/rest/v1/rpc/cv_active')) {
    res.writeHead(500, { ...cors, 'Content-Type': 'application/json' });
    res.end('{"message":"panne simulée"}');
    return;
  }
  const prefix = Object.keys(ROUTES).find(p => req.url.startsWith(p));
  if (!prefix) { res.writeHead(404, cors); res.end(); return; }
  const upstream = http.request(
    // Connexion neuve à chaque requête : une connexion inactive fermée par le service ne peut pas être réutilisée
    { host: '127.0.0.1', port: ROUTES[prefix], path: req.url.slice(prefix.length) || '/', method: req.method, headers: { ...req.headers, host: `127.0.0.1:${ROUTES[prefix]}` }, agent: false },
    up => {
      // Un seul jeu d'en-têtes CORS : un doublon est refusé par les navigateurs.
      // En-têtes « saut par saut » retirés (RFC 9110 §7.6.1) : Storage annonce Keep-Alive
      // timeout=61, que le client appliquait à la connexion avec cette passerelle.
      const headers = Object.fromEntries(Object.entries(up.headers)
        .filter(([k]) => !k.startsWith('access-control-') && !HOP_BY_HOP.has(k)));
      res.writeHead(up.statusCode, { ...headers, ...cors });
      up.pipe(res);
    },
  );
  // Un service peut répondre avant d'avoir lu tout le corps (fichier refusé). Le reste de la
  // requête doit alors être lu et jeté : sinon il pollue la connexion, réutilisée ensuite
  // par le client (ECONNRESET sur l'appel suivant).
  const drain = () => { req.unpipe(upstream); req.resume(); };
  res.on('finish', drain);
  upstream.on('error', err => {
    console.log(`  [passerelle] ${req.method} ${req.url.split('?')[0]} : erreur amont ${err.code ?? err.message}`);
    drain();
    if (!res.headersSent) res.writeHead(502, cors);
    res.end();
  });
  res.on('error', err => console.log(`  [passerelle] ${req.url.split('?')[0]} : erreur réponse ${err.code ?? err.message}`));
  req.pipe(upstream);
});
// Les appels docker exec synchrones du banc gèlent la boucle d'événements, et donc les minuteries
// keep-alive des deux côtés : la passerelle garde ses connexions plus longtemps que le client.
gateway.keepAliveTimeout = 65_000;
gateway.headersTimeout = 66_000;
gateway.on('clientError', (err, socket) => {
  console.log(`  [passerelle] clientError ${err.code ?? err.message}`);
  socket.destroy();
});

// ── Authentification réelle ─────────────────────────────────
function totp(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export const totpCode = totp;

async function auth(pathname, body, token = ANON_KEY, method = 'POST') {
  const res = await fetch(`${GATEWAY}/auth/v1${pathname}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`auth ${pathname} : HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const createUser = (email, password) => auth('/admin/users', { email, password, email_confirm: true }, SERVICE_KEY);
const signIn = async (email, password) => (await auth('/token?grant_type=password', { email, password })).access_token;
async function enrollMfa(token) {
  const factor = await auth('/factors', { factor_type: 'totp', friendly_name: `banc-${crypto.randomUUID()}` }, token);
  const challenge = await auth(`/factors/${factor.id}/challenge`, {}, token);
  const verified = await auth(`/factors/${factor.id}/verify`, { challenge_id: challenge.id, code: totp(factor.totp.secret) }, token);
  return { aal2: verified.access_token, secret: factor.totp.secret };
}

// ── Accès HTTP aux services ─────────────────────────────────
const bearer = t => ({ apikey: ANON_KEY, Authorization: `Bearer ${t ?? ANON_KEY}` });
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const objectUrl = (b, p) => `${GATEWAY}/storage/v1/object/${b}/${p}`;
const publicUrl = (b, p) => `${GATEWAY}/storage/v1/object/public/${b}/${p}`;
const put = (b, p, body, token, type = 'application/pdf', upsert = false) =>
  fetch(objectUrl(b, p), { method: 'POST', headers: { ...bearer(token), 'Content-Type': type, 'x-upsert': String(upsert) }, body });
const remove = (b, p, token) => fetch(objectUrl(b, p), { method: 'DELETE', headers: bearer(token) });
const list = async (b, token) => {
  const res = await fetch(`${GATEWAY}/storage/v1/object/list/${b}`, { method: 'POST', headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100 }) });
  return { status: res.status, items: await res.json().catch(() => null) };
};
const rpc = async (fn, args, token) => {
  const res = await fetch(`${GATEWAY}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const rest = async (pathname, token, init = {}) => {
  const res = await fetch(`${GATEWAY}/rest/v1/${pathname}`, { ...init, headers: { ...bearer(token), 'Content-Type': 'application/json', ...init.headers } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const uploadCv = async (pdf, token, expectedActive = '', name = 'cv.pdf') => {
  const form = new FormData();
  form.append('expectedActive', expectedActive ?? '');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), name);
  const res = await fetch(`${API}/api/admin/cv`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const restoreCv = async (id, token, expectedActive) => {
  const res = await fetch(`${API}/api/admin/cv/${id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ expectedActive }) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const active = async () => (await rpc('cv_active', {})).body?.[0] ?? null;
const activeCount = () => Number(sqlValue("select count(*) from public.cv_versions where status = 'active';"));
const docObjects = () => Number(sqlValue("select count(*) from storage.objects where bucket_id = 'portfolio-public-documents';"));

function makePdf(text) {
  const content = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((b, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// ── blog-api réelle ─────────────────────────────────────────
let apiProcess = null;
let apiBuild = null;
let apiLogs = '';
const aiFakes = {};
function startApi() {
  apiProcess = spawn(process.execPath, ['index.js'], {
    cwd: apiBuild,   // aucun .env dans ce dossier
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      NODE_PATH: path.join(API_DIR, 'node_modules'), PORT: '58400', NODE_ENV: 'development', FRONTEND_URL: 'http://127.0.0.1:5173',
      AI_DATABASE_URL: `postgresql://ai_backend:${AI_DB_PASSWORD}@127.0.0.1:58334/postgres`,
      AI_LOG_HMAC_SECRET: 'local-stack-test-hmac-secret-0123456789',
      AI_ADMIN_WRITE_RATE_LIMIT_MAX: '1000',
      ...Object.fromEntries(Object.entries(aiFakes).map(([id, fake]) => [`AI_DEV_PROVIDER_BASE_URL_${id.toUpperCase()}`, fake.url])),
      MONGODB_URI: 'mongodb://127.0.0.1:1/none?serverSelectionTimeoutMS=300', JWT_SECRET: 'fake-jwt',
      SUPABASE_URL: GATEWAY, SUPABASE_ANON_KEY: ANON_KEY, CV_WRITE_RATE_LIMIT_MAX: '1000', ADMIN_RATE_LIMIT_MAX: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Journaux conservés : le banc vérifie qu'aucune clé n'y apparaît
  for (const stream of [apiProcess.stdout, apiProcess.stderr]) stream.on('data', chunk => { apiLogs += chunk; });
  return (async () => {
    for (let i = 0; i < 80; i++) { try { await fetch(`${API}/api/health`); return; } catch { await sleep(250); } }
    throw new Error(`blog-api non démarrée : ${apiLogs.slice(-600).replace(/\s+/g, ' ')}`);
  })();
}
async function stopApi() {
  if (!apiProcess) return;
  const p = apiProcess; apiProcess = null;
  const exited = new Promise(r => p.once('exit', r));
  p.kill();
  await exited;
}

async function waitFor(label, url) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* attente */ }
    await sleep(1000);
  }
  throw new Error(`${label} indisponible : ${compose('logs', '--tail', '20').stdout.slice(-1500)}`);
}

async function main() {
  console.log('▶ Démarrage de la pile Supabase locale (p0cv-stack)');
  compose('down', '-v', '--remove-orphans');
  const up = compose('up', '-d', '--wait', 'db');
  if (up.status !== 0) throw new Error(up.stderr.slice(-800));
  for (let i = 0; i < 60; i++) {
    if (compose('exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', "select 1 from pg_roles where rolname = 'authenticated'").stdout.includes('1')) break;
    await sleep(1000);
  }
  await sleep(4000);  // l'image redémarre Postgres après ses scripts d'initialisation
  psql('supabase_admin', ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin'].map(r => `alter user ${r} with password '${DB_PASSWORD}';`).join('\n'));
  const rest2 = compose('up', '-d', 'auth', 'rest', 'storage');
  if (rest2.status !== 0) throw new Error(rest2.stderr.slice(-800));
  await new Promise(r => gateway.listen(58321, '127.0.0.1', r));
  await waitFor('Auth', 'http://127.0.0.1:58331/health');
  await waitFor('PostgREST', 'http://127.0.0.1:58332/');
  await waitFor('Storage', 'http://127.0.0.1:58333/status');
  console.log(`  auth.jwt() : ${sqlValue("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'jwt';")} ; tables storage : ${sqlValue("select count(*) from pg_tables where schemaname = 'storage';")}`);

  console.log('▶ État « production » reproduit (tables, politiques héritées, bucket project-images)');
  psql('supabase_admin', "insert into storage.buckets (id, name, public) values ('project-images', 'project-images', true), ('avatars', 'avatars', false) on conflict do nothing;");
  psql('postgres', fs.readFileSync(path.join(ROOT, 'supabase/tests/rls/10_production_like_state.sql'), 'utf8'));
  psql('supabase_admin', "notify pgrst, 'reload schema';");
  await sleep(1500);

  const img = await put('project-images', 'projects/demo.png', PNG, SERVICE_KEY, 'image/png');
  check('préparation : image de projet déposée', img.ok, `HTTP ${img.status}`);
  const before = await list('project-images');
  check('AVANT migration : listage public de project-images possible (avertissement reproduit)', Array.isArray(before.items) && before.items.length > 0, `${before.items?.length ?? 0} entrée(s) visibles par un anonyme`);

  // Comptes réels
  const adminUser = await createUser('admin@example.test', 'Banc-Test-Admin-1!');
  const plainUser = await createUser('user@example.test', 'Banc-Test-User-1!');
  psql('supabase_admin', `insert into public.admin_users (user_id, email) values ('${adminUser.id}', 'admin@example.test');`);
  const adminAal1 = await signIn('admin@example.test', 'Banc-Test-Admin-1!');
  const userAal1  = await signIn('user@example.test', 'Banc-Test-User-1!');
  const { aal2: adminAal2, secret: adminTotp } = await enrollMfa(adminAal1);
  const { aal2: userAal2 } = await enrollMfa(userAal1);
  const aalOf = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).aal;
  check('jetons réels : MFA TOTP validée par Supabase Auth', aalOf(adminAal1) === 'aal1' && aalOf(adminAal2) === 'aal2', `${aalOf(adminAal1)} → ${aalOf(adminAal2)}`);

  console.log('▶ Application des migrations (rôle postgres, transaction unique)');
  for (const file of ['20261030120000_p0a1_admin_access_control', '20261030120100_p0a1_storage_access_control', '20261030120200_p0a1_security_advisor', '20261030150000_cv_public_document', '20261030150100_project_images_no_public_listing',
    '20261030170000_ai_control_center_schema', '20261030170100_ai_admin_functions', '20261030170200_ai_runtime_functions', '20261030170300_ai_initial_catalog']) {
    psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(ROOT, 'supabase/migrations', `${file}.sql`), 'utf8')}`, ['--single-transaction']);
    psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(ROOT, 'supabase/migrations', `${file}.sql`), 'utf8')}`, ['--single-transaction']);
  }
  // Mot de passe du rôle restreint : défini à la main, jamais dans une migration
  psql('supabase_admin', `alter role ai_backend login password '${AI_DB_PASSWORD}';`);
  psql('supabase_admin', "notify pgrst, 'reload schema';");
  await sleep(1500);
  check('migrations appliquées deux fois sans erreur (idempotence)', true);

  console.log('▶ project-images : politiques réelles');
  const anonList = await list('project-images');
  check('anonyme : listage vide', Array.isArray(anonList.items) && anonList.items.length === 0, `${anonList.items?.length} entrée(s)`);
  check('utilisateur connecté : listage vide', (await list('project-images', userAal2)).items?.length === 0);
  const imgGet = await fetch(publicUrl('project-images', 'projects/demo.png'));
  check('image existante toujours publique par URL (aucune régression)', imgGet.status === 200 && (imgGet.headers.get('content-type') ?? '').startsWith('image/png'), `HTTP ${imgGet.status}`);
  check('admin MFA : listage possible', (await list('project-images', adminAal2)).items?.length >= 1);
  check('utilisateur : téléversement refusé', !(await put('project-images', 'projects/x.png', PNG, userAal2, 'image/png')).ok);
  check('admin sans MFA : téléversement refusé', !(await put('project-images', 'projects/x.png', PNG, adminAal1, 'image/png')).ok);
  const adminImg = await put('project-images', 'projects/admin.png', PNG, adminAal2, 'image/png');
  check('admin MFA : téléversement accepté (flux du dashboard)', adminImg.ok, `HTTP ${adminImg.status}`);
  check('nouvelle image publique par URL', (await fetch(publicUrl('project-images', 'projects/admin.png'))).status === 200);
  check('admin MFA : suppression effective', (await remove('project-images', 'projects/admin.png', adminAal2)).ok && (await fetch(publicUrl('project-images', 'projects/admin.png'))).status >= 400);
  await remove('project-images', 'projects/demo.png', userAal2);
  check('utilisateur : suppression sans effet', (await fetch(publicUrl('project-images', 'projects/demo.png'))).status === 200);

  console.log('▶ Bucket portfolio-public-documents : politiques réelles');
  const path1 = `cv/versions/${crypto.randomUUID()}.pdf`;
  const PDF_X = makePdf('Essai direct');
  check('anonyme : téléversement refusé', !(await put('portfolio-public-documents', path1, PDF_X)).ok);
  check('utilisateur MFA : téléversement refusé', !(await put('portfolio-public-documents', path1, PDF_X, userAal2)).ok);
  check('admin sans MFA : téléversement refusé', !(await put('portfolio-public-documents', path1, PDF_X, adminAal1)).ok);
  check('admin MFA : chemin hors cv/versions refusé', !(await put('portfolio-public-documents', 'autre/x.pdf', PDF_X, adminAal2)).ok);
  check('admin MFA : type non PDF refusé par le bucket', !(await put('portfolio-public-documents', `cv/versions/${crypto.randomUUID()}.pdf`, Buffer.from('<html>'), adminAal2, 'text/html')).ok);
  const big = await put('portfolio-public-documents', `cv/versions/${crypto.randomUUID()}.pdf`, Buffer.alloc(10 * 1024 * 1024 + 10), adminAal2);
  check('admin MFA : fichier > 10 Mo refusé par le bucket', !big.ok, `HTTP ${big.status}`);
  check('aucun objet créé par ces essais', docObjects() === 0, `${docObjects()} objet(s)`);

  const { startFakeProvider } = await import(pathToFileURL(path.join(API_DIR, 'test/helpers/fakeProviders.mjs')).href);
  for (const id of PROVIDER_IDS) aiFakes[id] = await startFakeProvider(id);

  console.log('▶ Compilation et démarrage de blog-api');
  apiBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'p0cv-api-'));
  const tsc = spawnSync(process.execPath, [path.join(API_DIR, 'node_modules/typescript/bin/tsc'), '-p', API_DIR, '--outDir', apiBuild], { encoding: 'utf8' });
  if (tsc.status !== 0) throw new Error(tsc.stdout.slice(-500));
  await startApi();

  console.log('▶ Remplacement du CV : contrôles d’accès avec de vrais jetons');
  const PDF_A = makePdf('CV version A'), PDF_B = makePdf('CV version B'), PDF_C = makePdf('CV version C');
  check('anonyme → 401', (await uploadCv(PDF_A)).status === 401);
  check('utilisateur non administrateur → 403', (await uploadCv(PDF_A, userAal2)).status === 403);
  const noMfa = await uploadCv(PDF_A, adminAal1);
  check('administrateur sans MFA → 403 MFA_REQUIRED', noMfa.status === 403 && noMfa.body?.code === 'MFA_REQUIRED');
  check('fichier invalide → refusé', (await uploadCv(Buffer.from('pas un pdf'), adminAal2)).status === 415);
  check('aucune version créée par ces refus', (await active()) === null && docObjects() === 0);
  const directAnon = await rpc('cv_publish_version', { p_id: crypto.randomUUID(), p_storage_path: path1, p_size_bytes: 1, p_sha256: 'a'.repeat(64), p_original_filename: null, p_expected_active: null });
  const directNoMfa = await rpc('cv_publish_version', { p_id: crypto.randomUUID(), p_storage_path: path1, p_size_bytes: 1, p_sha256: 'a'.repeat(64), p_original_filename: null, p_expected_active: null }, adminAal1);
  check('appel direct de la fonction SQL : anonyme et admin sans MFA refusés', directAnon.status >= 400 && directNoMfa.status === 403, `${directAnon.status} / ${directNoMfa.status}`);

  console.log('▶ Publication, persistance, historique');
  const a = await uploadCv(PDF_A, adminAal2, '', 'CV-A.pdf');
  check('publication A → 201', a.status === 201, `HTTP ${a.status} ${a.body?.code ?? ''}`);
  const vA = a.body?.version;
  check('référence active enregistrée en base', (await active())?.id === vA?.id);
  const servedA = await fetch(publicUrl(vA.bucket, vA.storage_path));
  const servedBuf = Buffer.from(await servedA.arrayBuffer());
  check('fichier public identique octet par octet (SHA-256)', sha256(servedBuf) === sha256(PDF_A) && vA.sha256 === sha256(PDF_A));
  console.log(`  en-têtes : content-type=${servedA.headers.get('content-type')} ; cache-control=${servedA.headers.get('cache-control')} ; x-frame-options=${servedA.headers.get('x-frame-options') ?? 'absent'}`);
  check('fichier versionné mis en cache long, servi en PDF', servedA.headers.get('content-type') === 'application/pdf' && /max-age=31536000/.test(servedA.headers.get('cache-control') ?? ''));
  const dl = await fetch(`${publicUrl(vA.bucket, vA.storage_path)}?download=CV-Adjoumani.pdf`);
  check('téléchargement : même objet, nom de fichier imposé', /attachment/.test(dl.headers.get('content-disposition') ?? '') && sha256(Buffer.from(await dl.arrayBuffer())) === sha256(PDF_A));
  const anonTable = await rest('cv_versions?select=*');
  const userTable = await rest('cv_versions?select=*', userAal2);
  check('historique illisible par un anonyme ou un utilisateur', anonTable.status >= 400 && Array.isArray(userTable.body) && userTable.body.length === 0, `${anonTable.status} / ${userTable.body?.length}`);
  const write = await rest(`cv_versions?id=eq.${vA.id}`, adminAal2, { method: 'PATCH', body: '{"status":"archived"}' });
  check('écriture directe dans cv_versions refusée, même admin MFA', write.status >= 400, `HTTP ${write.status}`);
  check('liste du bucket vide pour un anonyme', (await list('portfolio-public-documents')).items?.length === 0);

  const b = await uploadCv(PDF_B, adminAal2, vA.id, 'CV-B.pdf');
  const vB = b.body?.version;
  check('publication B → 201, A archivée', b.status === 201 && (await active())?.id === vB?.id);
  check('ancien fichier A conservé et toujours accessible', (await fetch(publicUrl(vA.bucket, vA.storage_path))).status === 200 && docObjects() === 2);
  check('une seule version active', activeCount() === 1);
  const hist = await rest('cv_versions?select=id,status,sha256,uploaded_by,activated_by,uploaded_at,activated_at,original_filename&order=uploaded_at.desc', adminAal2);
  check('historique complet pour l’admin MFA (auteur, dates, empreinte, statut)', hist.body?.length === 2 && hist.body[0].uploaded_by === adminUser.id && hist.body[0].sha256 === sha256(PDF_B) && hist.body[1].status === 'archived' && hist.body[0].original_filename === 'CV-B.pdf');
  check('historique illisible par l’admin sans MFA', (await rest('cv_versions?select=id', adminAal1)).body?.length === 0);

  console.log('▶ Versions immuables, échecs');
  const overwrite = await put(vB.bucket, vB.storage_path, PDF_C, adminAal2, 'application/pdf', true);
  check('écrasement d’une version refusé, même admin MFA', !overwrite.ok && sha256(Buffer.from(await (await fetch(publicUrl(vB.bucket, vB.storage_path))).arrayBuffer())) === sha256(PDF_B), `HTTP ${overwrite.status}`);
  await remove(vA.bucket, vA.storage_path, adminAal2);
  check('suppression d’une version référencée sans effet', (await fetch(publicUrl(vA.bucket, vA.storage_path))).status === 200);
  const stale = await uploadCv(PDF_C, adminAal2, vA.id);
  check('version attendue périmée → 409, objet retiré, version active inchangée', stale.status === 409 && stale.body?.code === 'CV_CONFLICT' && (await active())?.id === vB.id && docObjects() === 2, `${stale.status} ${stale.body?.code} ; ${docObjects()} objets`);
  const missing = await rpc('cv_publish_version', { p_id: crypto.randomUUID(), p_storage_path: `cv/versions/${crypto.randomUUID()}.pdf`, p_size_bytes: 10, p_sha256: 'b'.repeat(64), p_original_filename: null, p_expected_active: vB.id }, adminAal2);
  check('publication sans objet réel refusée, version active inchangée', missing.status >= 400 && (await active())?.id === vB.id, `HTTP ${missing.status}`);

  const orphanId = crypto.randomUUID();
  const orphanPath = `cv/versions/${orphanId}.pdf`;
  await put('portfolio-public-documents', orphanPath, PDF_C, adminAal2);
  const wrongSize = await rpc('cv_publish_version', { p_id: orphanId, p_storage_path: orphanPath, p_size_bytes: 1, p_sha256: 'b'.repeat(64), p_original_filename: null, p_expected_active: vB.id }, adminAal2);
  check('taille annoncée différente de l’objet réel → refus', wrongSize.status >= 400);
  const cleanOrphan = await remove('portfolio-public-documents', orphanPath, adminAal2);
  check('objet orphelin supprimable (procédure de nettoyage)', cleanOrphan.ok && docObjects() === 2);

  console.log('▶ Concurrence réelle entre remplacements');
  const racers = await Promise.all(['D', 'E', 'F', 'G'].map(l => uploadCv(makePdf(`CV concurrent ${l}`), adminAal2, vB.id)));
  const wins = racers.filter(r => r.status === 201), conflicts = racers.filter(r => r.status === 409);
  check('4 remplacements simultanés : un seul gagnant, trois conflits', wins.length === 1 && conflicts.length === 3, racers.map(r => r.status).join(','));
  check('toujours une seule version active, la gagnante', activeCount() === 1 && (await active())?.id === wins[0]?.body?.version?.id);
  check('aucun objet orphelin après la course', docObjects() === 3, `${docObjects()} objets`);
  const vWin = wins[0].body.version;
  const dup = await uploadCv(makePdf('CV concurrent inutile'), adminAal2, vB.id);
  check('nouveau remplacement avec référence périmée refusé', dup.status === 409);
  const parallelRpc = await Promise.all([restoreCv(vA.id, adminAal2, vWin.id), restoreCv(vB.id, adminAal2, vWin.id)]);
  check('2 restaurations simultanées : une seule aboutit', parallelRpc.filter(r => r.status === 200).length === 1 && activeCount() === 1, parallelRpc.map(r => r.status).join(','));

  console.log('▶ Restauration et redémarrages');
  const current = await active();
  const target = current.id === vA.id ? vB : vA;
  const restored = await restoreCv(target.id, adminAal2, current.id);
  check('restauration d’une version archivée', restored.status === 200 && (await active())?.id === target.id);
  check('restauration sans MFA refusée', (await restoreCv(vWin.id, adminAal1, target.id)).status === 403);
  await stopApi();
  check('API arrêtée : le CV reste lisible par les visiteurs', (await active())?.id === target.id);
  await startApi();
  check('redémarrage du backend : version active conservée', (await active())?.id === target.id);
  compose('restart', 'storage', 'rest', 'auth');
  await waitFor('Auth', 'http://127.0.0.1:58331/health');
  await waitFor('PostgREST', 'http://127.0.0.1:58332/');
  await waitFor('Storage', 'http://127.0.0.1:58333/status');
  await sleep(1500);
  check('redémarrage de Supabase : référence et fichier conservés', (await active())?.id === target.id && (await fetch(publicUrl(target.bucket, target.storage_path))).status === 200);

  console.log('▶ Protections P0.A1 sur la pile réelle');
  const projectWrite = await rest('projects', userAal2, { method: 'POST', body: '{"title":"pirate"}' });
  check('utilisateur ordinaire : écriture dans projects refusée', projectWrite.status >= 400, `HTTP ${projectWrite.status}`);
  const promote = await rest('admin_users', userAal2, { method: 'POST', body: JSON.stringify({ user_id: plainUser.id }) });
  check('utilisateur ordinaire : auto-promotion administrateur refusée', promote.status >= 400, `HTTP ${promote.status}`);
  check('rpc is_portfolio_admin : admin vrai, utilisateur faux', (await rpc('is_portfolio_admin', {}, adminAal1)).body === true && (await rpc('is_portfolio_admin', {}, userAal1)).body === false);

  await runAiScenarios({
    API, check, psql, sqlValue, compose, stopApi, startApi, waitFor, sleep, rest, rpc,
    fakes: aiFakes, apiLogs: () => apiLogs, tokens: { adminAal2, adminAal1, userAal2 },
  });

  if (process.env.PLAYWRIGHT_CORE_DIR) {
    const { runBrowserScenarios } = await import('./browser.mjs');
    await runBrowserScenarios({
      ROOT, GATEWAY, API, ANON_KEY, check, gatewayState, sha256, makePdf, totp, adminTotp,
      active, psql, stopApi, startApi, publicUrl, fakes: aiFakes, sqlValue,
    });
  }

  console.log('▶ Retour arrière du centre IA');
  psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(ROOT, 'supabase/rollback/20261030170000_ai_control_center.down.sql'), 'utf8')}`, ['--single-transaction']);
  check('après retour arrière IA : tables, clés Vault et rôle retirés',
    sqlValue("select count(*) from information_schema.tables where table_name like 'ai\\_%';") === '0'
    && sqlValue("select count(*) from vault.secrets where name like 'ai_provider_%';") === '0'
    && sqlValue("select count(*) from pg_roles where rolname = 'ai_backend';") === '0');

  console.log('▶ Retour arrière des migrations du CV');
  for (const file of ['20261030150100_project_images_no_public_listing', '20261030150000_cv_public_document']) {
    psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(ROOT, 'supabase/rollback', `${file}.down.sql`), 'utf8')}`, ['--single-transaction']);
  }
  psql('supabase_admin', "notify pgrst, 'reload schema';");
  await sleep(1500);
  const down = await rpc('cv_active', {});
  check('après retour arrière : fonction absente (le site retombe sur /cv.pdf), historique conservé', down.status === 404 && down.body?.code === 'PGRST202' && Number(sqlValue('select count(*) from public.cv_versions;')) >= 3, `HTTP ${down.status} ${down.body?.code}`);
}

const keep = process.argv.includes('--keep');
main().catch(err => {
  // Cause réseau et emplacement : un « fetch failed » seul ne dit pas quel appel a échoué
  const cause = err.cause ? ` — ${err.cause.code ?? err.cause.message}` : '';
  const where = (err.stack ?? '').split('\n').filter(l => /stack[\\/](run|ai|browser)\.mjs/.test(l))
    .map(l => l.trim().replace(/^at /, '').replace(/file:\/\/\S*[\\/]/, '')).join(' ← ');
  check(`ERREUR DU BANC : ${err.message}${cause} ${where}`, false);
}).finally(async () => {
  await stopApi().catch(() => {});
  await Promise.all(Object.values(aiFakes).map(fake => fake.close())).catch(() => {});
  gateway.close();
  gateway.closeAllConnections?.();
  if (apiBuild) fs.rmSync(apiBuild, { recursive: true, force: true });
  if (!keep) compose('down', '-v', '--remove-orphans');
  const failed = results.filter(r => !r.ok).length;
  console.log(`\nBILAN : ${results.length - failed} / ${results.length} vérifications réussies`);
  process.exit(failed ? 1 : 0);
});

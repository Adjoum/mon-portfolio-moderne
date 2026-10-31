#!/usr/bin/env node
// Recette locale du centre multi-IA : API dans Docker, frontend Vite, Supabase local isolé.
//
//   node scripts/recette.mjs up       prépare et démarre tout (réexécutable, données conservées)
//   node scripts/recette.mjs verify   contrôle l'environnement, sans aucun appel à un fournisseur IA
//   node scripts/recette.mjs down     arrête tout, données conservées
//   node scripts/recette.mjs reset    arrête tout et efface la base de recette, clés de test comprises
//
// Aucune valeur de .env, .env.local ou .env.docker n'est utilisée : elles visent la production
// (verify lit seulement l'adresse de .env, pour contrôler que la recette ne la contient pas).
// Les secrets, tous jetables, sont générés une fois dans secrets/recette, .env.docker.test et
// env/recette/.env.recette.local, tous ignorés par Git et par Docker.
// Le compte administrateur est créé SANS facteur TOTP : vous l'enrôlez dans le dashboard.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRETS = path.join(ROOT, 'secrets', 'recette');
const TLS = path.join(SECRETS, 'tls');
const STACK_ENV = path.join(SECRETS, 'stack.env');
const VAULT_KEY = path.join(SECRETS, 'vault-root.key');
const ADMIN_FILE = path.join(SECRETS, 'compte-admin.txt');
const VITE_LOG = path.join(SECRETS, 'vite.log');
const VITE_PID = path.join(SECRETS, 'vite.pid');
const API_ENV = path.join(ROOT, '.env.docker.test');
const WEB_ENV = path.join(ROOT, 'env', 'recette', '.env.recette.local');

const PROJECT = 'portfolio-recette';
const ADMIN_EMAIL = 'admin@recette.test';
const WEB = 'http://localhost:5173';
const API = 'http://127.0.0.1:5000';
const PUBLIC_SUPABASE = 'http://localhost:58521';
const GATEWAY = 'http://127.0.0.1:58521';
const MODELS = { openai: 'gpt-6-astra', groq: 'openai/gpt-oss-120b' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const random = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
const step = text => console.log(`▶ ${text}`);

function signJwt(payload, secret) {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

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

function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2')]));
}
const envFile = values => `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;

// ── Configuration générée, une seule fois ───────────────────
function findOpenssl() {
  const candidates = [process.env.OPENSSL, 'openssl', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'];
  const found = candidates.find(bin => bin && spawnSync(bin, ['version'], { encoding: 'utf8' }).status === 0);
  if (!found) throw new Error('OpenSSL introuvable : installez Git pour Windows ou définissez OPENSSL');
  return found;
}

/** Autorité jetable : sa clé est supprimée aussitôt, elle ne peut rien signer d'autre */
function ensureCertificates() {
  if (fs.existsSync(path.join(TLS, 'server.crt')) && fs.existsSync(path.join(TLS, 'ca.crt'))) return;
  const bin = findOpenssl();
  const file = name => path.join(TLS, name);
  const run = args => {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`openssl : ${r.stderr.slice(-400)}`);
  };
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-keyout', file('ca.key'), '-out', file('ca.crt'), '-subj', '/CN=Autorite locale recette portfolio',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('server.key'), '-out', file('server.csr'), '-subj', '/CN=recette-supabase']);
  fs.writeFileSync(file('server.ext'), 'subjectAltName=DNS:db,DNS:gateway\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  run(['x509', '-req', '-in', file('server.csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-CAcreateserial', '-days', '825', '-sha256', '-extfile', file('server.ext'), '-out', file('server.crt')]);
  for (const name of ['ca.key', 'ca.srl', 'server.csr', 'server.ext']) fs.rmSync(file(name), { force: true });
}

function ensureConfig() {
  fs.mkdirSync(TLS, { recursive: true });
  if (!fs.existsSync(STACK_ENV)) {
    const jwtSecret = random();
    const now = Math.floor(Date.now() / 1000);
    const key = role => signJwt({ role, iss: 'supabase-recette-locale', iat: now, exp: now + 5 * 365 * 24 * 3600 }, jwtSecret);
    fs.writeFileSync(STACK_ENV, envFile({
      API_ENV_FILE: '.env.docker.test',
      RECETTE_PUBLIC_URL: PUBLIC_SUPABASE,
      RECETTE_JWT_SECRET: jwtSecret,
      RECETTE_DB_PASSWORD: random(),
      RECETTE_AI_DB_PASSWORD: random(),
      RECETTE_ANON_KEY: key('anon'),
      RECETTE_SERVICE_KEY: key('service_role'),
      MONGO_USER: 'admin',
      MONGO_PASSWORD: random(),
      MONGO_UI_USER: 'admin',
      MONGO_UI_PASSWORD: random(),
      // Service frontend de docker-compose.yml : non démarré, valeurs requises par la lecture du fichier
      VITE_API_URL: 'http://localhost:5000/api',
      VITE_SUPABASE_URL: PUBLIC_SUPABASE,
      VITE_SUPABASE_ANON_KEY: 'non-utilise-en-recette',
    }));
  }
  const stack = readEnv(STACK_ENV);
  if (!fs.existsSync(API_ENV)) {
    fs.writeFileSync(API_ENV, `# Recette locale, généré par scripts/recette.mjs : valeurs jetables, aucune clé de fournisseur IA.
# Contexte de l'assistant : PINECONE_* vides par défaut (voir le document 20, §5).
${envFile({
    FRONTEND_URL: WEB,
    MONGODB_URI: `mongodb://${stack.MONGO_USER}:${stack.MONGO_PASSWORD}@mongo:27017/blog?authSource=admin`,
    JWT_SECRET: random(),
    JWT_EXPIRES_IN: '7d',
    ADMIN_BOOTSTRAP_ENABLED: 'false',
    SUPABASE_URL: 'https://gateway:8443',
    SUPABASE_ANON_KEY: stack.RECETTE_ANON_KEY,
    SUPABASE_JWT_SECRET: stack.RECETTE_JWT_SECRET,
    AI_ENABLED: 'true',
    AI_DATABASE_URL: `postgresql://ai_backend:${stack.RECETTE_AI_DB_PASSWORD}@db:5432/postgres`,
    AI_DATABASE_CA_FILE: '/run/certs/supabase-ca.crt',
    AI_LOG_HMAC_SECRET: random(),
    // Le dashboard interroge l'API en continu : limite relevée pour une séance de recette
    ADMIN_RATE_LIMIT_MAX: '2000',
    KNOWLEDGE_WRITE_ENABLED: 'false',
    PINECONE_API_KEY: '',
    PINECONE_INDEX: '',
  })}`);
  }
  if (!fs.existsSync(WEB_ENV)) {
    fs.writeFileSync(WEB_ENV, `# Recette locale, généré par scripts/recette.mjs (Supabase local, jamais la production)\n${envFile({
      VITE_API_URL: 'http://localhost:5000/api',
      VITE_SUPABASE_URL: PUBLIC_SUPABASE,
      VITE_SUPABASE_ANON_KEY: stack.RECETTE_ANON_KEY,
    })}`);
  }
  ensureCertificates();
  // Clé racine de Vault, 64 caractères hexadécimaux : voir env/recette/compose.yml
  if (!fs.existsSync(VAULT_KEY)) fs.writeFileSync(VAULT_KEY, random());
  return stack;
}

// ── Docker ──────────────────────────────────────────────────
const compose = (...args) => spawnSync('docker',
  ['compose', '-p', PROJECT, '--env-file', STACK_ENV, '-f', 'docker-compose.yml', '-f', 'env/recette/compose.yml', '--profile', 'dev', ...args],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
function mustCompose(...args) {
  const r = compose(...args);
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} : ${r.stderr.slice(-1200)}`);
  return r.stdout;
}
function psql(user, sql, extra = []) {
  const r = spawnSync('docker', ['compose', '-p', PROJECT, '--env-file', STACK_ENV, '-f', 'docker-compose.yml', '-f', 'env/recette/compose.yml',
    'exec', '-T', 'db', 'psql', '-X', '-q', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extra],
  { cwd: ROOT, encoding: 'utf8', input: sql, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psql (${user}) : ${r.stderr.slice(-800)}`);
  return r.stdout.trim();
}
const sqlValue = sql => psql('supabase_admin', sql, ['-At']);

async function waitFor(label, url, init) {
  for (let i = 0; i < 180; i++) {
    try { if ((await fetch(url, init)).status < 500) return; } catch { /* attente */ }
    await sleep(1000);
  }
  throw new Error(`${label} indisponible : ${compose('logs', '--tail', '15').stdout.slice(-1500)}`);
}

// ── Mise en place de la base : même ordre que la mise en production ─
function applySchema(stack) {
  step('État de départ de type production, puis les 9 migrations dans leur ordre de production');
  psql('supabase_admin', "insert into storage.buckets (id, name, public) values ('project-images', 'project-images', true), ('avatars', 'avatars', false) on conflict do nothing;");
  psql('postgres', fs.readFileSync(path.join(ROOT, 'supabase/tests/rls/10_production_like_state.sql'), 'utf8'));
  const migrations = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(migrations, file), 'utf8')}`, ['--single-transaction']);
    console.log(`  ${file}`);
  }
  psql('supabase_admin', `alter role ai_backend login password '${stack.RECETTE_AI_DB_PASSWORD}';`);
  psql('supabase_admin', "notify pgrst, 'reload schema';");
}

/** Bases de recette créées avant une correction de l'état initial : colonnes ajoutées, rien d'effacé */
function alignSchema() {
  step('Alignement de la base sur le schéma réel (AI Lab), données, comptes et clés conservés');
  psql('postgres', `set client_min_messages = warning;\n${fs.readFileSync(path.join(ROOT, 'env/recette/schema-alignment.sql'), 'utf8')}`, ['--single-transaction']);
}

async function authAdmin(pathname, stack, init = {}) {
  const res = await fetch(`${GATEWAY}/auth/v1${pathname}`, {
    ...init,
    headers: { apikey: stack.RECETTE_SERVICE_KEY, Authorization: `Bearer ${stack.RECETTE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`auth ${pathname} : HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function ensureAdmin(stack) {
  const password = fs.existsSync(ADMIN_FILE)
    ? /Mot de passe : (.+)/.exec(fs.readFileSync(ADMIN_FILE, 'utf8'))[1].trim()
    : `${crypto.randomBytes(18).toString('base64url')}-R1!`;
  if (sqlValue(`select count(*) from public.admin_users where email = '${ADMIN_EMAIL}';`) === '0') {
    const user = await authAdmin('/admin/users', stack, { method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL, password, email_confirm: true }) });
    psql('supabase_admin', `insert into public.admin_users (user_id, email) values ('${user.id}', '${ADMIN_EMAIL}');`);
  }
  fs.writeFileSync(ADMIN_FILE, `Compte de recette, base locale uniquement\nURL : ${WEB}/admin\nE-mail : ${ADMIN_EMAIL}\nMot de passe : ${password}\n`);
}

// ── Vite : détaché, survit à la fin de cette commande ───────
const webUp = async () => { try { return (await fetch(`${WEB}/`)).ok; } catch { return false; } };
async function startVite() {
  if (await webUp()) return;
  const log = fs.openSync(VITE_LOG, 'a');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'recette', '--port', '5173', '--strictPort'],
    { cwd: ROOT, detached: true, stdio: ['ignore', log, log], windowsHide: true });
  fs.writeFileSync(VITE_PID, String(child.pid));
  child.unref();
  for (let i = 0; i < 60; i++) {
    if (await webUp()) return;
    await sleep(1000);
  }
  throw new Error(`Vite non démarré : ${fs.readFileSync(VITE_LOG, 'utf8').slice(-600)}`);
}
function stopVite() {
  if (!fs.existsSync(VITE_PID)) return;
  spawnSync('taskkill', ['/PID', fs.readFileSync(VITE_PID, 'utf8').trim(), '/T', '/F'], { encoding: 'utf8' });
  fs.rmSync(VITE_PID, { force: true });
}

async function up() {
  const stack = ensureConfig();
  step('Base de données (TLS actif)');
  mustCompose('up', '-d', '--wait', 'db');
  for (let i = 0; i < 90; i++) {
    if (compose('exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', "select 1 from pg_roles where rolname = 'authenticated'").stdout.includes('1')) break;
    await sleep(1000);
  }
  const ready = () => sqlValue("select to_regclass('public.ai_settings') is not null and exists (select 1 from pg_roles where rolname = 'ai_backend' and rolcanlogin);") === 't';
  const started = ready();
  if (!started) {
    if (sqlValue("select to_regclass('public.projects') is not null;") === 't') throw new Error('Base de recette incomplète (mise en place interrompue) : lancez « node scripts/recette.mjs reset », puis « up ».');
    await sleep(4000);  // l'image redémarre Postgres après ses scripts d'initialisation
    psql('supabase_admin', ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin'].map(r => `alter user ${r} with password '${stack.RECETTE_DB_PASSWORD}';`).join('\n'));
  }
  step('Auth, PostgREST, Storage, passerelle');
  mustCompose('up', '-d', 'auth', 'rest', 'storage', 'gateway');
  await waitFor('Auth', `${GATEWAY}/auth/v1/health`);
  await waitFor('PostgREST', `${GATEWAY}/rest/v1/`, { headers: { apikey: stack.RECETTE_ANON_KEY } });
  await waitFor('Storage', `${GATEWAY}/storage/v1/status`);
  if (!started) applySchema(stack);
  alignSchema();
  step('API, compilation LaTeX isolée et MongoDB dans Docker (images construites depuis le code courant)');
  mustCompose('up', '-d', '--build', 'mongo', 'latex-runner', 'api');
  await waitFor('API', `${API}/api/health`);
  await ensureAdmin(stack);
  step('Frontend Vite (mode recette)');
  await startVite();
  console.log(`
Recette prête
  Dashboard : ${WEB}/admin
  Compte    : ${path.relative(ROOT, ADMIN_FILE)}
  Contrôle  : node scripts/recette.mjs verify`);
}

// ── Contrôles : aucun appel à un fournisseur IA ─────────────
async function verify() {
  const stack = readEnv(STACK_ENV);
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
  };

  const running = new Set(mustCompose('ps', '--status', 'running', '--format', '{{.Service}}').split(/\r?\n/).filter(Boolean));
  const missing = ['db', 'auth', 'rest', 'storage', 'gateway', 'mongo', 'latex-runner', 'api'].filter(s => !running.has(s));
  check('huit conteneurs en marche', missing.length === 0, missing.length ? `manquants : ${missing.join(', ')}` : '');

  const apiEnv = fs.readFileSync(API_ENV, 'utf8');
  const webEnv = fs.readFileSync(WEB_ENV, 'utf8');
  const productionHost = fs.existsSync(path.join(ROOT, '.env'))
    ? (() => { try { return new URL(readEnv(path.join(ROOT, '.env')).VITE_SUPABASE_URL ?? '').host; } catch { return ''; } })()
    : '';
  check('aucune adresse de production dans la configuration de recette', !productionHost || !`${apiEnv}${webEnv}`.includes(productionHost));
  check('aucune clé de fournisseur IA dans l’environnement de l’API', !/^(OPENAI|GROQ|XAI|GEMINI|OPENROUTER|ANTHROPIC)[A-Z_]*KEY=./im.test(apiEnv));

  const health = await fetch(`${API}/api/health`).then(r => r.status).catch(() => 0);
  check('API : /api/health', health === 200, `HTTP ${health}`);
  const features = await fetch(`${API}/api/ai/features`).then(r => r.json()).then(b => b.features).catch(() => null);
  const featureCount = Array.isArray(features) ? features.length : Object.keys(features ?? {}).length;
  check('API : 9 fonctionnalités au registre', featureCount === 9, `${featureCount}`);

  // Aperçu PDF : service isolé, joint uniquement par l'API (contrôles complets : scripts/latex-recette.mjs)
  const runner = JSON.parse(spawnSync('docker', ['inspect', 'recette-latex-runner'], { encoding: 'utf8' }).stdout || '[]')[0];
  const host = runner?.HostConfig ?? {};
  const runnerNets = Object.keys(runner?.NetworkSettings?.Networks ?? {});
  const internal = runnerNets.length === 1
    && JSON.parse(spawnSync('docker', ['network', 'inspect', runnerNets[0]], { encoding: 'utf8' }).stdout || '[]')[0]?.Internal === true;
  check('latex-runner : lecture seule, aucune capacité, no-new-privileges, réseau interne, aucun port',
    host.ReadonlyRootfs === true && host.CapDrop?.includes('ALL') && !host.CapAdd?.length && host.SecurityOpt?.includes('no-new-privileges:true')
    && internal && !Object.keys(host.PortBindings ?? {}).length && !host.Privileged);
  check('latex-runner : aucune variable secrète', !(runner?.Config?.Env ?? []).some(e => /KEY|SECRET|TOKEN|PASSWORD|DATABASE|MONGO|SUPABASE/i.test(e.split('=')[0])));
  // Adresse fictive (plage de test 198.18.0.0/15) : vos propres compilations ne sont pas décomptées
  const compileApi = body => fetch(`${API}/api/cv/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.0.1' }, body: JSON.stringify(body) });
  const pdf = await compileApi({ code: '\\documentclass{article}\\usepackage[utf8]{inputenc}\\begin{document}Recette é\\end{document}' })
    .then(async r => ({ status: r.status, type: r.headers.get('content-type'), head: Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString('latin1') })).catch(() => ({ status: 0 }));
  check('aperçu PDF : document compilé par l’API via latex-runner', pdf.status === 200 && pdf.type === 'application/pdf' && pdf.head === '%PDF-', `HTTP ${pdf.status}`);
  const refused = await compileApi({ code: '\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\end{document}' }).then(r => r.json()).catch(() => null);
  check('aperçu PDF : lecture de fichier refusée (\\input)', refused?.code === 'LATEX_FORBIDDEN_COMMAND', refused?.code ?? 'aucune réponse');

  // AI Lab : colonnes du schéma réel, triées comme le dashboard
  const ailabColumns = sqlValue("select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'ailab_capabilities' and column_name in ('createdat', 'updatedat')) or (table_name = 'ailab_projects' and column_name in ('createdat', 'updatedat', 'technologies', 'color', 'imageurl', 'githuburl', 'liveurl', 'demourl', 'demoavailable', 'featured')));");
  check('AI Lab : colonnes du schéma réel présentes (createdat, updatedat, technologies…)', ailabColumns === '12', `${ailabColumns}/12`);
  const ailabAnon = await fetch(`${GATEWAY}/rest/v1/ailab_capabilities?select=*&order=sortorder.asc,createdat.desc`, { headers: { apikey: stack.RECETTE_ANON_KEY } }).then(r => r.status).catch(() => 0);
  check('AI Lab : tri par createdat accepté par PostgREST', ailabAnon === 200, `HTTP ${ailabAnon}`);

  const ssl = sqlValue("select count(*) filter (where s.ssl), count(*) from pg_stat_activity a join pg_stat_ssl s using (pid) where a.usename = 'ai_backend';").split('|');
  check('API → Postgres : connexions ai_backend chiffrées (certificat vérifié par l’API)', Number(ssl[1]) > 0 && ssl[0] === ssl[1], `${ssl[0]}/${ssl[1]}`);
  check('base : les 9 migrations sont appliquées (schéma IA, 6 fournisseurs, 9 affectations)',
    sqlValue('select (select count(*) from public.ai_providers), (select count(*) from public.ai_feature_assignments);') === '6|9');
  // État de la recette : il évolue normalement avec vos essais, ce ne sont pas des contrôles
  const info = (label, value) => console.log(`ℹ ${label} : ${value}`);
  info('fonctionnalités actives', sqlValue('select count(*) from public.ai_feature_assignments where enabled;'));
  info('clés dans Vault', sqlValue("select count(*) from vault.secrets where name like 'ai_provider_%';"));
  info('appels à un fournisseur enregistrés (sondes et générations)', sqlValue("select count(*) from public.ai_usage_events where outcome <> 'blocked';"));
  const assigned = sqlValue('select provider_id, model_id, count(*) from public.ai_feature_assignments group by provider_id, model_id order by provider_id;');
  check('affectations initiales : gpt-6-astra (OpenAI) et gpt-oss-120b (Groq)',
    assigned.includes(`openai|${MODELS.openai}|`) && assigned.includes(`groq|${MODELS.groq}|`), assigned.replace(/\n/g, ' ; '));
  check('compte administrateur prêt', sqlValue(`select count(*) from public.admin_users where email = '${ADMIN_EMAIL}';`) === '1');
  info('facteurs TOTP de ce compte (0 : à enrôler dans le dashboard)',
    sqlValue(`select count(*) from public.admin_users a join auth.mfa_factors f on f.user_id = a.user_id where a.email = '${ADMIN_EMAIL}' and f.status = 'verified';`));

  const web = await fetch(`${WEB}/admin`).then(r => r.status).catch(() => 0);
  check('frontend : /admin servi par Vite', web === 200, `HTTP ${web}`);
  const client = await fetch(`${WEB}/src/lib/supabase.ts`).then(r => r.text()).catch(() => '');
  check('frontend : relié au Supabase local, pas à la production', client.includes(PUBLIC_SUPABASE) && (!productionHost || !client.includes(productionHost)));
  const inkspace = await fetch(`${WEB}/inkspace/config.js`).then(r => r.text()).catch(() => '');
  check('InkSpace : relié à l’API locale', inkspace.includes('http://localhost:5000/api'));
  const preflight = await fetch(`${API}/api/ai/features`, { method: 'OPTIONS', headers: { Origin: WEB, 'Access-Control-Request-Method': 'GET' } }).catch(() => null);
  check('API : CORS ouvert au frontend de recette', preflight?.headers.get('access-control-allow-origin') === WEB);

  // Compte temporaire : le compte de recette garde son enrôlement TOTP intact pour vous
  const email = `controle-${crypto.randomUUID()}@recette.test`;
  const password = random(16);
  const user = await authAdmin('/admin/users', stack, { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  try {
    psql('supabase_admin', `insert into public.admin_users (user_id, email) values ('${user.id}', '${email}');`);
    const auth = async (pathname, token, body) => {
      const res = await fetch(`${GATEWAY}/auth/v1${pathname}`, { method: 'POST', headers: { apikey: stack.RECETTE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`auth ${pathname} : HTTP ${res.status}`);
      return json;
    };
    const overview = token => fetch(`${API}/api/admin/ai/overview`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const aal1 = (await auth('/token?grant_type=password', stack.RECETTE_ANON_KEY, { email, password })).access_token;
    const anonymous = await overview();
    const noMfa = await overview(aal1);
    const factor = await auth('/factors', aal1, { factor_type: 'totp', friendly_name: 'controle' });
    const challenge = await auth(`/factors/${factor.id}/challenge`, aal1, {});
    const aal2 = (await auth(`/factors/${factor.id}/verify`, aal1, { challenge_id: challenge.id, code: totp(factor.totp.secret) })).access_token;
    const withMfa = await overview(aal2);
    const body = await withMfa.json().catch(() => null);
    check('centre IA : anonyme refusé', anonymous.status === 401, `HTTP ${anonymous.status}`);
    check('centre IA : administrateur sans MFA refusé', noMfa.status === 403, `HTTP ${noMfa.status}`);
    check('centre IA : administrateur avec MFA accepté (jeton vérifié par l’API, HTTPS, RPC)', withMfa.status === 200, `HTTP ${withMfa.status}`);
    check('centre IA : les 6 fournisseurs affichés', body?.providers?.length === 6, `${body?.providers?.length}`);

    // AI Lab, comme le dashboard (AILabManager.tsx) : lecture triée par createdat, ajout puis retrait
    const rest = (pathname, init = {}) => fetch(`${GATEWAY}/rest/v1/${pathname}`, {
      ...init, headers: { apikey: stack.RECETTE_ANON_KEY, Authorization: `Bearer ${aal2}`, 'Content-Type': 'application/json', ...init.headers },
    });
    const projectSelect = 'id,slug,title,technologies,color,imageurl,demoavailable,featured,active,sortorder,createdat,updatedat,ailab_project_capabilities(capability_id,ailab_capabilities(id,slug,title,createdat,updatedat))';
    const lists = await Promise.all([
      rest('ailab_capabilities?select=*&order=sortorder.asc,createdat.desc'),
      rest(`ailab_projects?select=${projectSelect}&order=sortorder.asc,createdat.desc`),
    ]);
    check('AI Lab : listes du dashboard chargées (administrateur avec MFA)', lists.every(r => r.status === 200), lists.map(r => r.status).join(', '));
    const slug = `controle-${crypto.randomUUID()}`;
    const created = await rest('ailab_capabilities', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ slug, icon: 'Brain', title: 'Contrôle', description: 'Ligne temporaire de verify' }) });
    const row = (await created.json().catch(() => []))[0];
    await rest(`ailab_capabilities?slug=eq.${slug}`, { method: 'DELETE' });
    check('AI Lab : ajout d’une capacité (createdat et updatedat renseignés), puis retrait', created.status === 201 && !!row?.createdat && !!row?.updatedat, `HTTP ${created.status}`);
  } finally {
    await authAdmin(`/admin/users/${user.id}`, stack, { method: 'DELETE', body: '{}' });
  }
  check('compte de contrôle supprimé', sqlValue("select count(*) from public.admin_users where email like 'controle-%';") === '0');

  const logs = compose('logs', '--no-log-prefix', 'api').stdout;
  check('journaux API : aucune erreur de configuration IA', !/\[AI_STORE\].*(erreur|error|non synchronisé)/i.test(logs));

  console.log(failures ? `\n${failures} contrôle(s) en échec` : '\nTous les contrôles sont réussis. Ce contrôle n’appelle aucun fournisseur IA.');
  process.exitCode = failures ? 1 : 0;
}

function down(wipe) {
  stopVite();
  if (fs.existsSync(STACK_ENV)) mustCompose('down', '--remove-orphans', ...(wipe ? ['-v'] : []));
  console.log(wipe ? 'Recette arrêtée, base effacée (clés de test comprises).' : 'Recette arrêtée, données conservées.');
}

const commands = { up, verify, down: () => down(false), reset: () => down(true) };
const command = commands[process.argv[2]];
if (!command) {
  console.error('Usage : node scripts/recette.mjs up | verify | down | reset');
  process.exit(2);
}
try {
  await command();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

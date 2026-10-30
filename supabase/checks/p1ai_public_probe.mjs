#!/usr/bin/env node
// Inventaire PUBLIC d'un projet Supabase : uniquement ce qu'un visiteur anonyme peut lire,
// avec la clé publique « anon ». Aucune écriture, aucun contenu affiché : statuts et nombres.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<clé anon> node supabase/checks/p1ai_public_probe.mjs
//
// Complète l'inventaire SQL (p1ai_production_inventory.sql), qui exige un accès au SQL Editor.

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('SUPABASE_URL et SUPABASE_ANON_KEY requis');
  process.exit(2);
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
const timeout = () => AbortSignal.timeout(15000);

async function status(path, init = {}) {
  try {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: timeout() });
    return { status: res.status, headers: res.headers, body: await res.text() };
  } catch (err) {
    return { status: 0, error: err.cause?.code ?? err.message, headers: new Headers(), body: '' };
  }
}

/** Fonction SQL exposée ? 404 PGRST202 : absente. Appel sans effet (fonctions de lecture uniquement). */
async function rpcExists(fn) {
  const r = await status(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r.status === 404) return 'absente';
  if (r.status >= 200 && r.status < 300) return 'présente (lisible par anon)';
  return `présente (HTTP ${r.status})`;
}

/** Table lisible par anon ? Requête HEAD avec décompte : aucune ligne transférée */
async function tableAccess(table) {
  const r = await status(`/rest/v1/${table}?select=*`, { method: 'HEAD', headers: { Prefer: 'count=exact', Range: '0-0' } });
  const total = r.headers.get('content-range')?.split('/')[1];
  if (r.status === 404) return 'absente ou non exposée';
  if (r.status === 401 || r.status === 403) return `refusée (HTTP ${r.status})`;
  if (r.status >= 200 && r.status < 300) return total === '0' ? 'lisible, 0 ligne visible' : `LISIBLE par anon : ${total} ligne(s)`;
  return `HTTP ${r.status}`;
}

const report = { project: new URL(url).host.split('.')[0], at: new Date().toISOString() };

const settings = await status('/auth/v1/settings');
try {
  const s = JSON.parse(settings.body);
  report.auth = {
    signupDisabled: s.disable_signup ?? null,
    emailAutoconfirm: s.mailer_autoconfirm ?? null,
    externalProvidersEnabled: Object.entries(s.external ?? {}).filter(([, v]) => v === true).map(([k]) => k),
  };
} catch {
  report.auth = { error: `HTTP ${settings.status}` };
}

const jwks = await status('/auth/v1/.well-known/jwks.json');
try {
  const keys = JSON.parse(jwks.body).keys ?? [];
  report.jwtSigning = keys.length ? `asymétrique (${[...new Set(keys.map(k => k.alg ?? k.kty))].join(', ')}, ${keys.length} clé(s))` : 'secret partagé HS256 (JWKS vide)';
} catch {
  report.jwtSigning = `JWKS HTTP ${jwks.status}`;
}

report.functions = {};
for (const fn of ['is_portfolio_admin', 'is_portfolio_admin_mfa', 'cv_active', 'visit_count', 'ai_admin_overview']) {
  report.functions[fn] = await rpcExists(fn);
}

report.tables = {};
for (const table of ['projects', 'skills', 'visits', 'contacts', 'admin_users', 'ailab_projects', 'ailab_capabilities', 'ailab_project_capabilities', 'cv_versions', 'ai_providers']) {
  report.tables[table] = await tableAccess(table);
}

report.storage = {};
for (const bucket of ['project-images', 'avatars', 'portfolio-public-documents']) {
  const r = await status(`/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000 }) });
  let detail = `HTTP ${r.status}`;
  try {
    const items = JSON.parse(r.body);
    if (Array.isArray(items)) detail = items.length ? `LISTAGE PUBLIC POSSIBLE : ${items.length} entrée(s) à la racine` : 'listage vide pour anon';
  } catch { /* corps non JSON */ }
  report.storage[bucket] = detail;
}

const openapi = await status('/rest/v1/');
report.openApiForAnon = openapi.status === 200 ? 'spécification visible par anon' : `HTTP ${openapi.status}`;

console.log(JSON.stringify(report, null, 2));

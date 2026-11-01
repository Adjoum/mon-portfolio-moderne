#!/usr/bin/env node
// Recette P4 — historique privé des CV (« Mes CV ») sur le Supabase LOCAL de la recette :
// Auth, PostgREST et Storage réels, migration 20261101100000_cv_private_history appliquée.
//
//   node scripts/cv-history-recette.mjs
//
// Comptes TEMPORAIRES créés puis supprimés (jamais votre compte) :
//   A, B : administrateurs avec MFA ; C : compte ordinaire avec MFA (inscription par l'API) ;
//   A1 : session de A sans MFA ; anonyme : clé publique seule.
// Aucun appel IA, aucune donnée de production.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY = 'http://127.0.0.1:58521';
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'secrets/recette/stack.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const ANON = env.RECETTE_ANON_KEY;
const SERVICE = env.RECETTE_SERVICE_KEY;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = q => spawnSync('docker', ['exec', 'recette-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', q], { encoding: 'utf8' }).stdout.trim();

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
};

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

const admin = (pathname, init = {}) => fetch(`${GATEWAY}/auth/v1${pathname}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' } }).then(r => r.json());
async function auth(pathname, token, body) {
  const res = await fetch(`${GATEWAY}/auth/v1${pathname}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`auth ${pathname} : HTTP ${res.status}`);
  return res.json();
}

const users = [];
async function account(label, { isAdmin, mfa }) {
  const email = `p4-${label}-${crypto.randomUUID()}@recette.test`;
  const password = crypto.randomBytes(16).toString('hex');
  const user = await admin('/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  users.push(user.id);
  if (isAdmin) sql(`insert into public.admin_users (user_id, email) values ('${user.id}', '${email}');`);
  const aal1 = (await auth('/token?grant_type=password', ANON, { email, password })).access_token;
  if (!mfa) return { id: user.id, token: aal1 };
  const factor = await auth('/factors', aal1, { factor_type: 'totp', friendly_name: label });
  const challenge = await auth(`/factors/${factor.id}/challenge`, aal1, {});
  const aal2 = (await auth(`/factors/${factor.id}/verify`, aal1, { challenge_id: challenge.id, code: totp(factor.totp.secret) })).access_token;
  // Administrateur : session ouverte après la MFA, comme le fait le site (verrouillage d'inactivité)
  if (isAdmin) {
    const opened = await fetch(`${GATEWAY}/rest/v1/rpc/admin_session_begin`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${aal2}`, 'Content-Type': 'application/json' }, body: '{}' });
    if (!opened.ok && opened.status !== 404) throw new Error(`ouverture de la session administrateur : HTTP ${opened.status}`);
  }
  return { id: user.id, token: aal2, aal1 };
}

const h = (token, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${token}`, ...extra });
const rest = (token, pathname, init = {}) => fetch(`${GATEWAY}/rest/v1/${pathname}`, { ...init, headers: h(token, { 'Content-Type': 'application/json', ...init.headers }) });
const upload = (token, name, body, type = 'application/pdf', method = 'POST') =>
  fetch(`${GATEWAY}/storage/v1/object/cv-private/${name}`, { method, headers: h(token, { 'Content-Type': type, 'x-upsert': method === 'PUT' ? 'true' : 'false' }), body });
const download = (token, name) => fetch(`${GATEWAY}/storage/v1/object/authenticated/cv-private/${name}`, { headers: h(token) });
const list = (token, prefix) => fetch(`${GATEWAY}/storage/v1/object/list/cv-private`, { method: 'POST', headers: h(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix, limit: 100 }) }).then(r => r.json()).catch(() => null);
const remove = (token, names) => fetch(`${GATEWAY}/storage/v1/object/cv-private`, { method: 'DELETE', headers: h(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: names }) }).then(r => r.json()).catch(() => null);
const sign = (token, name, expiresIn) => fetch(`${GATEWAY}/storage/v1/object/sign/cv-private/${name}`, { method: 'POST', headers: h(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn }) });

const PDF = fs.readFileSync(path.join(ROOT, 'tests/extract/fixtures/cv-texte.pdf'));
const TEX = Buffer.from('\\documentclass{article}\\begin{document}CV\\end{document}');
const docRow = (owner, id = crypto.randomUUID(), extra = {}) => ({
  id, owner_id: owner, title: 'CV — test', template_id: 'silicon-valley', target_organization: 'Organisme', target_role: '',
  pdf_path: `${owner}/${id}.pdf`, tex_path: `${owner}/${id}.tex`, pdf_bytes: PDF.length, tex_bytes: TEX.length, ...extra,
});
const insert = (token, rows) => rest(token, 'cv_documents', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rows) });

try {
  console.log('▶ Comptes temporaires');
  const A = await account('a', { isAdmin: true, mfa: true });
  const B = await account('b', { isAdmin: true, mfa: true });
  const C = await account('c', { isAdmin: false, mfa: true });
  check('A, B administrateurs avec MFA ; C compte ordinaire avec MFA ; session A sans MFA', !!(A.token && B.token && C.token && A.aal1));

  console.log('\n▶ Enregistrement par le propriétaire (A)');
  const doc = docRow(A.id);
  const created = await insert(A.token, doc);
  check('A enregistre un document', created.status === 201, `HTTP ${created.status}`);
  const up1 = await upload(A.token, doc.pdf_path, PDF);
  const up2 = await upload(A.token, doc.tex_path, TEX, 'application/x-tex');
  check('A dépose le PDF et le .tex de ce document', up1.status === 200 && up2.status === 200, `${up1.status}, ${up2.status}`);
  const mine = await rest(A.token, 'cv_documents?select=id,title&order=created_at.desc').then(r => r.json());
  check('A retrouve son document', mine.length === 1 && mine[0].id === doc.id);
  const got = await download(A.token, doc.pdf_path);
  check('A télécharge son PDF (intact)', got.status === 200 && Buffer.compare(Buffer.from(await got.arrayBuffer()), PDF) === 0);

  console.log('\n▶ URL de téléchargement signées, limitées dans le temps');
  const signed = await sign(A.token, doc.pdf_path, 2).then(r => r.json());
  const fresh = await fetch(`${GATEWAY}/storage/v1${signed.signedURL}`);
  check('URL signée valable pendant sa durée', fresh.status === 200);
  await sleep(3500);
  const expired = await fetch(`${GATEWAY}/storage/v1${signed.signedURL}`);
  check('URL signée expirée refusée', expired.status >= 400, `HTTP ${expired.status}`);

  console.log('\n▶ Aucun accès aux CV d’un autre utilisateur');
  check('B ne voit pas le document de A', (await rest(B.token, `cv_documents?id=eq.${doc.id}`).then(r => r.json())).length === 0);
  check('B ne télécharge pas le PDF de A', (await download(B.token, doc.pdf_path)).status >= 400);
  check('B n’obtient pas d’URL signée pour le PDF de A', (await sign(B.token, doc.pdf_path, 60)).status >= 400);
  const bList = await list(B.token, `${A.id}/`);
  check('B ne liste pas le dossier de A', Array.isArray(bList) ? bList.length === 0 : true);
  await remove(B.token, [doc.pdf_path]);
  check('B ne supprime pas le PDF de A', (await download(A.token, doc.pdf_path)).status === 200);
  await rest(B.token, `cv_documents?id=eq.${doc.id}`, { method: 'DELETE' });
  check('B ne supprime pas le document de A', (await rest(A.token, `cv_documents?id=eq.${doc.id}`).then(r => r.json())).length === 1);
  const forged = await insert(B.token, docRow(A.id));
  check('B ne peut pas enregistrer au nom de A', forged.status >= 400, `HTTP ${forged.status}`);
  const intrusion = await upload(B.token, `${A.id}/${crypto.randomUUID()}.pdf`, PDF);
  check('B ne dépose rien dans le dossier de A', intrusion.status >= 400, `HTTP ${intrusion.status}`);

  console.log('\n▶ Comptes non autorisés : visiteur inscrit par l’API, session sans MFA, anonyme');
  for (const [label, token, owner] of [['C (compte ordinaire, même avec MFA)', C.token, C.id], ['A sans MFA', A.aal1, A.id], ['anonyme', ANON, A.id]]) {
    const row = docRow(owner);
    const r = await insert(token, row);
    const u = await upload(token, row.pdf_path, PDF);
    const readRes = await rest(token, 'cv_documents?select=id')
    const read = await readRes.json().catch(() => null)
    // Lecture refusée (anonyme : aucun droit sur la table) ou vide (RLS)
    const noRead = readRes.status >= 400 || (Array.isArray(read) && read.length === 0)
    const dl = await download(token, doc.pdf_path);
    check(`${label} : ni enregistrement, ni dépôt, ni lecture`, r.status >= 400 && u.status >= 400 && noRead && dl.status >= 400, `${r.status}/${u.status}/lecture ${readRes.status}/${dl.status}`);
  }

  console.log('\n▶ Garde-fous du stockage');
  const orphan = await upload(A.token, `${A.id}/${crypto.randomUUID()}.pdf`, PDF);
  check('dépôt sans document enregistré refusé (quota contournable sinon)', orphan.status >= 400, `HTTP ${orphan.status}`);
  const upsert = await upload(A.token, doc.pdf_path, Buffer.from('%PDF-1.4 remplacé'), 'application/pdf', 'PUT');
  check('aucun remplacement d’un CV enregistré', upsert.status >= 400 && Buffer.compare(Buffer.from(await (await download(A.token, doc.pdf_path)).arrayBuffer()), PDF) === 0, `HTTP ${upsert.status}`);
  const other = docRow(A.id);
  await insert(A.token, other);
  const html = await upload(A.token, other.pdf_path, Buffer.from('<html><script>alert(1)</script>'), 'text/html');
  check('type de fichier hors liste refusé (HTML)', html.status >= 400, `HTTP ${html.status}`);
  const big = await upload(A.token, other.pdf_path, Buffer.alloc(5 * 1024 * 1024 + 1, 0x20));
  check('fichier de plus de 5 Mo refusé', big.status >= 400, `HTTP ${big.status}`);
  const traversal = await upload(A.token, `${A.id}/../${B.id}/x.pdf`, PDF);
  check('chemin détourné refusé', traversal.status >= 400, `HTTP ${traversal.status}`);
  const badPath = await insert(A.token, docRow(A.id, crypto.randomUUID(), { pdf_path: `${B.id}/x.pdf` }));
  check('chemin incohérent avec le propriétaire refusé par la base', badPath.status >= 400, `HTTP ${badPath.status}`);
  const backdated = await insert(A.token, docRow(A.id, crypto.randomUUID(), { created_at: '2020-01-01T00:00:00Z', expires_at: '2020-12-31T00:00:00Z' }));
  check('date d’enregistrement imposée par la base (pas d’antidatage)', backdated.status >= 400, `HTTP ${backdated.status}`);
  await rest(A.token, `cv_documents?id=eq.${other.id}`, { method: 'DELETE' });

  console.log('\n▶ Quota : 30 CV par propriétaire');
  const batch = Array.from({ length: 30 }, () => docRow(B.id));
  const q30 = await insert(B.token, batch);
  const q31 = await insert(B.token, docRow(B.id));
  const q31body = await q31.text();
  check('30 documents acceptés, le 31e refusé', q30.status === 201 && q31.status >= 400 && /cv_history_quota/.test(q31body), `${q30.status}, ${q31.status}`);
  await rest(B.token, `cv_documents?owner_id=eq.${B.id}`, { method: 'DELETE' });

  console.log('\n▶ Suppression par le propriétaire');
  const deleted = await remove(A.token, [doc.pdf_path, doc.tex_path]);
  const gone = await rest(A.token, `cv_documents?id=eq.${doc.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }).then(r => r.json());
  check('fichiers puis document supprimés', Array.isArray(deleted) && deleted.length === 2 && gone.length === 1);
  check('plus aucun fichier ni document pour A', sql(`select (select count(*) from storage.objects where bucket_id = 'cv-private' and name like '${A.id}/%') + (select count(*) from public.cv_documents where owner_id = '${A.id}');`) === '0');

  console.log('\n▶ Séparation avec le CV public du portfolio');
  check('bucket cv-private privé, distinct de portfolio-public-documents et de project-images', sql("select string_agg(id || ':' || public, ',' order by id) from storage.buckets where id in ('cv-private','portfolio-public-documents','project-images');") === 'cv-private:false,portfolio-public-documents:true,project-images:true');
} catch (err) {
  failures++;
  console.error(`✗ arrêt : ${err.message}`);
} finally {
  for (const id of users) {
    sql(`delete from public.cv_documents where owner_id = '${id}';`);
    await admin(`/admin/users/${id}`, { method: 'DELETE', body: '{}' });
  }
  check('comptes et documents temporaires supprimés', sql("select count(*) from public.admin_users where email like 'p4-%';") === '0');
}
console.log(failures ? `\n${failures} contrôle(s) en échec` : '\nTous les contrôles sont réussis. Aucun appel IA, Supabase local uniquement.');
process.exitCode = failures ? 1 : 0;

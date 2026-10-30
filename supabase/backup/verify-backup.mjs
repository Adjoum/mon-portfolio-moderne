#!/usr/bin/env node
// Vérifie une sauvegarde produite par backup.sh, sans aucune connexion à la production :
//   1. empreintes SHA-256 ;
//   2. nombres de lignes des comptes, facteurs MFA, buckets et fichiers (lus dans la sauvegarde)
//      comparés à l'inventaire ;
//   3. restauration de public.dump dans un Postgres Supabase jetable, sans réseau, puis
//      comparaison des nombres de lignes de chaque table avec l'inventaire.
//
//   node supabase/backup/verify-backup.mjs <dossier-de-sauvegarde> <inventaire.json> [--image <image>]

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInventory } from '../checks/restore-from-inventory.mjs';
import { adaptSql, dumpToSql, replay } from './restore-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGES = { 15: 'public.ecr.aws/supabase/postgres:15.14.1.159', 17: 'public.ecr.aws/supabase/postgres:17.6.1.167' };
/** Tables alimentées en continu : un écart avec l'inventaire est attendu si la sauvegarde est plus récente */
const LIVE_TABLES = new Set(['public.visits', 'auth.sessions', 'auth.refresh_tokens']);

const [dir, inventoryFile] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const imageArg = process.argv.includes('--image') ? process.argv[process.argv.indexOf('--image') + 1] : null;
if (!dir || !inventoryFile) {
  console.error('Usage : node supabase/backup/verify-backup.mjs <dossier> <inventaire.json> [--image <image>]');
  process.exit(2);
}
const inv = parseInventory(fs.readFileSync(inventoryFile, 'utf8'));
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. Empreintes ──
const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+\*?/));
for (const [hash, name] of sums) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
  check(`empreinte ${name}`, actual === hash);
}

// ── 2. Comptes et fichiers : lignes COPY de la sauvegarde ──
export function copyCounts(sql) {
  const counts = {};
  let current = null;
  for (const line of sql.split('\n')) {
    if (current) {
      if (line === '\\.') current = null;
      else counts[current]++;
      continue;
    }
    const m = /^COPY ([\w."]+) \(/.exec(line);
    if (m) { current = m[1].replace(/"/g, ''); counts[current] = 0; }
  }
  return counts;
}
const data = copyCounts(fs.readFileSync(path.join(dir, 'auth-storage-data.sql'), 'utf8'));
const compare = (label, saved, expected, live = false) => {
  if (expected === undefined || expected === null) return console.log(`· ${label} : ${saved} (absent de l’inventaire)`);
  const ok = saved === expected || (live && saved >= expected);
  check(`${label} : ${saved} ligne(s) sauvegardée(s), ${expected} à l’inventaire`, ok, ok && saved !== expected ? 'table alimentée en continu' : '');
};
for (const table of ['users', 'identities', 'mfa_factors']) compare(`auth.${table}`, data[`auth.${table}`] ?? 0, inv.auth.tables[table]);
compare('storage.buckets', data['storage.buckets'] ?? 0, inv.buckets.length);
compare('storage.objects', data['storage.objects'] ?? 0, inv.buckets.reduce((n, b) => n + b.objects, 0));

// ── 3. Restauration de public dans un Postgres jetable ──
const major = Math.floor(inv.server.version_num / 10000);
const image = imageArg ?? IMAGES[major];
if (!image) {
  console.error(`Aucune image connue pour PostgreSQL ${major} : précisez --image public.ecr.aws/supabase/postgres:<version ${major}>`);
  process.exit(2);
}
const name = `verify-backup-${process.pid}`;
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const psql = (user, input, extra = []) => spawnSync('docker', ['exec', '-i', name, 'psql', '-X', '-q', '-U', user, '-d', 'postgres', ...extra], { input, encoding: 'utf8' });

try {
  const started = docker('run', '-d', '--rm', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD=verification-locale', image);
  if (started.status !== 0) throw new Error(started.stderr.slice(-400));
  for (let i = 0; i < 120; i++) {
    if (docker('logs', name).stdout.includes('PostgreSQL init process complete')
      && docker('exec', name, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', "select 1 from pg_roles where rolname = 'authenticated'").stdout.trim() === '1') break;
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
  }
  psql('supabase_admin', fs.readFileSync(path.join(ROOT, 'supabase/tests/rls/00_supabase_shim.sql'), 'utf8'));

  // Comptes d'abord : admin_users y fait référence. Le schéma auth de l'image peut être plus
  // ancien que celui du projet hébergé (colonnes ajoutées par Supabase) : écarts signalés à part.
  const authErrors = replay(name, adaptSql(fs.readFileSync(path.join(dir, 'auth-storage-data.sql'), 'utf8'), major));
  console.log(authErrors.length
    ? `· comptes et fichiers : restauration partielle (${authErrors.length} écart(s) de schéma auth/storage entre le projet et l’image locale ; nombres vérifiés ci-dessus dans la sauvegarde)`
    : '· comptes et fichiers : restaurés sans erreur');

  // Archive lue par pg_restore 17 (client de backup.sh), rejouée dans la base jetable
  const all = replay(name, adaptSql(dumpToSql(dir, { noOwner: true }), major));
  // Sans comptes restaurés, la création des clés étrangères vers auth.users échoue : attendu
  const expected = authErrors.length ? all.filter(e => /foreign key|violates/i.test(e)) : [];
  const errors = all.filter(e => !expected.includes(e));
  check('restauration de public.dump (pg_restore 17)', errors.length === 0, errors.length ? `${errors.length} erreur(s) : ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : `sans erreur${expected.length ? ` (${expected.length} clé(s) étrangère(s) vers auth non recréée(s), attendu)` : ''}`);

  for (const t of inv.tables.filter(t => t.schema === 'public')) {
    const restored = Number(psql('postgres', `select count(*) from public."${t.name.replace(/"/g, '""')}";`, ['-At']).stdout.trim());
    compare(`public.${t.name}`, restored, t.rows, LIVE_TABLES.has(`public.${t.name}`));
  }
} finally {
  docker('rm', '-f', name);
}

const failed = results.filter(ok => !ok).length;
console.log(`\nBILAN : ${results.length - failed} / ${results.length} vérifications réussies`);
process.exitCode = failed ? 1 : 0;

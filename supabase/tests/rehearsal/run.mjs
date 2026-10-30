#!/usr/bin/env node
// Répétition générale de la mise en production Supabase, sur une base locale jetable SANS
// accès Internet (réseau Docker interne). Aucune donnée ni connexion de production.
//
//   node supabase/tests/rehearsal/run.mjs                       état « production » simulé
//   node supabase/tests/rehearsal/run.mjs --from-backup <dossier> COPIE de votre base, restaurée
//                                                                 depuis votre sauvegarde (backup.sh)
//
// Enchaîne exactement les étapes du plan : inventaire → comparaison → sauvegarde (backup.sh,
// client postgres:17-alpine) → vérification de la sauvegarde → migrations → contrôles →
// retour arrière (scripts down + restauration générée depuis l'inventaire) → nouvel inventaire,
// qui doit retrouver l'état de départ.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInventory, restoreSql } from '../../checks/restore-from-inventory.mjs';
import { CLIENT, IMAGES, adaptSql, dumpToSql, replay } from '../../backup/restore-lib.mjs';
import { SPLINTER_COMMIT, loadSplinter, securityLintScript, parseLints } from '../advisor/splinter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const IMAGE = process.env.SUPABASE_PG_IMAGE ?? IMAGES[17];
const PASSWORD = 'repetition-locale-uniquement';
const id = `${process.pid}`;
const NET = `rehearsal-net-${id}`;
const DB = `rehearsal-db-${id}`;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-'));
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };

const MIGRATIONS = [
  '20261030120000_p0a1_admin_access_control', '20261030120100_p0a1_storage_access_control',
  '20261030120200_p0a1_security_advisor',
  '20261030150000_cv_public_document', '20261030150100_project_images_no_public_listing',
  '20261030170000_ai_control_center_schema', '20261030170100_ai_admin_functions',
  '20261030170200_ai_runtime_functions', '20261030170300_ai_initial_catalog',
];
const ROLLBACKS = [
  '20261030170000_ai_control_center', '20261030150100_project_images_no_public_listing',
  '20261030150000_cv_public_document', '20261030120200_p0a1_security_advisor',
  '20261030120100_p0a1_storage_access_control', '20261030120000_p0a1_admin_access_control',
];
/** Fonctions SECURITY DEFINER appelées volontairement par le site (contrôles internes) */
const RPC_ALLOWED = /^(is_portfolio_admin|visit_count|cv_active|cv_publish_version|cv_restore_version|ai_admin_\w+)$/;

const option = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const FROM_BACKUP = option('--from-backup');

const results = [];
const check = (label, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? '✔' : '✗'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
};
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8', env });
const sleep = ms => spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
const psql = (user, input, extra = []) => {
  const r = spawnSync('docker', ['exec', '-i', DB, 'psql', '-X', '-q', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extra], { input, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(`psql (${user}) : ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
};
const sqlFile = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const value = sql => psql('supabase_admin', sql, ['-At']);
const inventory = label => {
  const raw = psql('postgres', sqlFile('supabase/checks/p1ai_production_inventory.sql'), ['-At']);
  fs.writeFileSync(path.join(WORK, `inventaire-${label}.json`), raw);
  return parseInventory(raw);
};
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8', env, cwd: ROOT });

/** Empreinte MD5 du contenu de chaque table existante : public, comptes, facteurs MFA, fichiers */
const quote = s => `"${String(s).replace(/"/g, '""')}"`;
function contentHashes(inv) {
  const targets = [...inv.tables.filter(t => t.schema === 'public').map(t => ['public', t.name]),
    ['auth', 'users'], ['auth', 'identities'], ['auth', 'mfa_factors'], ['storage', 'objects']];
  return Object.fromEntries(targets.map(([schema, name]) => {
    const rel = `${quote(schema)}.${quote(name)}`;
    const exists = value(`select to_regclass('${rel.replace(/'/g, "''")}') is not null;`) === 't';
    return [`${schema}.${name}`, exists ? value(`select md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) from ${rel} t;`) : 'absente'];
  }));
}
const changedTables = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);

/** Alertes du Security Advisor (ou du Performance Advisor) selon les règles splinter ; null hors ligne */
const SPLINTER = await loadSplinter();
const advisor = (category = 'SECURITY') => (SPLINTER ? parseLints(psql('postgres', securityLintScript(SPLINTER, category), ['-At'])) : null);
const lintLabel = l => `[${l.level}] ${l.name} : ${l.key.slice(l.name.length + 1)}`;
const listLints = (title, lints) => console.log(`   ${title} (${lints.length})${lints.map(l => `\n     - ${lintLabel(l)}`).join('')}`);
/** Résumé par règle et niveau : « [WARN] multiple_permissive_policies ×12 » */
const countLints = lints => Object.entries(lints.reduce((acc, l) => ({ ...acc, [`[${l.level}] ${l.name}`]: (acc[`[${l.level}] ${l.name}`] ?? 0) + 1 }), {}))
  .map(([k, n]) => `${k} ×${n}`).join(', ') || 'aucune';

/** Comparaison structurelle de deux inventaires (même nature d'objets, mêmes définitions) */
function diff(a, b) {
  // Les droits (aclitem[]) se comparent comme un ensemble : l'ordre affiché n'a pas de sens
  const acl = value => (value ?? 'défaut').replace(/^\{|\}$/g, '').split(',').sort().join(',');
  // Bucket du CV conservé volontairement par son retour arrière : exclu du décompte
  const keptBuckets = inv => inv.buckets.filter(x => x.id === 'portfolio-public-documents').length;
  const key = {
    tables: (t, inv) => `${t.schema}.${t.name} rls=${t.rls} force=${t.force_rls} lignes=${t.rows - (t.schema === 'storage' && t.name === 'buckets' ? keptBuckets(inv) : 0)}`,
    policies: p => `${p.schema}.${p.table} ${p.name} ${p.permissive} ${p.cmd} ${p.roles} using=${p.using} check=${p.with_check}`,
    functions: f => `${f.schema}.${f.name}(${f.arguments}) definer=${f.security_definer} acl=${acl(f.acl)} def=${(f.definition ?? '').replace(/\s+/g, ' ')}`,
    grants: g => `${g.schema}.${g.table} ${g.grantee} ${g.privileges}`,
    buckets: b => `${b.id} public=${b.public} objets=${b.objects} limite=${b.file_size_limit} types=${JSON.stringify(b.allowed_mime_types)}`,
    roles: r => `${r.name} login=${r.login}`,
  };
  const out = {};
  for (const [section, fn] of Object.entries(key)) {
    const left = new Set(a[section].map(x => fn(x, a)));
    const right = new Set(b[section].map(x => fn(x, b)));
    out[section] = { missing: [...left].filter(x => !right.has(x)), added: [...right].filter(x => !left.has(x)) };
  }
  return out;
}

try {
  console.log(`▶ Base jetable ${IMAGE} sur un réseau Docker interne (sans Internet)`);
  docker('network', 'create', '--internal', NET);
  const started = docker('run', '-d', '--rm', '--name', DB, '--network', NET, '-e', `POSTGRES_PASSWORD=${PASSWORD}`, IMAGE);
  if (started.status !== 0) throw new Error(started.stderr);
  for (let i = 0; i < 120; i++) {
    if (docker('logs', DB).stdout.includes('PostgreSQL init process complete')
      && docker('exec', DB, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', "select 1 from pg_roles where rolname = 'authenticated'").stdout.trim() === '1') break;
    sleep(1000);
  }
  sleep(3000);
  // Le client de sauvegarde se connecte par mot de passe, comme au pooler Supabase
  psql('supabase_admin', `alter role postgres with password '${PASSWORD}';`);

  psql('supabase_admin', sqlFile('supabase/tests/rls/00_supabase_shim.sql'));
  if (FROM_BACKUP) {
    console.log(`▶ Copie de votre base restaurée depuis ${FROM_BACKUP} (données locales, supprimées à la fin)`);
    const major = Math.floor(Number(value('show server_version_num')) / 10000);
    const authErrors = replay(DB, adaptSql(fs.readFileSync(path.join(FROM_BACKUP, 'auth-storage-data.sql'), 'utf8'), major));
    console.log(`   comptes et fichiers : ${authErrors.length ? `${authErrors.length} écart(s) de schéma auth/storage (image locale plus ancienne)` : 'restaurés'}`);
    // Propriétaires conservés : les fonctions SECURITY DEFINER s'exécutent avec leurs droits
    const errors = replay(DB, adaptSql(dumpToSql(FROM_BACKUP), major));
    check('copie restaurée depuis la sauvegarde', errors.every(e => authErrors.length && /foreign key|violates/i.test(e)),
      errors.length ? `${errors.length} message(s) : ${errors.slice(0, 2).join(' | ').slice(0, 300)}` : 'sans erreur');
    // Politiques du stockage : hors du schéma public, elles sont dans schema.sql
    const storagePolicies = (fs.readFileSync(path.join(FROM_BACKUP, 'schema.sql'), 'utf8').match(/^CREATE POLICY [^;]*? ON storage\.\w+[\s\S]*?;$/gm) ?? []);
    if (storagePolicies.length) psql('supabase_admin', storagePolicies.join('\n'));
    console.log(`   politiques du stockage rejouées : ${storagePolicies.length}`);
  } else {
    console.log('▶ État « production » : banc RLS + traits constatés en production');
    psql('postgres', sqlFile('supabase/tests/rls/10_production_like_state.sql'));
    psql('supabase_admin', sqlFile('supabase/tests/rls/15_seed.sql'));
    psql('postgres', sqlFile('supabase/tests/rehearsal/18_production_traits.sql'));
  }

  console.log('▶ 1. Inventaire en lecture seule (script du SQL Editor)');
  const before = inventory('avant');
  check('inventaire produit (JSON valide, sans donnée personnelle)', before.inventory_version === 'p1ai.1'
    && !JSON.stringify(before).includes('@example.test'), `${before.tables.length} tables, ${before.policies.length} politiques`);
  const ro = spawnSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', DB, 'psql', '-X', '-q', '-At', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sqlFile('supabase/checks/p1ai_production_inventory.sql'), encoding: 'utf8', env });
  check('l’inventaire s’exécute dans une transaction en lecture seule', ro.status === 0, ro.status === 0 ? '' : ro.stderr.slice(-200));
  const hashesBefore = contentHashes(before);
  const lintsBefore = advisor();
  const perfBefore = lintsBefore && advisor('PERFORMANCE');
  if (lintsBefore) {
    listLints(`Security Advisor avant migrations (règles splinter ${SPLINTER_COMMIT.slice(0, 7)})`, lintsBefore);
    console.log(`   Performance Advisor avant migrations (${perfBefore.length}) : ${countLints(perfBefore)}`);
  } else console.log('   Security Advisor : règles splinter indisponibles (hors ligne), contrôles ignorés');

  console.log('▶ 2. Comparaison avec les migrations prévues');
  const compared = node('supabase/checks/compare-inventory.mjs', path.join(WORK, 'inventaire-avant.json'));
  console.log(compared.stdout.split('\n').filter(l => l.trim()).map(l => `   ${l}`).join('\n'));
  check(`comparaison : aucun blocage sur ${FROM_BACKUP ? 'la copie' : 'l’état simulé'}`, compared.status === 0);

  if (!FROM_BACKUP) {
  console.log('▶ 3. Sauvegarde (backup.sh, client postgres:17-alpine, comme sur votre poste)');
  const backupDir = path.join(WORK, 'sauvegardes');
  fs.mkdirSync(backupDir);
  const backup = docker('run', '--rm', '--network', NET, '-v', `${backupDir}:/backup`, '-v', `${path.join(ROOT, 'supabase/backup')}:/scripts:ro`,
    '-e', `PGHOST=${DB}`, '-e', 'PGUSER=postgres', '-e', 'PGSSLMODE=disable', '-e', `PGPASSWORD=${PASSWORD}`, CLIENT, 'sh', '/scripts/backup.sh');
  const produced = fs.readdirSync(backupDir)[0];
  check('sauvegarde produite', backup.status === 0 && !!produced, backup.status === 0 ? produced : backup.stderr.slice(-300));

  console.log('▶ 4. Vérification de la sauvegarde (restauration dans une autre base jetable)');
  const verify = node('supabase/backup/verify-backup.mjs', path.join(backupDir, produced), path.join(WORK, 'inventaire-avant.json'), '--image', IMAGE);
  console.log(verify.stdout.split('\n').filter(l => l.trim()).map(l => `   ${l}`).join('\n'));
  check('sauvegarde vérifiée : empreintes, comptes, restauration, nombres de lignes', verify.status === 0);
  }

  console.log('▶ 5. Migrations (rôle postgres, une transaction chacune)');
  for (const m of MIGRATIONS) psql('postgres', `set client_min_messages = warning;\n${sqlFile(`supabase/migrations/${m}.sql`)}`, ['--single-transaction']);
  const after = inventory('apres');
  check(`les ${MIGRATIONS.length} migrations s’appliquent`, after.tables.some(t => t.name === 'ai_providers') && after.tables.some(t => t.name === 'cv_versions'));
  const changedByMigrations = changedTables(hashesBefore, contentHashes(before));
  check(`contenu des ${Object.keys(hashesBefore).length} tables existantes inchangé par les migrations (empreinte de chaque ligne, comptes et facteurs MFA compris)`,
    changedByMigrations.length === 0, changedByMigrations.join(', '));
  const anonVisits = spawnSync('docker', ['exec', '-i', DB, 'psql', '-X', '-q', '-At', '-U', 'supabase_admin', '-d', 'postgres'],
    { input: "set role anon; select count(*) from public.visits;", encoding: 'utf8', env }).stdout.trim();
  check('visits n’est plus lisible par un visiteur anonyme', anonVisits === '0' || anonVisits === '', `anon voit ${anonVisits || 'aucune ligne (refus)'}`);
  check('administrateur existant conservé', value('select count(*) from public.admin_users;') === String(before.auth.admins));

  // Déclencheurs updatedat : search_path figé par 20261030120200, corps inchangé. Mise à jour
  // réelle d'une ligne, annulée aussitôt (transaction) : le déclencheur doit encore poser now().
  const triggerTables = [...new Set(after.triggers.filter(t => /set_updatedat|update_updatedat_column/.test(t.definition))
    .map(t => t.table.replace(/^public\./, '')))];
  const triggerResults = triggerTables.map(t => {
    const rel = `public.${quote(t)}`;
    try {
      const ok = psql('postgres', `begin;
with u as (update ${rel} set updatedat = '2000-01-01' where ctid = (select ctid from ${rel} limit 1) returning updatedat = now() as ok)
select coalesce(bool_and(ok), true) from u;
rollback;`, ['-At']);
      return { t, ok: ok === 't' };
    } catch (err) {
      return { t, ok: false, error: err.message.slice(-160) };
    }
  });
  check('déclencheurs updatedat fonctionnels (search_path figé)', triggerResults.every(r => r.ok),
    triggerResults.map(r => `${r.t}${r.ok ? '' : ` ✗ ${r.error ?? 'date non posée'}`}`).join(', ') || 'aucun déclencheur');

  const lintsAfter = lintsBefore && advisor();
  if (lintsAfter) {
    const keysBefore = new Set(lintsBefore.map(l => l.key));
    const keysAfter = new Set(lintsAfter.map(l => l.key));
    listLints('alertes levées par les migrations', lintsBefore.filter(l => !keysAfter.has(l.key)));
    listLints('alertes restantes', lintsAfter.filter(l => keysBefore.has(l.key)));
    const added = lintsAfter.filter(l => !keysBefore.has(l.key));
    listLints('alertes nouvelles', added);
    const targeted = /^(function_search_path_mutable|public_bucket_allows_listing|rls_disabled_in_public|policy_exists_rls_disabled|rls_enabled_no_policy|security_definer_view|auth_users_exposed)$/;
    check('Security Advisor : plus de search_path modifiable, de listage public, de table sans RLS ni sans politique',
      !lintsAfter.some(l => targeted.test(l.name)), lintsAfter.filter(l => targeted.test(l.name)).map(lintLabel).join(' | '));
    const alwaysTrue = lintsAfter.filter(l => l.name === 'rls_policy_always_true'
      && (/_p0(a1|cv)_/.test(l.key) || /^rls_policy_always_true_public_(contacts|visits)_/.test(l.key)));
    check('Security Advisor : plus aucune insertion « toujours vraie » sur contacts et visits, aucune créée par les migrations',
      alwaysTrue.length === 0, alwaysTrue.map(lintLabel).join(' | '));
    const fn = l => /`public\.(\w+)\(/.exec(l.detail)?.[1] ?? '';
    const unexpected = added.filter(l => !(/security_definer_function_executable$/.test(l.name) && RPC_ALLOWED.test(fn(l))));
    check('Security Advisor : alertes nouvelles limitées aux fonctions RPC prévues', unexpected.length === 0, unexpected.map(lintLabel).join(' | '));

    // Performance Advisor : information, pas un critère de réussite
    const perfAfter = advisor('PERFORMANCE');
    const perfKeys = new Set(perfBefore.map(l => l.key));
    console.log(`   Performance Advisor après migrations (${perfAfter.length}) : ${countLints(perfAfter)}`);
    console.log(`   dont nouvelles (${perfAfter.filter(l => !perfKeys.has(l.key)).length}) : ${countLints(perfAfter.filter(l => !perfKeys.has(l.key)))}`);
  }

  // Exposition automatique des nouvelles tables (activée en production) et droits par défaut de
  // Supabase : les objets créés par les migrations doivent rester fermés aux clients
  const clientAccess = value(`select coalesce(string_agg(c.relname || ':' || r.role, ' ' order by c.relname, r.role), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(role)
    where (n.nspname = 'ai_private' or (n.nspname = 'public' and c.relname like 'ai\\_%'))
      and ((c.relkind = 'r' and has_table_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
        or (c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, 'USAGE,SELECT,UPDATE')));`);
  check('tables et séquences du centre IA fermées à anon et authenticated', clientAccess === '', clientAccess.slice(0, 300));
  const cvAccess = value(`select has_table_privilege('anon', 'public.cv_versions', 'SELECT,INSERT,UPDATE,DELETE')::text
    || ' ' || has_table_privilege('authenticated', 'public.cv_versions', 'INSERT,UPDATE,DELETE')::text
    || ' ' || has_schema_privilege('anon', 'ai_private', 'USAGE')::text;`);
  check('cv_versions : aucun droit anonyme, aucune écriture cliente ; schéma ai_private fermé', cvAccess === 'false false false', cvAccess);

  // is_portfolio_admin() après P0.A1 : définition attendue, quel que soit son propriétaire d'origine
  const admin = value(`select json_build_object('definer', p.prosecdef, 'config', p.proconfig, 'args', p.pronargs, 'owner', pg_get_userbyid(p.proowner),
      'public', has_function_privilege('public', p.oid, 'EXECUTE'), 'body', regexp_replace(p.prosrc, '\\s+', ' ', 'g'))
    from pg_proc p where p.oid = 'public.is_portfolio_admin()'::regprocedure;`);
  const adminFn = JSON.parse(admin);
  check('is_portfolio_admin : SECURITY DEFINER, search_path vide, sans argument, sans droit PUBLIC, lit admin_users pour l’appelant',
    adminFn.definer && JSON.stringify(adminFn.config) === '["search_path=\\"\\""]' && adminFn.args === 0 && !adminFn.public
      && adminFn.body === ' select exists ( select 1 from public.admin_users where user_id = (select auth.uid()) ); ',
    `propriétaire ${adminFn.owner}`);

  console.log('▶ 6. Retour arrière : scripts down puis restauration générée depuis l’inventaire');
  for (const r of ROLLBACKS) psql('postgres', `set client_min_messages = warning;\n${sqlFile(`supabase/rollback/${r}.down.sql`)}`, ['--single-transaction']);
  const restore = restoreSql(before);
  fs.writeFileSync(path.join(WORK, 'restauration.sql'), restore);
  psql('postgres', `set client_min_messages = warning;\n${restore}`);
  const back = inventory('retour');
  const d = diff(before, back);
  const expectedLeftovers = x => /cv_versions|portfolio-public-documents/.test(x);
  const unexpected = Object.entries(d).flatMap(([section, { missing, added }]) => [
    ...missing.map(x => `${section} manquant : ${x}`),
    ...added.filter(x => !expectedLeftovers(x)).map(x => `${section} en trop : ${x}`),
  ]);
  check('retour à l’état d’origine : tables, RLS, politiques, fonctions, droits, rôles', unexpected.length === 0,
    unexpected.length ? unexpected.slice(0, 6).join(' | ').slice(0, 600) : 'identique');
  const leftovers = Object.values(d).flatMap(s => s.added.filter(expectedLeftovers));
  console.log(`   conservés volontairement (inertes) : ${leftovers.join(' ; ') || 'aucun'}`);
  check('aucune clé ni objet du centre IA restant', back.tables.every(t => !t.name.startsWith('ai_')) && !back.roles.some(r => r.name === 'ai_backend')
    && value("select count(*) from vault.secrets where name like 'ai_provider_%';") === '0');
  const changedByRollback = changedTables(hashesBefore, contentHashes(before));
  check('contenu identique à l’origine après retour arrière', changedByRollback.length === 0, changedByRollback.join(', '));

  console.log('▶ 7. Réapplication après retour arrière (idempotence)');
  for (const m of MIGRATIONS) psql('postgres', `set client_min_messages = warning;\n${sqlFile(`supabase/migrations/${m}.sql`)}`, ['--single-transaction']);
  check('migrations réappliquées sans erreur', inventory('reapplique').tables.some(t => t.name === 'ai_providers'));
} catch (err) {
  check(`ERREUR DE LA RÉPÉTITION : ${err.message.slice(0, 400)}`, false);
} finally {
  docker('rm', '-f', DB);
  docker('network', 'rm', NET);
  if (!process.argv.includes('--keep')) fs.rmSync(WORK, { recursive: true, force: true });
  else console.log(`Fichiers conservés : ${WORK}`);
  const failed = results.filter(ok => !ok).length;
  console.log(`\nBILAN : ${results.length - failed} / ${results.length} vérifications réussies`);
  process.exitCode = failed ? 1 : 0;
}

#!/usr/bin/env node
// Compare un inventaire Supabase (p1ai_production_inventory.sql) avec ce que les migrations
// prévues vont créer, remplacer ou supprimer. Lecture seule : aucune connexion à la base.
//
//   node supabase/checks/compare-inventory.mjs supabase/checks/results/production-inventory.json
//
// Sortie : rapport en texte (conflits, remplacements, politiques supprimées, prérequis), et
// code de sortie 1 si un BLOCAGE est détecté.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
if (!file) {
  console.error('Usage : node supabase/checks/compare-inventory.mjs <inventaire.json>');
  process.exit(2);
}

/** Le SQL Editor peut exporter la cellule entourée de guillemets ou dans un tableau : on retrouve l'objet */
export function parseInventory(raw) {
  let value = JSON.parse(raw.trim());
  for (let i = 0; i < 3; i++) {
    if (typeof value === 'string') value = JSON.parse(value);
    else if (Array.isArray(value)) value = value[0]?.inventory ?? value[0];
    else if (value && value.inventory && !value.inventory_version) value = value.inventory;
  }
  if (!value?.inventory_version) throw new Error('Format d’inventaire non reconnu');
  return value;
}

const inv = parseInventory(fs.readFileSync(file, 'utf8'));
const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const sql = Object.fromEntries(migrations.map(f => [f, fs.readFileSync(path.join(migrationsDir, f), 'utf8')]));
const all = Object.values(sql).join('\n');

const findings = { blocking: [], warning: [], info: [] };
const add = (level, text) => findings[level].push(text);

const tables = new Map(inv.tables.map(t => [`${t.schema}.${t.name}`, t]));
const functions = inv.functions.filter(f => f.schema === 'public');
const policies = inv.policies;

// ── Prérequis ──
const major = Math.floor(inv.server.version_num / 10000);
add('info', `PostgreSQL ${inv.server.version} (majeure ${major}), utilisateur ${inv.server.current_user}, base ${inv.server.database_size_mb} Mo`);
if (major < 15) add('blocking', `PostgreSQL ${major} : les migrations sont testées sur 15 et 17 (SECURITY INVOKER, fonctions JSON)`);
else if (![15, 17].includes(major)) add('warning', `PostgreSQL ${major} : bancs non exécutés sur cette version (SUPABASE_PG_IMAGE=<image ${major}> pour les relancer)`);
if (major < 17) add('info', `Serveur ${major} et client de sauvegarde 17 : toute restauration passe par pg_restore 17 (postgres:17-alpine)`);
if (!inv.server.can_create_roles) add('blocking', `${inv.server.current_user} ne peut pas créer de rôle : le rôle ai_backend ne pourra pas être créé`);
const vaultExt = inv.extensions.find(e => e.name === 'supabase_vault');
if (!vaultExt) add('warning', 'Extension supabase_vault absente : la migration du centre IA tentera de la créer (create extension if not exists)');
else add('info', `Vault ${vaultExt.version} présent (schéma ${vaultExt.schema}) ; création de secret exécutable : ${inv.vault.create_secret_executable}`);
if (inv.server.log_parameter_max_length_on_error !== '0') {
  add('warning', `log_parameter_max_length_on_error = ${inv.server.log_parameter_max_length_on_error} : en cas d'erreur, la valeur d'un paramètre (une clé API) pourrait apparaître dans les journaux. Valeur attendue : 0`);
}
// Clés API : transmises en paramètre à ai_admin_set_provider_key (PostgREST). Tout réglage qui
// journalise les paramètres des requêtes réussies les copierait dans les journaux Supabase.
const s = inv.server;
const roleLogs = (s.role_settings ?? []).flatMap(r => (r.settings ?? []).filter(x => /^(log_statement|log_min_duration_statement|pgaudit\.log)/.test(x)).map(x => `${r.role}: ${x}`));
if (['mod', 'all'].includes(s.log_statement) && s.log_parameter_max_length !== '0') {
  add('blocking', `log_statement = ${s.log_statement} avec log_parameter_max_length = ${s.log_parameter_max_length} : les paramètres des requêtes, donc les clés API saisies, seraient journalisés`);
}
if (s.log_min_duration_statement !== undefined && s.log_min_duration_statement !== null && !String(s.log_min_duration_statement).startsWith('-1') && s.log_parameter_max_length !== '0') {
  add('warning', `log_min_duration_statement = ${s.log_min_duration_statement} : une requête lente (enregistrement d'une clé) serait journalisée avec ses paramètres (log_parameter_max_length = ${s.log_parameter_max_length})`);
}
if (s.pgaudit_log && /\b(all|function|write)\b/i.test(s.pgaudit_log) && s.pgaudit_log_parameter === 'on') {
  add('blocking', `pgaudit.log = ${s.pgaudit_log} avec pgaudit.log_parameter = on : les clés API seraient journalisées`);
}
if (roleLogs.length) add('warning', `Journalisation réglée par rôle : ${roleLogs.join(' ; ')} — à examiner`);
if (s.log_statement !== undefined) add('info', `Journaux : log_statement=${s.log_statement}, log_min_duration_statement=${s.log_min_duration_statement}, log_parameter_max_length=${s.log_parameter_max_length}, pgaudit.log=${s.pgaudit_log ?? 'absent'}`);
if (inv.migration_history) add('info', `Historique de migrations Supabase CLI présent : ${inv.migration_history.split(',').length} version(s)`);

// ── Comptes et MFA ──
if (inv.auth.admins === null) add('info', 'Table admin_users absente : elle sera créée ; vous devrez y ajouter votre compte avant d’activer les contrôles');
else if (inv.auth.admins === 0) add('blocking', 'admin_users est vide : après P0.A1, plus personne ne pourrait modifier le contenu du dashboard');
else add('info', `${inv.auth.admins} administrateur(s) dans admin_users`);
if (inv.auth.admins > 0 && inv.auth.admins_with_verified_totp === null) {
  add('warning', 'Facteurs MFA illisibles (table auth.mfa_factors absente) : vérifiez à la main que votre compte administrateur a un TOTP vérifié');
} else if (inv.auth.admins > 0 && inv.auth.admins_with_verified_totp < inv.auth.admins) {
  add('blocking', `${inv.auth.admins - (inv.auth.admins_with_verified_totp ?? 0)} administrateur(s) sans TOTP vérifié : après P0.A1, les écritures du dashboard exigent la MFA. Enrôlez-la avant.`);
}
add('info', `Comptes Auth : ${inv.auth.tables.users ?? '?'} ; facteurs TOTP vérifiés : ${inv.auth.verified_totp_factors ?? '?'}`);

// ── Objets créés par les migrations : existent-ils déjà ? ──
const created = [...all.matchAll(/create table if not exists (\w+)\.(\w+)/g)].map(m => `${m[1]}.${m[2]}`);
for (const name of created) {
  const existing = tables.get(name);
  if (!existing) continue;
  const expected = [...all.matchAll(new RegExp(`create table if not exists ${name.replace('.', '\\.')} \\(([\\s\\S]*?)\\n\\);`, 'g'))][0]?.[1] ?? '';
  const expectedCols = [...expected.matchAll(/^\s+(\w+)\s+(?!key\b)/gm)].map(m => m[1]).filter(c => !['constraint', 'primary', 'foreign', 'unique', 'check'].includes(c));
  const actualCols = inv.columns.filter(c => `public.${c.table}` === name).map(c => c.column);
  const missing = expectedCols.filter(c => !actualCols.includes(c));
  if (missing.length) add('blocking', `${name} existe déjà SANS les colonnes ${missing.join(', ')} : « create table if not exists » la conserverait telle quelle`);
  else add('info', `${name} existe déjà (${existing.rows} ligne(s)) avec les colonnes attendues : conservée`);
}

const replaced = [...new Set([...all.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]))];
for (const name of replaced) {
  const existing = functions.filter(f => f.name === name);
  if (!existing.length) continue;
  for (const f of existing) {
    add('warning', `public.${name}(${f.arguments}) existe déjà et sera REMPLACÉE (définition actuelle conservée dans l’inventaire, propriétaire ${f.owner}, security definer : ${f.security_definer})`);
    if (f.returns !== 'boolean' && ['is_portfolio_admin', 'is_portfolio_admin_mfa'].includes(name)) {
      add('blocking', `public.${name} renvoie ${f.returns} : le remplacement échouerait (type de retour différent)`);
    }
  }
}

for (const name of ['ai_providers', 'ai_features', 'ai_models', 'ai_feature_assignments', 'ai_config_audit']) {
  if (tables.has(`public.${name}`)) add('blocking', `public.${name} existe déjà : collision avec le centre IA`);
}
if (inv.schemas.includes('ai_private')) add('warning', 'Le schéma ai_private existe déjà');
if (inv.roles.some(r => r.name === 'ai_backend')) add('warning', 'Le rôle ai_backend existe déjà (il ne sera pas recréé ; vérifiez ses droits)');
const otherAiFunctions = functions.filter(f => /^ai_admin_/.test(f.name));
if (otherAiFunctions.length) add('warning', `${otherAiFunctions.length} fonction(s) ai_admin_* déjà présentes`);

// ── Politiques que les migrations suppriment explicitement ──
const dropped = [...all.matchAll(/drop policy if exists (?:"([^"]+)"|(\w+)) on (\w+)\.(\w+)/g)]
  .map(m => ({ name: m[1] ?? m[2], schema: m[3], table: m[4] }))
  .filter(p => !/^p0a1_|^p0cv_/.test(p.name));
for (const p of dropped) {
  const existing = policies.find(x => x.schema === p.schema && x.table === p.table && x.name === p.name);
  if (existing) add('warning', `Politique supprimée par les migrations : ${p.schema}.${p.table} « ${p.name} » (${existing.cmd}) — recréable depuis l’inventaire en cas de retour arrière`);
}

// ── Exposition actuelle : ce que P0.A1 doit fermer ──
for (const table of ['visits', 'contacts']) {
  const exposed = policies.filter(p => p.schema === 'public' && p.table === table && p.cmd === 'SELECT' && p.permissive === 'PERMISSIVE'
    && (p.roles.includes('anon') || p.roles.includes('public')) && (p.using === 'true' || p.using === null));
  if (exposed.length) add('warning', `public.${table} : lecture ouverte à anon par « ${exposed.map(p => p.name).join('», «')} » (${tables.get(`public.${table}`)?.rows ?? '?'} ligne(s)) — fermée par P0.A1`);
}
const listing = policies.filter(p => p.schema === 'storage' && p.table === 'objects' && p.cmd === 'SELECT' && /project-images/.test(p.using ?? ''));
for (const p of listing) add('info', `storage.objects « ${p.name} » : ${p.roles.join(',')} (listage project-images) — retirée par 20261030150100`);

// ── Tables du portfolio sans RLS ──
for (const t of inv.tables.filter(t => t.schema === 'public' && !t.rls)) {
  add('warning', `public.${t.name} : RLS désactivée (${t.rows} ligne(s)) — lisible et modifiable par tout client si des droits sont accordés`);
}

// ── Buckets ──
const docBucket = inv.buckets.find(b => b.id === 'portfolio-public-documents');
if (docBucket) add('warning', `Bucket portfolio-public-documents déjà présent (${docBucket.objects} objet(s))`);
for (const b of inv.buckets) add('info', `Bucket ${b.id} : ${b.public ? 'public' : 'privé'}, ${b.objects} objet(s), ${(b.bytes / 1024 / 1024).toFixed(1)} Mo`);
// Images existantes face aux limites que P0.A1 applique à project-images (JPEG, PNG, WebP ; 3 Mo)
const images = inv.buckets.find(b => b.id === 'project-images');
if (images?.types) {
  const outside = Object.entries(images.types).filter(([mime]) => !['image/jpeg', 'image/png', 'image/webp'].includes(mime));
  const count = outside.reduce((n, [, c]) => n + c, 0);
  const largest = `${(images.largest_bytes / 1024 / 1024).toFixed(1)} Mo`;
  if (count || images.over_3mb) {
    add('warning', `project-images : ${count} fichier(s) hors JPEG/PNG/WebP${count ? ` (${outside.map(([m, c]) => `${m} ×${c}`).join(', ')})` : ''} et ${images.over_3mb} de plus de 3 Mo (le plus grand : ${largest}). Ils resteraient affichés ; seul un nouvel envoi de ce genre serait refusé. Limites à décider avant P0.A1`);
  } else {
    add('info', `project-images : les fichiers existants respectent déjà les limites prévues (JPEG/PNG/WebP, 3 Mo au plus ; le plus grand : ${largest})`);
  }
}

// ── Volumétrie (sauvegarde) ──
const publicRows = inv.tables.filter(t => t.schema === 'public').reduce((n, t) => n + t.rows, 0);
add('info', `public : ${inv.tables.filter(t => t.schema === 'public').length} table(s), ${publicRows} ligne(s) au total`);

for (const level of ['blocking', 'warning', 'info']) {
  const label = { blocking: 'BLOCAGES', warning: 'POINTS D’ATTENTION', info: 'CONSTATS' }[level];
  console.log(`\n${label} (${findings[level].length})`);
  for (const f of findings[level]) console.log(`  - ${f}`);
}
process.exitCode = findings.blocking.length ? 1 : 0;

#!/usr/bin/env node
// Phase 0 : toutes les vérifications locales à partir de VOS deux fichiers de production, sans
// aucune connexion à Supabase. Enchaîne :
//   1. lecture de l'inventaire (version, RLS, politiques, administrateurs et TOTP, stockage) ;
//   2. comparaison avec les migrations (compare-inventory.mjs) ;
//   3. vérification de la sauvegarde par restauration isolée (verify-backup.mjs) ;
//   4. répétition complète sur une copie de vos données (rehearsal/run.mjs --from-backup) ;
//   5. génération de la restauration de la configuration d'accès (restauration.sql).
//
//   node supabase/checks/phase0.mjs supabase/checks/results/production-inventory.json D:\portfolio-sauvegardes\<horodatage>
//
// Rapport écrit dans supabase/checks/results/phase0-rapport.md (dossier ignoré par Git) :
// il ne contient ni donnée personnelle ni secret, seulement la structure et des nombres.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseInventory, restoreSql } from './restore-from-inventory.mjs';
import { IMAGES } from '../backup/restore-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESULTS = path.join(ROOT, 'supabase', 'checks', 'results');

const short = (text, n = 140) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const cell = text => String(text).replace(/\|/g, '\\|');

/** Synthèse lisible de l'inventaire : aucune donnée personnelle (l'inventaire n'en contient pas) */
export function summarizeInventory(inv) {
  const out = [];
  const major = Math.floor(inv.server.version_num / 10000);
  out.push('## 1. Inventaire de production', '');
  out.push(`- Inventaire du ${inv.generated_at}, PostgreSQL ${inv.server.version} (majeure ${major}), base de ${inv.server.database_size_mb} Mo, rôle ${inv.server.current_user}`);
  out.push(`- Administrateurs (admin_users) : ${inv.auth.admins ?? 'table absente'} ; avec un TOTP vérifié : ${inv.auth.admins_with_verified_totp ?? '?'}`);
  out.push(`- Comptes Auth : ${inv.auth.tables?.users ?? '?'} ; facteurs TOTP vérifiés (tous comptes) : ${inv.auth.verified_totp_factors ?? '?'}`);
  const vault = inv.extensions.find(e => e.name === 'supabase_vault');
  out.push(`- Vault : ${vault ? `${vault.version} (${inv.vault.secrets} secret(s) existant(s))` : 'absent'}`);
  out.push(`- Journaux : log_statement=${inv.server.log_statement}, log_min_duration_statement=${inv.server.log_min_duration_statement}, log_parameter_max_length=${inv.server.log_parameter_max_length}, pgaudit.log=${inv.server.pgaudit_log ?? 'absent'}`);
  out.push(`- Historique de migrations Supabase CLI : ${inv.migration_history ? inv.migration_history.split(',').length + ' version(s)' : 'aucun'}`);

  out.push('', '### Tables de public et RLS', '', '| Table | RLS | Lignes | Politiques |', '|---|---|---|---|');
  for (const t of inv.tables.filter(t => t.schema === 'public')) {
    const n = inv.policies.filter(p => p.schema === 'public' && p.table === t.name).length;
    out.push(`| ${cell(t.name)} | ${t.rls ? (t.force_rls ? 'oui (forcée)' : 'oui') : '**NON**'} | ${t.rows} | ${n} |`);
  }

  for (const schema of ['public', 'storage']) {
    const list = inv.policies.filter(p => p.schema === schema);
    out.push('', `### Politiques ${schema === 'public' ? 'des tables' : 'du stockage'} (${list.length})`, '',
      '| Table | Politique | Type | Opération | Rôles | Condition |', '|---|---|---|---|---|---|');
    for (const p of list) {
      const condition = [p.using != null ? `using ${short(p.using, 90)}` : '', p.with_check != null ? `check ${short(p.with_check, 90)}` : ''].filter(Boolean).join(' ; ');
      out.push(`| ${cell(p.table)} | ${cell(p.name)} | ${p.permissive === 'RESTRICTIVE' ? 'restrictive' : 'permissive'} | ${p.cmd} | ${cell(p.roles.join(', '))} | ${cell(condition)} |`);
    }
  }

  out.push('', '### Buckets', '', '| Bucket | Public | Objets | Taille | Limite | Types |', '|---|---|---|---|---|---|');
  for (const b of inv.buckets) {
    out.push(`| ${cell(b.id)} | ${b.public ? 'oui' : 'non'} | ${b.objects} | ${(b.bytes / 1024 / 1024).toFixed(1)} Mo | ${b.file_size_limit ?? 'aucune'} | ${cell(b.allowed_mime_types?.join(', ') ?? 'tous')} |`);
  }

  const fns = inv.functions.filter(f => f.schema === 'public');
  out.push('', `### Fonctions de public (${fns.length})`, '');
  for (const f of fns) out.push(`- ${f.name}(${f.arguments}) → ${f.returns}${f.security_definer ? ', SECURITY DEFINER' : ''}, propriétaire ${f.owner}`);
  return out.join('\n');
}

function run(label, args, extraEnv = {}) {
  console.log(`▶ ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim();
  console.log(output.split('\n').map(l => `   ${l}`).join('\n'));
  return { ok: r.status === 0, output };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const outDir = args.includes('--out') ? path.resolve(args.splice(args.indexOf('--out'), 2)[1]) : RESULTS;
  const [inventoryFile, backupDir] = args;
  if (!inventoryFile || !backupDir) {
    console.error('Usage : node supabase/checks/phase0.mjs <inventaire.json> <dossier-de-sauvegarde> [--out <dossier du rapport>]');
    process.exit(2);
  }
  const inv = parseInventory(fs.readFileSync(inventoryFile, 'utf8'));
  const major = Math.floor(inv.server.version_num / 10000);
  const image = process.env.SUPABASE_PG_IMAGE ?? IMAGES[major];
  fs.mkdirSync(outDir, { recursive: true });

  const sections = [`# Phase 0 — rapport de vérification (${new Date().toISOString()})`, '',
    'Produit par `supabase/checks/phase0.mjs`, sans connexion à Supabase. Ni donnée personnelle ni secret.', '',
    summarizeInventory(inv)];
  const steps = [];
  const record = (title, result) => {
    steps.push({ title, ok: result.ok });
    sections.push('', `## ${title} : ${result.ok ? 'RÉUSSI' : 'ÉCHEC'}`, '', '```text', result.output, '```');
  };

  record('2. Comparaison avec les migrations', run('Comparaison avec les migrations', ['supabase/checks/compare-inventory.mjs', inventoryFile]));
  if (!image) {
    record('3. Vérification de la sauvegarde', { ok: false, output: `PostgreSQL ${major} : aucune image de banc connue. Relancez avec SUPABASE_PG_IMAGE=public.ecr.aws/supabase/postgres:<version>.` });
  } else {
    record('3. Vérification de la sauvegarde (restauration isolée, sans réseau)',
      run(`Vérification de la sauvegarde (${image})`, ['supabase/backup/verify-backup.mjs', backupDir, inventoryFile, '--image', image]));
    record('4. Répétition sur une copie de vos données (migrations, contrôles, retour arrière)',
      run('Répétition sur la copie', ['supabase/tests/rehearsal/run.mjs', '--from-backup', backupDir], { SUPABASE_PG_IMAGE: image }));
  }
  const restoreFile = path.join(outDir, 'restauration.sql');
  fs.writeFileSync(restoreFile, restoreSql(inv), 'utf8');
  steps.push({ title: '5. restauration.sql généré', ok: true });
  sections.push('', '## 5. Restauration de la configuration d’accès', '', `Fichier : \`${restoreFile}\` (à exécuter seulement après les scripts de retour arrière).`);

  const failed = steps.filter(s => !s.ok);
  sections.splice(4, 0, '', '## Bilan', '', ...steps.map(s => `- ${s.ok ? '✔' : '✗'} ${s.title}`), '',
    failed.length ? `**${failed.length} étape(s) en échec : aucune opération de production avant correction.**` : '**Toutes les vérifications locales sont réussies.** Les prérequis manuels (MFA, Vercel, VM) restent à confirmer.', '');
  const report = path.join(outDir, 'phase0-rapport.md');
  fs.writeFileSync(report, sections.join('\n') + '\n', 'utf8');
  console.log(`\nRapport : ${report}\nBILAN : ${steps.length - failed.length} / ${steps.length} étapes réussies`);
  process.exitCode = failed.length ? 1 : 0;
}

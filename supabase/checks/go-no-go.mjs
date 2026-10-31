#!/usr/bin/env node
// Rapport GO / NO-GO unique avant la mise en production : réunit l'inventaire, la sauvegarde, la
// répétition sur copie, l'inventaire de la VM et les relevés des dashboards (releves.json, qui
// remplace les captures d'écran). Aucune connexion à la production ; rien n'y est modifié.
//
//   node supabase/checks/go-no-go.mjs [--inventaire <json>] [--sauvegarde <dossier>] [--vm <fichier>] [--releves <json>]
//
// Sans option : fichiers attendus dans supabase/checks/results/ (inventaire, relevés) et
// D:\portfolio-sauvegardes (vm-inventaire.txt). Sans sauvegarde indiquée, la plus récente de ce dossier.
// Rapport : supabase/checks/results/RAPPORT-GO-NO-GO.md, ignoré par Git.
//
// GO signifie seulement que la phase 1 peut être demandée : chaque phase garde son autorisation.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESULTS = path.join(ROOT, 'supabase', 'checks', 'results');
const BACKUPS = 'D:\\portfolio-sauvegardes';

const answered = value => value !== null && value !== undefined && value !== '';

/** Conditions et informations, à partir de faits déjà recueillis : aucun accès disque ni réseau */
export function evaluate({ inventory, phase0, vm, releves }) {
  const r = releves ?? {};
  const blocking = [
    ['Inventaire de production reçu', inventory.ok, inventory.detail],
    ['Sauvegarde vérifiée, répétition sur copie identique (phase0.mjs)', phase0.ok, phase0.detail],
    ['Mot de passe de la base connu, sans réinitialisation', r.supabase?.motDePasseBaseConnu === true, ''],
    ['Hôte du pooler et certificat récupérés', answered(r.supabase?.hotePooler) && r.supabase?.certificatTelecharge === true, ''],
    ['Vercel : branche, offre, domaines et noms des variables relevés',
      ['brancheProduction', 'offre', 'autoAssignDomaines', 'nomsVariables'].every(k => answered(r.vercel?.[k])), ''],
    ['Inventaire de la VM reçu, sans secret', vm.ok, vm.detail],
    ['Ports de la console Oracle vérifiés (22, 80, 443 ; ni 5000 ni 27017)', r.oracle?.portsConsoleVerifies === true, ''],
    ['Recette locale réelle réussie (document 20)', r.recette?.reussie === true, r.recette?.date ?? ''],
  ].map(([label, ok, detail]) => ({ label, ok: !!ok, detail: detail ?? '' }));

  const unavailable = value => (answered(value) ? String(value) : 'indisponible');
  const information = [
    ['Type de SMTP', r.supabase?.smtp],
    ['Modèles d’e-mails vérifiés', r.supabase?.modelesEmailsVerifies],
    ['Sauvegardes automatiques Supabase', r.supabase?.sauvegardesAutomatiques],
    ['Performance Advisor', r.supabase?.performanceAdvisor],
  ].map(([label, value]) => ({ label, value: unavailable(value) }));
  const decisions = [
    ['Acheminement du code vers Oracle', r.decisions?.acheminementCode],
    ['Fermer les inscriptions', r.decisions?.fermerInscriptions],
    ['Formats d’images des projets', r.decisions?.formatsImages],
  ].map(([label, value]) => ({ label, value: answered(value) ? String(value) : 'à décider' }));

  return { go: blocking.every(c => c.ok), blocking, information, decisions };
}

export function renderReport(result, date = new Date().toISOString()) {
  const missing = result.blocking.filter(c => !c.ok);
  const cell = text => String(text).replace(/\|/g, '\\|');
  return [
    `# Rapport GO / NO-GO (${date})`, '',
    `**Verdict : ${result.go ? 'GO' : 'NO-GO'}.** ${result.go
      ? 'La phase 1 peut être demandée ; chaque phase garde son autorisation explicite.'
      : `${missing.length} condition(s) bloquante(s) à lever.`} Aucune migration de production n’est autorisée par ce rapport.`, '',
    '## Conditions bloquantes', '', '| Condition | État | Détail |', '|---|---|---|',
    ...result.blocking.map(c => `| ${cell(c.label)} | ${c.ok ? '✔' : '✗'} | ${cell(c.detail)} |`), '',
    '## Informations non bloquantes', '', '| Information | Valeur |', '|---|---|',
    ...result.information.map(i => `| ${cell(i.label)} | ${cell(i.value)} |`), '',
    '## Décisions', '', '| Décision | Réponse |', '|---|---|',
    ...result.decisions.map(d => `| ${cell(d.label)} | ${cell(d.value)} |`), '',
    'Détail technique de l’inventaire, de la sauvegarde et de la répétition : `phase0-rapport.md`.', '',
  ].join('\n');
}

function latestBackup() {
  if (!fs.existsSync(BACKUPS)) return null;
  const dirs = fs.readdirSync(BACKUPS, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  return dirs.length ? path.join(BACKUPS, dirs.at(-1)) : null;
}

function checkVm(file) {
  if (!fs.existsSync(file)) return { ok: false, detail: `absent : ${file}` };
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return { ok: false, detail: 'fichier vide' };
  const { keyPatterns } = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/secret-patterns.json'), 'utf8'));
  const leaked = keyPatterns.filter(p => new RegExp(p.regex).test(text)).map(p => p.name);
  return leaked.length ? { ok: false, detail: `secret possible : ${leaked.join(', ')}` } : { ok: true, detail: '' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const option = name => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? path.resolve(process.argv[i + 1]) : null;
  };
  const inventoryFile = option('inventaire') ?? path.join(RESULTS, 'production-inventory.json');
  const backupDir = option('sauvegarde') ?? latestBackup();
  const vmFile = option('vm') ?? path.join(BACKUPS, 'vm-inventaire.txt');
  const relevesFile = option('releves') ?? path.join(RESULTS, 'releves.json');

  const inventory = fs.existsSync(inventoryFile) ? { ok: true, detail: '' } : { ok: false, detail: `absent : ${inventoryFile}` };
  let phase0 = { ok: false, detail: 'non lancé : inventaire ou sauvegarde absents' };
  if (inventory.ok && backupDir) {
    const run = spawnSync(process.execPath, ['supabase/checks/phase0.mjs', inventoryFile, backupDir], { cwd: ROOT, stdio: 'inherit' });
    phase0 = { ok: run.status === 0, detail: run.status === 0 ? '' : 'voir phase0-rapport.md' };
  }
  const releves = fs.existsSync(relevesFile) ? JSON.parse(fs.readFileSync(relevesFile, 'utf8')) : null;

  const result = evaluate({ inventory, phase0, vm: checkVm(vmFile), releves });
  fs.mkdirSync(RESULTS, { recursive: true });
  const report = path.join(RESULTS, 'RAPPORT-GO-NO-GO.md');
  fs.writeFileSync(report, renderReport(result), 'utf8');
  console.log(`${result.go ? 'GO' : 'NO-GO'} — ${result.blocking.filter(c => c.ok).length} / ${result.blocking.length} conditions levées\nRapport : ${report}`);
  process.exitCode = result.go ? 0 : 1;
}

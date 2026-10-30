#!/usr/bin/env node
// Contrôle du bundle frontend : aucune clé privée, aucun appel direct à un fournisseur IA.
//
//   node scripts/check-bundle-secrets.mjs [dossier=dist]
//
// Recherche dans tous les fichiers du build :
//   1. les motifs de clés connus (scripts/secret-patterns.json)
//   2. les hôtes d'API des fournisseurs IA (le navigateur ne doit appeler que blog-api)
//   3. les jetons JWT Supabase de rôle service_role
//   4. la VALEUR exacte de chaque secret des fichiers .env locaux (hors variables publiques)
// N'affiche jamais une valeur : uniquement le type de problème, le fichier et le NOM de variable.
// Code de sortie 1 si au moins un problème est trouvé.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'secret-patterns.json'), 'utf8'));
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local', '.env.docker', 'blog-api/.env'];
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|URI|CREDENTIAL/i;

/** Valeurs des secrets des fichiers .env locaux, indexées par nom de variable (jamais affichées) */
export function loadLocalSecretValues(root = ROOT) {
  const values = new Map();
  for (const rel of ENV_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const [, name, raw] = m;
      const value = raw.replace(/^(['"])(.*)\1$/, '$2').trim();
      if (CONFIG.publicEnvAllowlist.includes(name) || !SECRET_NAME.test(name) || value.length < 12) continue;
      values.set(`${rel}:${name}`, value);
    }
  }
  return values;
}

function isServiceRoleJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

/** Analyse un texte ; renvoie des constats SANS valeur secrète */
export function scanText(text, { secretValues = new Map() } = {}) {
  const findings = [];
  for (const { name, regex } of CONFIG.keyPatterns) {
    if (new RegExp(regex).test(text)) findings.push({ type: 'key-pattern', name });
  }
  for (const host of CONFIG.providerHosts) {
    if (text.includes(host)) findings.push({ type: 'provider-host', name: host });
  }
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    if (isServiceRoleJwt(jwt)) { findings.push({ type: 'key-pattern', name: 'JWT Supabase service_role' }); break; }
  }
  for (const [name, value] of secretValues) {
    if (text.includes(value)) findings.push({ type: 'env-value', name });
  }
  return findings;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

export function scanDirectory(dir, options = {}) {
  const secretValues = options.secretValues ?? loadLocalSecretValues();
  const results = [];
  for (const file of walk(dir)) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp4|webm|pdf|wasm)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const f of scanText(text, { secretValues })) results.push({ ...f, file: path.relative(dir, file) });
  }
  return results;
}

// ── Exécution en ligne de commande ────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.resolve(process.argv[2] ?? path.join(ROOT, 'dist'));
  if (!fs.existsSync(dir)) {
    console.error(`Dossier introuvable : ${dir} (lancer d'abord le build)`);
    process.exit(2);
  }
  const secretValues = loadLocalSecretValues();
  const findings = scanDirectory(dir, { secretValues });
  console.log(`Analyse de ${dir} — ${secretValues.size} valeur(s) secrète(s) locale(s) comparée(s) (non affichées)`);
  if (findings.length === 0) {
    console.log('✔ Aucun secret ni appel direct à un fournisseur IA dans le bundle');
    process.exit(0);
  }
  for (const f of findings) console.log(`✗ [${f.type}] ${f.name} — ${f.file}`);
  process.exit(1);
}

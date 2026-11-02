#!/usr/bin/env node
// Chemin d'administration non prévisible (src/lib/adminRoute.ts).
//
//   node scripts/admin-route.mjs generate [--name production] [--force]
//       crée secrets/admin-route/<nom>.txt (192 bits aléatoires) et affiche uniquement l'empreinte
//   node scripts/admin-route.mjs hash [--name production]
//       réaffiche l'empreinte à placer dans VITE_ADMIN_ROUTE_HASH (Vercel, Docker, env/<mode>)
//   node scripts/admin-route.mjs check --env <fichier> [--name production]
//       vérifie que le fichier d'environnement contient l'empreinte de ce chemin
//
// Le chemin lui-même n'est jamais affiché : ouvrez secrets/admin-route/<nom>.txt et conservez-le
// dans votre gestionnaire de mots de passe. --force remplace le chemin (l'ancien cesse de
// fonctionner au prochain déploiement portant la nouvelle empreinte).

import path from 'node:path';
import { ROOT, ensureSegment, envHash, hashSegment, readSegment, routeFile } from './lib/admin-route.mjs';

const [command, ...args] = process.argv.slice(2);
const option = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = option('name') ?? 'production';
const file = path.relative(ROOT, routeFile(name));

try {
  if (command === 'generate') {
    const { created, hash } = ensureSegment(name, { force: args.includes('--force') });
    console.log(created ? `Chemin « ${name} » créé dans ${file} (non affiché).` : `Chemin « ${name} » déjà présent dans ${file} : conservé (--force pour le remplacer).`);
    console.log(`VITE_ADMIN_ROUTE_HASH=${hash}`);
  } else if (command === 'hash') {
    const segment = readSegment(name);
    if (!segment) throw new Error(`${file} absent : node scripts/admin-route.mjs generate --name ${name}`);
    console.log(`VITE_ADMIN_ROUTE_HASH=${hashSegment(segment)}`);
  } else if (command === 'check') {
    const env = option('env');
    if (!env) throw new Error('--env <fichier> requis');
    const segment = readSegment(name);
    if (!segment) throw new Error(`${file} absent`);
    const value = envHash(path.resolve(env));
    const ok = value === hashSegment(segment);
    console.log(ok ? `✔ ${env} : empreinte du chemin « ${name} »` : `✗ ${env} : ${value ? 'empreinte différente' : 'VITE_ADMIN_ROUTE_HASH absente'}`);
    process.exitCode = ok ? 0 : 1;
  } else {
    console.log('Usage : node scripts/admin-route.mjs generate|hash|check [--name <nom>] [--env <fichier>] [--force]');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}

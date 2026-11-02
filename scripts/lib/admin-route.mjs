// scripts/lib/admin-route.mjs
// Chemin d'administration non prévisible : génération et lecture locales (src/lib/adminRoute.ts).
// Le segment n'est écrit que dans secrets/admin-route/<nom>.txt (ignoré par Git), jamais affiché :
// seule son empreinte SHA-256 sort de ce poste (variable publique VITE_ADMIN_ROUTE_HASH).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROUTE_DIR = path.join(ROOT, 'secrets', 'admin-route');
export const SEGMENT_RE = /^[A-Za-z0-9_-]{32,128}$/;

export const routeFile = name => {
  if (!/^[a-z0-9-]{1,32}$/.test(name)) throw new Error(`Nom invalide : ${name}`);
  return path.join(ROUTE_DIR, `${name}.txt`);
};

/** 24 octets du générateur cryptographique du système : 32 caractères base64url, 192 bits */
export const newSegment = () => crypto.randomBytes(24).toString('base64url');

export const hashSegment = segment => crypto.createHash('sha256').update(segment, 'utf8').digest('hex');

export function readSegment(name) {
  const file = routeFile(name);
  if (!fs.existsSync(file)) return null;
  const segment = fs.readFileSync(file, 'utf8').trim();
  if (!SEGMENT_RE.test(segment)) throw new Error(`${path.relative(ROOT, file)} : contenu invalide`);
  return segment;
}

/** Crée le segment s'il n'existe pas (ou le remplace avec force) ; renvoie son empreinte */
export function ensureSegment(name, { force = false } = {}) {
  const existing = force ? null : readSegment(name);
  if (existing) return { created: false, hash: hashSegment(existing) };
  fs.mkdirSync(ROUTE_DIR, { recursive: true });
  const segment = newSegment();
  fs.writeFileSync(routeFile(name), `${segment}\n`, { mode: 0o600 });
  return { created: true, hash: hashSegment(segment) };
}

/** Adresse complète du dashboard pour un environnement (outils locaux uniquement, jamais affichée) */
export function adminUrl(name, base) {
  const segment = readSegment(name);
  if (!segment) throw new Error(`Chemin d'administration « ${name} » absent : node scripts/admin-route.mjs generate --name ${name}`);
  return `${base.replace(/\/+$/, '')}/${segment}`;
}

/** Valeur de VITE_ADMIN_ROUTE_HASH dans un fichier d'environnement (null si absente) */
export function envHash(file) {
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(l => /^\s*VITE_ADMIN_ROUTE_HASH\s*=/.test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : null;
}

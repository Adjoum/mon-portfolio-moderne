// Règles du Security Advisor de Supabase (projet open source « splinter », celui du dashboard),
// exécutées sur une base locale jetable : elles prévoient les alertes que le dashboard affichera.
// Le fichier est téléchargé à une version figée, vérifié par empreinte et gardé hors du dépôt
// (licence non déclarée). Sans accès à GitHub, les contrôles sont simplement ignorés.
//
// Hors de portée : les alertes de configuration Auth (ex. auth_leaked_password_protection),
// qui ne sont pas des requêtes SQL.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const SPLINTER_COMMIT = 'fccca4b1c4d8b48b8ccd69bd6b30e84adcb92975';
const SPLINTER_SHA256 = 'd8d558baad3e03832e521c527907fa50a9a172fabd899dd0f5c2504a5a0e9349';
const SOURCE = `https://raw.githubusercontent.com/supabase/splinter/${SPLINTER_COMMIT}/splinter.sql`;

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

/** Texte de splinter.sql (cache local), ou null s'il est indisponible ou altéré */
export async function loadSplinter() {
  const cache = path.join(os.tmpdir(), `splinter-${SPLINTER_COMMIT}.sql`);
  if (fs.existsSync(cache) && sha256(fs.readFileSync(cache, 'utf8')) === SPLINTER_SHA256) return fs.readFileSync(cache, 'utf8');
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(20000) });
    const text = res.ok ? await res.text() : '';
    if (sha256(text) !== SPLINTER_SHA256) return null;
    fs.writeFileSync(cache, text);
    return text;
  } catch {
    return null;
  }
}

/**
 * Script psql : préambule de splinter (réglage local à la transaction), puis ses règles d’une
 * catégorie (SECURITY par défaut, ou PERFORMANCE) résumées en JSON. Transaction annulée :
 * rien n’est conservé dans la base.
 */
export function securityLintScript(splinter, category = 'SECURITY') {
  if (!/^[A-Z]+$/.test(category)) throw new Error(`catégorie invalide : ${category}`);
  const end = splinter.indexOf('end $$;');
  if (end < 0) throw new Error('splinter.sql : structure inattendue');
  const prelude = splinter.slice(0, end + 'end $$;'.length);
  const query = splinter.slice(end + 'end $$;'.length).trim().replace(/;\s*$/, '');
  return `begin;\n${prelude}\nselect coalesce(pg_catalog.json_agg(pg_catalog.json_build_object('name', l.name, 'level', l.level, 'key', l.cache_key, 'detail', l.detail) order by l.cache_key), '[]')
from (\n${query}\n) l where '${category}' = any(l.categories);\nrollback;\n`;
}

/** Alertes de sécurité d'une base : [{ name, key, detail }] */
export function parseLints(output) {
  const line = output.split('\n').map(l => l.trim()).find(l => l.startsWith('['));
  return line ? JSON.parse(line) : [];
}

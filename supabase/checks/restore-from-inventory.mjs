#!/usr/bin/env node
// Génère, à partir de l'inventaire pris AVANT les migrations, un script SQL qui rétablit
// exactement la configuration d'accès d'origine : état RLS des tables, politiques, définitions
// et droits des fonctions remplacées, droits des tables, limites des buckets. Aucune donnée
// applicative n'est touchée.
//
// À exécuter APRÈS les scripts supabase/rollback/*.down.sql (retour arrière complet) :
//   node supabase/checks/restore-from-inventory.mjs <inventaire.json> > restauration.sql
//
// Les politiques et fonctions ajoutées depuis l'inventaire (hors migrations du projet) ne sont
// pas modifiées. Les objets créés par les migrations P0.CV (table cv_versions, bucket) sont
// conservés par leur script de retour arrière : inertes, sans politique d'accès.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROLLBACK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollback');

/** Politiques que les scripts de retour arrière recréent (d'après l'état supposé lors de l'audit) */
export function policiesRecreatedByRollback(dir = ROLLBACK_DIR) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.sql')).flatMap(f =>
    [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/create policy\s+(?:"([^"]+)"|(\w+))\s+on\s+(\w+)\.(\w+)/gi)]
      .map(m => ({ name: m[1] ?? m[2], schema: m[3], table: m[4] })));
}

const ident = name => `"${String(name).replace(/"/g, '""')}"`;
const literal = value => `'${String(value).replace(/'/g, "''")}'`;
const roleList = roles => roles.map(r => (r === 'public' ? 'public' : ident(r))).join(', ');

/** Le SQL Editor peut exporter la cellule entourée de guillemets ou dans un tableau */
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

/** aclitem[] (texte) → rôles ayant EXECUTE ; null = droits par défaut (PUBLIC) */
export function executeGrantees(acl) {
  if (acl === null || acl === undefined) return ['public'];
  const items = acl.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  return items.flatMap(item => {
    const [grantee, rights] = item.replace(/^"|"$/g, '').split('=');
    return rights?.split('/')[0].includes('X') ? [grantee === '' ? 'public' : grantee] : [];
  });
}

export function restoreSql(inv, recreated = policiesRecreatedByRollback()) {
  const out = [];
  const push = (...lines) => out.push(...lines);

  push(
    `-- Rétablissement de la configuration d'accès d'origine (inventaire du ${inv.generated_at})`,
    '-- Généré par supabase/checks/restore-from-inventory.mjs : aucune donnée applicative n’est modifiée.',
    'begin;',
    '',
  );

  // 1. État RLS des tables existantes
  push('-- 1. Sécurité au niveau des lignes (RLS), table par table');
  for (const t of inv.tables.filter(t => t.schema === 'public')) {
    const name = `public.${ident(t.name)}`;
    push(`do $$ begin if to_regclass(${literal(`public.${ident(t.name)}`)}) is not null then`,
      `  alter table ${name} ${t.rls ? 'enable' : 'disable'} row level security;`,
      `  alter table ${name} ${t.force_rls ? 'force' : 'no force'} row level security;`,
      'end if; end $$;');
  }

  // 2. Politiques : celles des migrations retirées, celles d'origine recréées à l'identique
  push('', '-- 2. Politiques');
  push(`do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname in ('public', 'storage') and (policyname like 'p0a1\\_%' or policyname like 'p0cv\\_%')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;`);
  // Politiques supposées par les scripts de retour arrière mais absentes de l'état réel
  for (const p of recreated) {
    if (inv.policies.some(x => x.schema === p.schema && x.table === p.table && x.name === p.name)) continue;
    push(`drop policy if exists ${ident(p.name)} on ${ident(p.schema)}.${ident(p.table)};`);
  }
  for (const p of inv.policies) {
    const table = `${ident(p.schema)}.${ident(p.table)}`;
    push(`drop policy if exists ${ident(p.name)} on ${table};`);
    push([
      `create policy ${ident(p.name)} on ${table}`,
      `  as ${p.permissive === 'RESTRICTIVE' ? 'restrictive' : 'permissive'}`,
      `  for ${p.cmd.toLowerCase()}`,
      `  to ${roleList(p.roles)}`,
      p.using !== null && p.using !== undefined ? `  using (${p.using})` : null,
      p.with_check !== null && p.with_check !== undefined ? `  with check (${p.with_check})` : null,
    ].filter(Boolean).join('\n') + ';');
  }

  // 3. Fonctions remplacées par les migrations : définition et droits d'origine
  push('', '-- 3. Fonctions remplacées : définition et droits d’origine');
  for (const f of inv.functions.filter(f => f.schema === 'public' && f.definition)) {
    const signature = `public.${ident(f.name)}(${f.arguments})`;
    push(`${f.definition.trim().replace(/;?\s*$/, '')};`);
    push(`revoke all on function ${signature} from public, anon, authenticated, service_role;`);
    for (const grantee of executeGrantees(f.acl)) push(`grant execute on function ${signature} to ${grantee === 'public' ? 'public' : ident(grantee)};`);
  }

  // 4. Droits des rôles clients sur les tables d'origine
  push('', '-- 4. Droits des rôles clients sur les tables');
  const grants = new Map();
  for (const g of inv.grants.filter(g => g.schema === 'public')) {
    if (!grants.has(g.table)) grants.set(g.table, []);
    grants.get(g.table).push(g);
  }
  for (const t of inv.tables.filter(t => t.schema === 'public')) {
    const name = `public.${ident(t.name)}`;
    push(`do $$ begin if to_regclass(${literal(`public.${ident(t.name)}`)}) is not null then`);
    push(`  revoke all on table ${name} from anon, authenticated, service_role;`);
    for (const g of grants.get(t.name) ?? []) push(`  grant ${g.privileges.split(',').map(s => s.toLowerCase()).join(', ')} on table ${name} to ${ident(g.grantee)};`);
    push('end if; end $$;');
  }

  // 5. Limites des buckets (P0.A1 restreint celles de project-images)
  push('', '-- 5. Limites des buckets d’origine (taille, types de fichiers)');
  for (const b of inv.buckets ?? []) {
    const size = b.file_size_limit !== null && Number.isSafeInteger(Number(b.file_size_limit)) ? Number(b.file_size_limit) : 'null';
    const types = Array.isArray(b.allowed_mime_types) ? `array[${b.allowed_mime_types.map(literal).join(', ')}]::text[]` : 'null';
    push(`do $$ begin
  update storage.buckets set file_size_limit = ${size}, allowed_mime_types = ${types} where id = ${literal(b.id)};
exception when insufficient_privilege then
  raise warning 'Limites du bucket % non rétablies (droits insuffisants) : à régler dans le dashboard', ${literal(b.id)};
end $$;`);
  }

  push('', 'commit;', '');
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage : node supabase/checks/restore-from-inventory.mjs <inventaire.json> > restauration.sql');
    process.exit(2);
  }
  process.stdout.write(restoreSql(parseInventory(fs.readFileSync(file, 'utf8'))));
}

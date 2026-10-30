// Outils de mise en production Supabase et Oracle : inventaire, comparaison, restauration,
// sauvegarde. Contrôles sans base ni réseau ; la répétition complète est
// supabase/tests/rehearsal/run.mjs (Docker).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
// @ts-expect-error module JavaScript sans déclaration de types
import { restoreSql, executeGrantees, parseInventory } from '../../supabase/checks/restore-from-inventory.mjs'
// @ts-expect-error module JavaScript sans déclaration de types
import { adaptSql } from '../../supabase/backup/restore-lib.mjs'
// @ts-expect-error module JavaScript sans déclaration de types
import { summarizeInventory, comparisonStep } from '../../supabase/checks/phase0.mjs'
// @ts-expect-error module JavaScript sans déclaration de types
import { securityLintScript, parseLints } from '../../supabase/tests/advisor/splinter.mjs'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

type Table = { schema: string; name: string; rls: boolean; force_rls: boolean; rows: number; owner?: string; owner_ok?: boolean }
type Policy = { schema: string; table: string; name: string; permissive: string; roles: string[]; cmd: string; using: string | null; with_check: string | null }
type Bucket = { id: string; public?: boolean; file_size_limit: number | string | null; allowed_mime_types: string[] | null; objects?: number; bytes?: number; types?: Record<string, number>; largest_bytes?: number; over_3mb?: number }
type Inventory = {
  server: Record<string, string | number | boolean | unknown[]>
  tables: Table[]; policies: Policy[]; buckets: Bucket[]
  auth: { tables: Record<string, number>; verified_totp_factors: number | null; admins: number | null; admins_with_verified_totp: number | null }
  [section: string]: unknown
}

/** Inventaire minimal d'un projet prêt pour les migrations */
const inventory = (patch: (inv: Inventory) => void = () => {}) => {
  const inv: Inventory = {
    inventory_version: 'p1ai.1',
    generated_at: '2026-10-30T12:00:00Z',
    server: {
      version: '17.6', version_num: 170006, current_user: 'postgres', can_create_roles: true, database_size_mb: 12,
      log_parameter_max_length_on_error: '0', log_min_error_statement: 'error', log_statement: 'ddl',
      log_min_duration_statement: '-1', log_parameter_max_length: '-1', pgaudit_log: 'none',
      pgaudit_log_parameter: 'off', role_settings: [],
    },
    extensions: [{ name: 'supabase_vault', version: '0.3.1', schema: 'vault' }],
    vault: { schema_present: true, secrets: 0, create_secret_executable: true },
    schemas: ['auth', 'public', 'storage', 'vault'],
    roles: [{ name: 'postgres', login: true, createrole: true }],
    tables: [{ schema: 'public', name: 'visits', rls: true, force_rls: false, rows: 2908 }],
    columns: [], constraints: [], functions: [], triggers: [], grants: [], buckets: [],
    policies: [{ schema: 'public', table: 'visits', name: 'Public read visits', permissive: 'PERMISSIVE',
                 roles: ['anon'], cmd: 'SELECT', using: 'true', with_check: null }],
    auth: { tables: { users: 1 }, verified_totp_factors: 1, admins: 1, admins_with_verified_totp: 1 },
    migration_history: null,
  }
  patch(inv)
  return inv
}

const compare = (inv: unknown) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventaire-'))
  const file = path.join(dir, 'inventaire.json')
  // Le SQL Editor exporte parfois la cellule dans un tableau : format accepté
  fs.writeFileSync(file, JSON.stringify([{ inventory: JSON.stringify(inv) }]))
  const r = spawnSync(process.execPath, [path.join(ROOT, 'supabase/checks/compare-inventory.mjs'), file], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  const blocking = r.stdout.split('\nPOINTS')[0]
  return { status: r.status, out: r.stdout, blocking }
}

describe('comparaison de l’inventaire avec les migrations', () => {
  it('projet prêt : aucun blocage, lecture publique de visits signalée', () => {
    const r = compare(inventory())
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/BLOCAGES \(0\)/)
    expect(r.out).toMatch(/public\.visits : lecture ouverte à anon/)
  })

  it('administrateur sans TOTP vérifié : blocage', () => {
    const r = compare(inventory(inv => { inv.auth.admins_with_verified_totp = 0 }))
    expect(r.status).toBe(1)
    expect(r.blocking).toMatch(/sans TOTP vérifié/)
  })

  it('admin_users vide : blocage', () => {
    const r = compare(inventory(inv => { inv.auth.admins = 0; inv.auth.admins_with_verified_totp = 0 }))
    expect(r.status).toBe(1)
    expect(r.blocking).toMatch(/admin_users est vide/)
  })

  it('table existante sans les colonnes attendues : blocage', () => {
    const r = compare(inventory(inv => { inv.tables.push({ schema: 'public', name: 'admin_users', rls: true, force_rls: false, rows: 1 }) }))
    expect(r.status).toBe(1)
    expect(r.blocking).toMatch(/public\.admin_users existe déjà SANS les colonnes/)
  })

  it('collision avec une table du centre IA : blocage', () => {
    const r = compare(inventory(inv => { inv.tables.push({ schema: 'public', name: 'ai_providers', rls: false, force_rls: false, rows: 0 }) }))
    expect(r.status).toBe(1)
    expect(r.blocking).toMatch(/ai_providers existe déjà/)
  })

  it('journalisation des paramètres de requête : blocage (les clés API seraient écrites dans les journaux)', () => {
    expect(compare(inventory(inv => { inv.server.log_statement = 'all' })).blocking).toMatch(/log_statement = all/)
    expect(compare(inventory(inv => { inv.server.pgaudit_log = 'write, function'; inv.server.pgaudit_log_parameter = 'on' })).blocking).toMatch(/pgaudit/)
    // Paramètres tronqués à 0 : rien n'est journalisé
    expect(compare(inventory(inv => { inv.server.log_statement = 'all'; inv.server.log_parameter_max_length = '0' })).status).toBe(0)
  })

  it('images existantes de project-images comparées aux limites prévues (JPEG/PNG/WebP, 3 Mo)', () => {
    const images = (types: Record<string, number>, over: number) => compare(inventory(inv => {
      inv.buckets = [{ id: 'project-images', public: true, file_size_limit: null, allowed_mime_types: null, objects: 5, bytes: 1,
                       types, largest_bytes: 4194304, over_3mb: over }]
    }))
    const outside = images({ 'image/png': 3, 'image/gif': 1, 'image/svg+xml': 1 }, 1)
    expect(outside.status).toBe(0)
    expect(outside.out).toMatch(/project-images : 2 fichier\(s\) hors JPEG\/PNG\/WebP \(image\/gif ×1, image\/svg\+xml ×1\) et 1 de plus de 3 Mo \(le plus grand : 4\.0 Mo\)/)
    expect(images({ 'image/jpeg': 2, 'image/webp': 3 }, 0).out).toMatch(/respectent déjà les limites prévues/)
  })

  it('listage de project-images : politiques retirées nommées, autres lectures signalées', () => {
    const storage = (name: string, using: string, roles = ['public']): Policy =>
      ({ schema: 'storage', table: 'objects', name, permissive: 'PERMISSIVE', roles, cmd: 'SELECT', using, with_check: null })
    const r = compare(inventory(inv => {
      inv.policies.push(storage('Public Access project images', "(bucket_id = 'project-images'::text)"))
      inv.policies.push(storage('Lecture connectée', "((bucket_id = 'project-images'::text) AND (auth.role() = 'authenticated'::text))", ['authenticated']))
    }))
    expect(r.out).toMatch(/« Public Access project images » \(public\) : listage de project-images — retirée par 20261030150100/)
    expect(r.out).toMatch(/« Lecture connectée » \(authenticated, .*\) : lecture de project-images conservée/)
  })

  it('table de production inconnue du projet : signalée avec ses politiques, sans blocage', () => {
    const r = compare(inventory(inv => {
      inv.tables.push({ schema: 'public', name: 'certifications', rls: true, force_rls: false, rows: 3 })
      inv.policies.push({ schema: 'public', table: 'certifications', name: 'Lecture publique', permissive: 'PERMISSIVE', roles: ['anon'], cmd: 'SELECT', using: 'true', with_check: null })
    }))
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/public\.certifications : table inconnue du projet, non modifiée par les migrations \(3 ligne\(s\), RLS activée, 1 politique\(s\) : Lecture publique \[SELECT, anon\]\)/)
  })

  it('propriété : table ou fonction modifiée hors de portée de postgres → blocage', () => {
    const table = compare(inventory(inv => { inv.tables[0].owner = 'supabase_admin'; inv.tables[0].owner_ok = false }))
    expect(table.status).toBe(1)
    expect(table.blocking).toMatch(/public\.visits appartient à « supabase_admin »/)
    const fn = compare(inventory(inv => {
      inv.functions = [{ schema: 'public', name: 'set_updatedat', arguments: '', owner: 'supabase_admin', owner_ok: false, settings: null, source: 'begin new.updatedat = now(); return new; end;' }]
    }))
    expect(fn.blocking).toMatch(/public\.set_updatedat\(\) appartient à « supabase_admin »/)
    // storage.objects : vérifié par la répétition, pas bloquant
    expect(compare(inventory(inv => { inv.tables.push({ schema: 'storage', name: 'objects', rls: true, force_rls: false, rows: 1, owner: 'supabase_storage_admin', owner_ok: false }) })).status).toBe(0)
  })

  it('is_portfolio_admin actuelle décrite, écarts signalés ; déclencheurs et anciennes insertions annoncés', () => {
    const fn = (patch: Record<string, unknown>) => ({ schema: 'public', name: 'is_portfolio_admin', arguments: '', returns: 'boolean', security_definer: true,
      owner: 'postgres', owner_ok: true, settings: ['search_path=public'], acl: '{postgres=X/postgres,authenticated=X/postgres}',
      definition: 'CREATE OR REPLACE FUNCTION public.is_portfolio_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO \'public\' AS $function$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $function$', ...patch })
    const ok = compare(inventory(inv => {
      inv.functions = [fn({}),
        { schema: 'public', name: 'set_updatedat', arguments: '', owner: 'postgres', owner_ok: true, settings: null, source: '\nbegin\n  new.updatedat = now();\n  return new;\nend;\n' },
        { schema: 'public', name: 'update_updatedat_column', arguments: '', owner: 'postgres', owner_ok: true, settings: null, source: 'begin perform log_change(); return new; end;' }]
      inv.policies.push({ schema: 'public', table: 'contacts', name: 'Anyone can send a message', permissive: 'PERMISSIVE', roles: ['public'], cmd: 'INSERT', using: null, with_check: 'true' })
    }))
    expect(ok.out).toMatch(/is_portfolio_admin\(\) actuelle : SECURITY DEFINER, search_path=public, propriétaire postgres, droits \{postgres=X\/postgres,authenticated=X\/postgres\} ; lit public\.admin_users/)
    expect(ok.out).not.toMatch(/is_portfolio_admin actuelle (lit d'autres|ne se fonde|: SECURITY DEFINER sans)/)
    expect(ok.out).toMatch(/set_updatedat\(\) : search_path figé à '' par 20261030120200 \(corps : begin new\.updatedat = now\(\); return new; end;\)/)
    expect(ok.out).toMatch(/update_updatedat_column\(\) lit ou écrit d'autres objets : search_path non modifié/)
    expect(ok.out).toMatch(/public\.contacts « Anyone can send a message » \(insertion « with check true »\) : retirée par 20261030120200/)
    const risky = compare(inventory(inv => {
      inv.functions = [fn({ settings: null, definition: 'select exists (select 1 from public.profiles where role = $1)', arguments: 'p_role text' })]
    }))
    expect(risky.out).toMatch(/prend des arguments/)
    expect(risky.out).toMatch(/SECURITY DEFINER sans search_path fixé/)
    expect(risky.out).toMatch(/lit d'autres tables que admin_users \(public\.profiles\)/)
    expect(risky.out).toMatch(/ne se fonde pas sur auth\.uid\(\)/)
  })

  it('insertion publique bornée : colonnes ouvertes et colonnes fixées par la base', () => {
    const r = compare(inventory(inv => {
      inv.columns = ['page', 'referrer', 'created_at', 'id'].map(column => ({ table: 'visits', column }))
    }))
    expect(r.out).toMatch(/public\.visits : insertion publique limitée à page, referrer \(absentes : user_agent, language, screen, country, city/)
    expect(r.out).toMatch(/fixées par la base : created_at, id/)
  })

  it('PostgreSQL 15 : accepté, restauration annoncée par le client 17', () => {
    const r = compare(inventory(inv => { inv.server.version = '15.14'; inv.server.version_num = 150014 }))
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/pg_restore 17/)
    expect(compare(inventory(inv => { inv.server.version_num = 140010 })).status).toBe(1)
  })

  it('rôle sans droit de création de rôle : blocage', () => {
    expect(compare(inventory(inv => { inv.server.can_create_roles = false })).status).toBe(1)
  })
})

describe('rapport de phase 0 (synthèse de l’inventaire)', () => {
  it('version, RLS, politiques des tables et du stockage, administrateurs et TOTP, buckets', () => {
    const md: string = summarizeInventory(inventory(inv => {
      inv.tables.push({ schema: 'public', name: 'skills', rls: false, force_rls: false, rows: 4 })
      inv.policies.push({ schema: 'storage', table: 'objects', name: 'Public read project images', permissive: 'PERMISSIVE',
                          roles: ['public'], cmd: 'SELECT', using: "bucket_id = 'project-images'", with_check: null })
      inv.buckets = [{ id: 'project-images', public: true, file_size_limit: null, allowed_mime_types: null, objects: 9, bytes: 2097152,
                       types: { 'image/png': 7, 'image/gif': 2 }, largest_bytes: 1048576, over_3mb: 0 }]
    }))
    expect(md).toMatch(/PostgreSQL 17\.6 \(majeure 17\)/)
    expect(md).toMatch(/Administrateurs \(admin_users\) : 1 ; avec un TOTP vérifié : 1/)
    expect(md).toMatch(/\| visits \| oui \| 2908 \| 1 \|/)
    expect(md).toMatch(/\| skills \| \*\*NON\*\* \| 4 \| 0 \|/)
    expect(md).toMatch(/### Politiques du stockage \(1\)[\s\S]*Public read project images/)
    expect(md).toMatch(/\| project-images \| oui \| 9 \| 2\.0 Mo \| aucune \| tous \| image\/png ×7, image\/gif ×2 \| 1\.0 Mo \| 0 \|/)
  })

  it('administrateur sans TOTP : seul blocage toléré avant la phase 1, jamais combiné à un autre', () => {
    const step = (patch: (inv: Inventory) => void) => {
      const r = compare(inventory(patch))
      return comparisonStep({ ok: r.status === 0, output: r.out })
    }
    const totpOnly = step(inv => { inv.auth.admins_with_verified_totp = 0 })
    expect(totpOnly.result.ok).toBe(true)
    expect(totpOnly.title).toMatch(/résolu par la phase 1/)
    expect(step(inv => { inv.auth.admins_with_verified_totp = 0; inv.server.log_statement = 'all' }).result.ok).toBe(false)
    expect(step(inv => { inv.auth.admins = 0; inv.auth.admins_with_verified_totp = 0 }).result.ok).toBe(false)
    expect(step(() => {}).title).toBe('2. Comparaison avec les migrations')
  })

  it('table admin_users absente : signalée sans erreur', () => {
    expect(summarizeInventory(inventory(inv => { inv.auth.admins = null; inv.auth.admins_with_verified_totp = null })))
      .toMatch(/Administrateurs \(admin_users\) : table absente/)
  })
})

describe('règles du Security Advisor (splinter) et migration 20261030120200', () => {
  const splinter = "set local search_path = '';\ndo $$\nbegin\n  perform 1;\nend $$;\n\n(\nselect 'x' as name, 'WARN' as level, array['SECURITY'] as categories, 'x_k' as cache_key, 'd' as detail)\n"

  it('préambule conservé, règles de sécurité résumées en JSON, transaction annulée', () => {
    const script: string = securityLintScript(splinter)
    expect(script).toMatch(/^begin;\nset local search_path = '';\ndo \$\$/)
    expect(script).toMatch(/'SECURITY' = any\(l\.categories\);\nrollback;\n$/)
    expect(script).toMatch(/'level', l\.level/)
    expect(() => securityLintScript('select 1')).toThrow()
    expect(parseLints('BEGIN\n[{"name":"x","level":"WARN","key":"x_k","detail":"d"}]\n')).toEqual([{ name: 'x', level: 'WARN', key: 'x_k', detail: 'd' }])
    expect(parseLints('')).toEqual([])
  })

  it('20261030120200 : aucune donnée modifiée, aucune politique d’origine supprimée', () => {
    const sql = read('supabase/migrations/20261030120200_p0a1_security_advisor.sql')
    const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\b(insert into|update public|delete from|truncate|drop table|drop column)\b/i)
    for (const m of code.matchAll(/drop policy if exists (\S+)/g)) expect(m[1]).toMatch(/^p0a1_/)
    expect(code).toMatch(/as restrictive for insert to anon, authenticated/)
    // Anciennes insertions « true » retirées APRÈS la création de l'insertion bornée et des droits
    const bounded = code.indexOf('create policy p0a1_public_insert')
    const grants = code.indexOf("grant insert (%s)")
    const removal = code.indexOf("execute format('drop policy %I on public.%I'")
    expect(bounded).toBeGreaterThan(0)
    expect(removal).toBeGreaterThan(Math.max(bounded, grants))
    expect(code).toMatch(/cmd = 'INSERT'[\s\S]*policyname not like 'p0a1\\_%'[\s\S]*= 'true'/)
    expect(code).toMatch(/set search_path = %L', f\.fn, ''/)
  })
})

describe('restauration générée depuis l’inventaire', () => {
  it('lit l’inventaire sous ses différentes formes d’export', () => {
    const inv = inventory()
    for (const raw of [JSON.stringify(inv), JSON.stringify(JSON.stringify(inv)), JSON.stringify([{ inventory: inv }])]) {
      expect(parseInventory(raw).inventory_version).toBe('p1ai.1')
    }
    expect(() => parseInventory('{"a":1}')).toThrow()
  })

  it('droits EXECUTE lus dans les ACL', () => {
    expect(executeGrantees(null)).toEqual(['public'])
    expect(executeGrantees('{postgres=X/postgres,authenticated=X/postgres,anon=r/postgres}')).toEqual(['postgres', 'authenticated'])
    expect(executeGrantees('{=X/postgres}')).toEqual(['public'])
  })

  it('une transaction qui recrée les politiques exactes et ne touche à aucune donnée', () => {
    const sql: string = restoreSql(inventory(), [])
    expect(sql).toMatch(/^begin;$/m)
    expect(sql).toMatch(/^commit;$/m)
    expect(sql).toMatch(/create policy "Public read visits" on "public"\."visits"/)
    expect(sql).not.toMatch(/\b(delete from|truncate|drop table|update public)\b/i)
  })

  it('limites des buckets rétablies (P0.A1 restreint project-images), sans bloquer la transaction', () => {
    const sql: string = restoreSql(inventory(inv => {
      inv.buckets = [
        { id: 'project-images', public: true, file_size_limit: null, allowed_mime_types: null, objects: 2, bytes: 1 },
        { id: 'avatars', public: false, file_size_limit: 1048576, allowed_mime_types: ['image/png', "x'y"], objects: 0, bytes: 0 },
      ]
    }), [])
    expect(sql).toMatch(/set file_size_limit = null, allowed_mime_types = null where id = 'project-images'/)
    expect(sql).toMatch(/set file_size_limit = 1048576, allowed_mime_types = array\['image\/png', 'x''y'\]::text\[\] where id = 'avatars'/)
    expect(sql).toMatch(/exception when insufficient_privilege/)
    expect(restoreSql(inventory(inv => { inv.buckets = [{ id: 'b', file_size_limit: '1; drop table x', allowed_mime_types: null }] }), []))
      .toMatch(/set file_size_limit = null,/)
  })

  it('les noms sont protégés (guillemets doublés)', () => {
    const sql: string = restoreSql(inventory(inv => { inv.policies[0].name = 'x"; drop table visits; --' }), [])
    expect(sql).toContain('"x""; drop table visits; --"')
  })
})

describe('sauvegarde et restauration', () => {
  it('paramètre propre à pg_dump 17 retiré pour un serveur plus ancien', () => {
    const sql = 'SET statement_timeout = 0;\nSET transaction_timeout = 0;\nSELECT 1;\n'
    expect(adaptSql(sql, 15)).not.toMatch(/transaction_timeout/)
    expect(adaptSql(sql, 17)).toBe(sql)
  })

  it('backup.sh : lecture seule, mot de passe jamais en argument ni écrit', () => {
    const sh = read('supabase/backup/backup.sh')
    const commands = sh.split('\n').filter(l => !l.trim().startsWith('#'))
    expect(sh).toMatch(/stty -echo/)
    expect(commands.join('\n')).not.toMatch(/\b(pg_restore|dropdb|createdb)\b|psql\b(?!\s+-XAtc 'select version\(\)')/)
    expect(commands.join('\n')).not.toMatch(/PGPASSWORD=\S|password=/i)
    expect(sh).toMatch(/sha256sum/)
  })

  it('les résultats de production ne peuvent pas entrer dans Git', () => {
    const ignore = read('.gitignore')
    for (const rule of ['supabase/checks/results/', 'supabase/backup/out/', '*.dump', 'secrets/']) expect(ignore).toContain(rule)
  })
})

describe('inventaire de la VM Oracle (deploy/oracle/discover.sh)', () => {
  const sh = read('deploy/oracle/discover.sh')
  const code = sh.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')

  it('n’affiche jamais de valeur : ni env, ni contenu de fichier, ni configuration pm2 complète', () => {
    expect(code).not.toMatch(/\b(printenv|pm2 (jlist|env|show|prettylist)|docker (exec|compose (up|down|restart)))\b/)
    expect(code).not.toMatch(/^\s*env\b|\bcat\s+[^|]*\.env/m)
    expect(code).toMatch(/\.Config\.Env[^\n]*\|\s*names/)
    expect(code).toMatch(/names < "\$f"/)
  })

  it('aucune commande qui modifie la VM', () => {
    expect(code).not.toMatch(/\b(systemctl (start|stop|restart|reload|enable|disable)|nginx -s|apt(-get)? |rm -|mv |chmod |chown |tee |kill )/)
  })

  it('Node repéré par sa ligne de commande (Node 24 se nomme « MainThread »), arguments et identifiants masqués', () => {
    expect(code).not.toMatch(/pgrep node\b/)
    expect(code).toMatch(/pgrep -f "\^\(\/\[\^ \]\*\/\)\?node/)
    expect(code).toMatch(/argument\(s\) non affiché/)
    expect(code).toMatch(/<masqué>@/)
    // crontab : horaire et programme seulement, jamais la ligne brute
    for (const line of code.split('\n').filter(l => /crontab -l/.test(l))) expect(line).toMatch(/\|\s*awk/)
  })

  it('le test canari refuse de s’exécuter hors d’un conteneur jetable', () => {
    const t = read('deploy/oracle/discover-canary-test.sh')
    expect(t.indexOf('/.dockerenv')).toBeGreaterThan(-1)
    expect(t.indexOf('/.dockerenv')).toBeLessThan(t.indexOf('mkdir'))
  })
})

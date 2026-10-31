// Anomalie AILab de la recette : « column ailab_capabilities.createdat does not exist ».
// La base de recette part de supabase/tests/rls/10_production_like_state.sql. Ce test garantit que
// cet état initial (et l'alignement des bases déjà créées) contient toutes les colonnes du schéma
// réel des tables AI Lab, et toutes celles que le frontend sélectionne, filtre ou trie.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const TABLES = ['ailab_capabilities', 'ailab_projects', 'ailab_project_capabilities'] as const

/** Colonnes d'un « create table » : éléments de premier niveau, hors contraintes de table */
function tableColumns(sql: string, table: string): Set<string> {
  const start = new RegExp(`create table (?:if not exists )?public\\.${table}\\s*\\(`, 'i').exec(sql)
  if (!start) return new Set()
  let depth = 1
  let i = start.index + start[0].length
  const items: string[] = []
  let current = ''
  for (; i < sql.length && depth > 0; i++) {
    const c = sql[i]
    if (c === '(') depth++
    if (c === ')') depth--
    if ((c === ',' && depth === 1) || depth === 0) {
      items.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  return new Set(items
    .filter(item => item && !/^(primary key|foreign key|unique|constraint|check)\b/i.test(item))
    .map(item => item.split(/\s+/)[0].toLowerCase()))
}

/** Colonnes ajoutées par « alter table … add column if not exists » */
function addedColumns(sql: string, table: string): Set<string> {
  const block = new RegExp(`alter table public\\.${table}\\b([\\s\\S]*?);`, 'gi')
  const names = new Set<string>()
  for (const m of sql.matchAll(block)) {
    for (const c of m[1].matchAll(/add column if not exists\s+(\w+)/gi)) names.add(c[1].toLowerCase())
  }
  return names
}

/** Colonnes demandées par le frontend : sélections imbriquées PostgREST, filtres et tris */
function frontendColumns(): Record<string, Set<string>> {
  const used: Record<string, Set<string>> = Object.fromEntries(TABLES.map(t => [t, new Set<string>()]))
  for (const file of ['src/components/AILabManager.tsx', 'src/lib/supabase.ts']) {
    const code = read(file)
    // Sélections nommées : const AILAB_PROJECT_SELECT = ` … `
    for (const m of code.matchAll(/const AILAB_PROJECT_SELECT = `([\s\S]*?)`/g)) {
      const stack: string[] = ['ailab_projects']
      for (const token of m[1].matchAll(/([a-z_]+)\s*(\()?|\)/g)) {
        if (token[0] === ')') { stack.pop(); continue }
        const [, name, opens] = token
        if (opens) stack.push(name.replace(/!inner$/, ''))
        else used[stack[stack.length - 1]]?.add(name)
      }
    }
    // Chaînes .from('ailab_…') … : .order('x'), .eq('x'), .select('a, b')
    for (const m of code.matchAll(/\.from\('(ailab_\w+)'\)([\s\S]*?)(?=\.from\(|\n\s*\n|$)/g)) {
      const table = m[1]
      for (const c of m[2].matchAll(/\.(?:order|eq|neq|in)\('(\w+)'/g)) used[table]?.add(c[1])
      for (const c of m[2].matchAll(/\.select\('([^'*]+)'\)/g)) {
        for (const name of c[1].split(',').map(s => s.trim()).filter(s => /^\w+$/.test(s))) used[table]?.add(name)
      }
    }
  }
  return used
}

const reference = read('src/lib/supabase.ts')
const fixture = read('supabase/tests/rls/10_production_like_state.sql')
const alignment = read('env/recette/schema-alignment.sql')

describe('recette : tables AI Lab conformes au schéma réel', () => {
  it.each(TABLES)('%s : l’état initial contient toutes les colonnes du schéma de référence', (table) => {
    const expected = tableColumns(reference, table)
    expect(expected.size, `schéma de référence introuvable pour ${table}`).toBeGreaterThan(1)
    const actual = tableColumns(fixture, table)
    for (const column of expected) expect(actual, `${table}.${column}`).toContain(column)
  })

  it.each(TABLES)('%s : une base déjà créée est alignée sur les mêmes colonnes', (table) => {
    const minimal = tableColumns(fixture, table)
    const aligned = addedColumns(alignment, table)
    for (const column of tableColumns(reference, table)) {
      // Colonne présente dès l'origine de l'état simplifié, ou ajoutée par l'alignement
      const original = ['id', 'slug', 'icon', 'title', 'description', 'sortorder', 'active', 'project_id', 'capability_id']
      expect(original.includes(column) || aligned.has(column), `${table}.${column}`).toBe(true)
      expect(minimal.has(column), `${table}.${column}`).toBe(true)
    }
  })

  it('chaque colonne demandée par le dashboard existe (dont le tri par createdat)', () => {
    const used = frontendColumns()
    expect(used.ailab_capabilities).toContain('createdat')
    expect(used.ailab_projects).toContain('createdat')
    for (const table of TABLES) {
      const columns = tableColumns(fixture, table)
      for (const column of used[table]) expect(columns, `${table}.${column} (frontend)`).toContain(column)
    }
  })

  it('l’alignement est idempotent et réservé à la recette', () => {
    expect(alignment).not.toMatch(/\b(drop table|drop column|delete from|truncate|update public\.)/i)
    for (const m of alignment.matchAll(/add column (?!if not exists)/gi)) expect(m[0]).toBe('')
    expect(read('scripts/recette.mjs')).toContain('env/recette/schema-alignment.sql')
    // Aucun script de mise en production ne le référence
    for (const dir of ['supabase/migrations', 'deploy']) {
      for (const file of fs.readdirSync(path.join(ROOT, dir))) {
        if (fs.statSync(path.join(ROOT, dir, file)).isFile()) expect(read(`${dir}/${file}`)).not.toContain('schema-alignment')
      }
    }
  })
})

// P0.CV — Une référence statique ou locale ne peut plus écraser la version persistante
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('page publique /cv', () => {
  const page = read('src/pages/CVPage.tsx')

  it('ne lit plus le stockage du navigateur', () => {
    expect(page).not.toMatch(/localStorage|sessionStorage/)
  })

  it('ne référence plus directement le fichier statique', () => {
    expect(page).not.toContain('/cv.pdf')
  })

  it('la version active provient de cvDocument', () => {
    expect(page).toContain('fetchActiveCv')
  })
})

describe('dashboard', () => {
  const dashboard = read('src/hooks/AdminDashboard.tsx')

  it('n’enregistre plus le CV dans le navigateur', () => {
    expect(dashboard).not.toMatch(/localStorage\.(setItem|getItem)\('cvFile'/)
    expect(dashboard).toContain('<CvManager />')
  })

  it('le remplacement passe par blog-api, jamais par une écriture directe', () => {
    const manager = read('src/components/admin/CvManager.tsx')
    expect(manager).toContain('/admin/cv')
    expect(manager).not.toMatch(/\.upload\(|\.insert\(|\.update\(/)
  })
})

describe('secrets', () => {
  it('aucune clé privilégiée Supabase côté frontend', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(d, e.name)] : [])
    for (const file of walk(path.join(ROOT, 'src'))) {
      if (file.endsWith('.test.ts')) continue
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/service_role|SERVICE_KEY|SUPABASE_SERVICE/i)
    }
  })
})

describe('migrations du CV', () => {
  const sql = read('supabase/migrations/20261030150000_cv_public_document.sql')

  it('une seule version active garantie par la base', () => {
    expect(sql).toMatch(/create unique index[\s\S]*cv_versions[\s\S]*where status = 'active'/)
  })

  it('le bucket n’autorise que les PDF de 10 Mo', () => {
    expect(sql).toContain("array['application/pdf']")
    expect(sql).toContain('10 * 1024 * 1024')
  })

  it('aucune politique de lecture publique des objets', () => {
    expect(sql).not.toMatch(/for select\s+to anon[^;]*using \(bucket_id = 'portfolio-public-documents'\)/)
  })
})

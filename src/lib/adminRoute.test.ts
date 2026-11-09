// P7.3 — Chemin d'administration non prévisible : seule son empreinte est connue du bundle.
// Segments tirés au hasard à chaque exécution : aucune valeur réelle dans les tests.
import { describe, it, expect, vi, afterEach } from 'vitest'
import nodeCrypto from 'node:crypto'
import fs from 'node:fs'
import { ADMIN_SEGMENT_RE, firstSegment, looksLikeAdminPath, matchAdminSegment, sha256Hex } from './adminRoute'

const segment = () => nodeCrypto.randomBytes(24).toString('base64url')
const hash = (s: string) => nodeCrypto.createHash('sha256').update(s).digest('hex')

afterEach(() => vi.unstubAllGlobals())

describe('reconnaissance du segment', () => {
  it('le bon segment est reconnu par son empreinte', async () => {
    const s = segment()
    expect(s).toMatch(ADMIN_SEGMENT_RE)
    expect(await sha256Hex(s)).toBe(hash(s))
    expect(await matchAdminSegment(s, hash(s))).toBe(true)
  })

  it('tout autre segment est refusé, même très proche', async () => {
    const s = segment()
    const expected = hash(s)
    expect(await matchAdminSegment(segment(), expected)).toBe(false)
    expect(await matchAdminSegment(s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A'), expected)).toBe(false)
    expect(await matchAdminSegment(s.toUpperCase() === s ? s.toLowerCase() : s.toUpperCase(), expected)).toBe(false)
    expect(await matchAdminSegment(`${s}/`, expected)).toBe(false)
  })

  it('refus par défaut : empreinte absente ou mal formée (le chemin collé par erreur)', async () => {
    const s = segment()
    expect(await matchAdminSegment(s, '')).toBe(false)
    expect(await matchAdminSegment(s, s)).toBe(false)
    expect(await matchAdminSegment(s, hash(s).toUpperCase())).toBe(false)
    expect(await matchAdminSegment(s, hash(s).slice(1))).toBe(false)
  })

  it('segments hors format refusés sans calcul', async () => {
    for (const bad of ['admin', 'a'.repeat(31), 'a'.repeat(129), `${segment()}.html`, `${segment().slice(0, 31)} `, '../../etc']) {
      expect(await matchAdminSegment(bad, hash(bad))).toBe(false)
    }
  })

  it('contexte non sécurisé (crypto.subtle absent) : refus', async () => {
    const s = segment()
    vi.stubGlobal('crypto', {})
    expect(await matchAdminSegment(s, hash(s))).toBe(false)
  })

  it('sans configuration du build, aucune adresse ne mène au dashboard', async () => {
    // VITE_ADMIN_ROUTE_HASH n'est pas définie pour les tests unitaires
    expect(await matchAdminSegment(segment())).toBe(false)
  })
})

describe('forme des adresses', () => {
  it('premier segment', () => {
    expect(firstSegment('/abc/knowledge')).toBe('abc')
    expect(firstSegment('/')).toBe('')
  })

  it('aucune route publique n’a la forme d’une adresse d’administration', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]).filter(p => p !== '*')
    expect(routes.length).toBeGreaterThan(20)
    for (const route of routes) expect(looksLikeAdminPath(route.replace(/:[a-z]+/gi, 'x')), route).toBe(false)
    expect(looksLikeAdminPath(`/${segment()}`)).toBe(true)
    expect(looksLikeAdminPath(`/${segment()}/knowledge`)).toBe(true)
  })

  it('les anciennes adresses d’administration ne sont plus des routes', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    expect(app).not.toMatch(/path="\/admin/)
    expect(app).not.toMatch(/path="\/blog-admin"/)
    expect(app).not.toMatch(/<Navigate[^>]+\/admin/)
    expect(app).toMatch(/<Route path="\*"\s+element={<AdminOrNotFound \/>} \/>/)
  })

  it('aucun lien interne vers une adresse d’administration fixe', () => {
    const files = ['src/hooks/AdminDashboard.tsx', 'src/pages/KnowledgeAdmin.tsx', 'src/pages/AdminBlogPage.tsx', 'src/pages/BlogPage.tsx', 'src/lib/blogAdminApi.ts', 'src/components/Navigation.tsx', 'src/components/Footer.tsx']
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
      expect(code, file).not.toMatch(/['"`]\/admin(\/|['"`])/)
      expect(code, file).not.toMatch(/['"`]\/blog-admin['"`]/)
    }
  })
})

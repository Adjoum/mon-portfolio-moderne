// InkSpace : adresse de l'API issue de VITE_API_URL (développement et build), jamais écrite en dur.
// Vite : seules les variables publiques atteignent le navigateur ; la recette ne vise jamais la production.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnv } from 'vite'
import { INKSPACE_CONFIG_PATH, inkspaceConfig, inkspaceConfigScript } from '../../vite-plugins/inkspaceConfig'
import { PUBLIC_ENV, envDirFor, leakedPublicEnv, targetsProductionSupabase } from '../../vite-plugins/publicEnv'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

/** Exécute le script généré comme le ferait le navigateur, et renvoie window.INKSPACE_CONFIG */
function evaluate(script: string) {
  const window: { INKSPACE_CONFIG?: { apiUrl: string } } = {}
  new Function('window', script)(window)
  return window.INKSPACE_CONFIG
}

describe('config.js d’InkSpace', () => {
  it('reprend VITE_API_URL', () => {
    expect(evaluate(inkspaceConfigScript('https://api.adjoumani-koffi.com/api'))).toEqual({ apiUrl: 'https://api.adjoumani-koffi.com/api' })
    expect(evaluate(inkspaceConfigScript('http://localhost:5000/api/'))).toEqual({ apiUrl: 'http://localhost:5000/api' })
    expect(evaluate(inkspaceConfigScript('http://127.0.0.1:58400/api'))?.apiUrl).toBe('http://127.0.0.1:58400/api')
  })

  it('configuration figée', () => {
    const config = evaluate(inkspaceConfigScript('http://localhost:5000/api'))!
    expect(Object.isFrozen(config)).toBe(true)
  })

  it.each([
    ['javascript:alert(1)'], ['http://api.exemple.com/api'], ['ftp://x/api'], ['pas une url'],
    ['https://api.exemple.com/api?x=1'], ['https://u:p@api.exemple.com/api'],
  ])('adresse refusée : %s', (url) => {
    expect(() => inkspaceConfigScript(url)).toThrow()
  })

  it('aucune sortie de la chaîne possible', () => {
    const script = inkspaceConfigScript('https://api.exemple.com/</script><script>alert(1)')
    expect(script).not.toContain('</script>')
  })

  it('build : écrit dans le dossier de sortie', () => {
    const emitFile = vi.fn()
    const plugin = inkspaceConfig('https://api.exemple.com/api')
    ;(plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void).call({ emitFile })
    expect(emitFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'asset', fileName: INKSPACE_CONFIG_PATH }))
    expect(evaluate(emitFile.mock.calls[0][0].source)?.apiUrl).toBe('https://api.exemple.com/api')
  })

  it('adresse invalide : refus au build, avertissement en développement (site utilisable)', () => {
    const plugin = inkspaceConfig("'http://localhost:5000/api")
    const error = vi.fn((message: string) => { throw new Error(message) })
    expect(() => (plugin.generateBundle as unknown as (this: { error: typeof error; emitFile: () => void }) => void).call({ error, emitFile: () => {} })).toThrow(/VITE_API_URL invalide/)

    const warn = vi.fn()
    let handler: ((req: { url: string }, res: unknown, next: () => void) => void) | undefined
    ;(plugin.configureServer as (server: unknown) => void)({ config: { logger: { warn } }, middlewares: { use: (h: typeof handler) => { handler = h } } })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/VITE_API_URL invalide/))
    let body = ''
    handler!({ url: '/inkspace/config.js' }, { setHeader: () => {}, end: (b: string) => { body = b } }, () => {})
    expect(evaluate(body)).toEqual({ apiUrl: null })
  })

  it('développement : servi par Vite, jamais mis en cache', () => {
    let handler: ((req: { url: string }, res: unknown, next: () => void) => void) | undefined
    const plugin = inkspaceConfig('http://localhost:5000/api')
    ;(plugin.configureServer as (server: unknown) => void)({ middlewares: { use: (h: typeof handler) => { handler = h } } })
    const headers: Record<string, string> = {}
    let body = ''
    handler!({ url: '/inkspace/config.js?v=1' }, { setHeader: (k: string, v: string) => { headers[k] = v }, end: (b: string) => { body = b } }, () => {})
    expect(headers['Cache-Control']).toBe('no-store')
    expect(evaluate(body)?.apiUrl).toBe('http://localhost:5000/api')
    const next = vi.fn()
    handler!({ url: '/inkspace/js/app.js' }, {}, next)
    expect(next).toHaveBeenCalled()
  })
})

describe('InkSpace (application statique)', () => {
  const app = read('public/inkspace/js/app.js')
  const html = read('public/inkspace/index.html')

  it('aucune adresse d’API écrite en dur', () => {
    expect(app).not.toMatch(/adjoumani-koffi\.com|localhost:5000|127\.0\.0\.1/)
    expect(app).toContain('window.INKSPACE_CONFIG')
  })

  it('config.js chargé avant le code d’InkSpace, et jamais présent dans les sources', () => {
    expect(html.indexOf('<script src="config.js"></script>')).toBeGreaterThan(-1)
    expect(html.indexOf('<script src="config.js"></script>')).toBeLessThan(html.indexOf('js/app.js'))
    expect(fs.existsSync(path.join(ROOT, 'public', INKSPACE_CONFIG_PATH))).toBe(false)
  })

  it('configuration absente : message d’erreur, jamais une adresse par défaut', () => {
    expect(app).toMatch(/if\(!apiUrl\) throw new Error/)
  })

  it('nginx ne met pas config.js en cache un an', () => {
    expect(read('nginx.conf')).toMatch(/location \^~ \/inkspace\/ \{\s*add_header Cache-Control "no-cache" always;/)
  })
})

describe('variables transmises par Vite', () => {
  it('seules les trois variables publiques sont exposées', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-env-'))
    fs.writeFileSync(path.join(dir, '.env'), [
      'VITE_API_URL=http://localhost:5000/api', 'VITE_SUPABASE_URL=https://test.supabase.co', 'VITE_SUPABASE_ANON_KEY=anon',
      'VITE_OPENAI_API_KEY=sk-test-ne-doit-pas-sortir', 'VITE_GROQ_API_KEY=gsk_ne_doit_pas_sortir', 'OPENAI_API_KEY=x',
    ].join('\n'))
    const env = loadEnv('production', dir, PUBLIC_ENV)
    fs.rmSync(dir, { recursive: true, force: true })
    expect(Object.keys(env).sort()).toEqual(['VITE_API_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL'])
  })

  it('vite.config.ts applique cette liste et isole les modes de recette', () => {
    const config = read('vite.config.ts')
    expect(config).toMatch(/envPrefix: PUBLIC_ENV/)
    expect(config).toMatch(/envDir,/)
    expect(envDirFor('development')).toBe('.')
    expect(envDirFor('production')).toBe('.')
    expect(envDirFor('recette')).toBe('env/recette')
  })

  it('une clé glissée dans une variable publique est refusée', () => {
    const patterns = JSON.parse(read('scripts/secret-patterns.json')).keyPatterns.map((p: { regex: string }) => new RegExp(p.regex))
    expect(leakedPublicEnv({ VITE_API_URL: 'http://localhost:5000/api', VITE_SUPABASE_ANON_KEY: 'gsk_' + 'a'.repeat(40) }, patterns)).toEqual(['VITE_SUPABASE_ANON_KEY'])
    expect(leakedPublicEnv({ VITE_API_URL: 'http://localhost:5000/api' }, patterns)).toEqual([])
  })

  it('recette : le projet Supabase de production est refusé', () => {
    expect(targetsProductionSupabase({ VITE_SUPABASE_URL: 'https://prod.supabase.co' }, { VITE_SUPABASE_URL: 'https://prod.supabase.co/' })).toBe(true)
    expect(targetsProductionSupabase({ VITE_SUPABASE_URL: 'https://test.supabase.co' }, { VITE_SUPABASE_URL: 'https://prod.supabase.co' })).toBe(false)
    expect(targetsProductionSupabase({}, { VITE_SUPABASE_URL: 'https://prod.supabase.co' })).toBe(false)
  })

  it('les fichiers de recette réels ne sont pas versionnés', () => {
    expect(read('.gitignore')).toMatch(/^\*\.local$/m)
    expect(fs.existsSync(path.join(ROOT, 'env/recette/.env.recette.example'))).toBe(true)
  })
})

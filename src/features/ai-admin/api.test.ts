// Centre IA (navigateur) : requêtes envoyées à blog-api, erreurs rendues lisibles, aucun stockage local.
// Le client Supabase est simulé : aucun appel réseau.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jeton-admin' } } }) } },
}))

const { aiAdmin, AiAdminError } = await import('./api')
const { formatUsd, ratio, featureLabel } = await import('./format')

const calls: { url: string; init: RequestInit }[] = []
let reply: { status: number; body: unknown } = { status: 200, body: {} }

beforeEach(() => {
  calls.length = 0
  reply = { status: 200, body: {} }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const last = () => calls.at(-1)!
const bodyOf = () => JSON.parse(String(last().init.body))

describe('requêtes vers blog-api', () => {
  it('jeton de session dans Authorization, jamais de cache', async () => {
    await aiAdmin.overview()
    expect(last().url).toMatch(/\/admin\/ai\/overview$/)
    expect(new Headers(last().init.headers).get('Authorization')).toBe('Bearer jeton-admin')
    expect(last().init.cache).toBe('no-store')
  })

  it('clé : envoyée une fois en PUT, rien d’autre dans le corps', async () => {
    await aiAdmin.setKey('anthropic', 'cle-saisie')
    expect(last().init.method).toBe('PUT')
    expect(last().url).toMatch(/\/providers\/anthropic\/key$/)
    expect(bodyOf()).toEqual({ key: 'cle-saisie' })
  })

  it('identifiant de modèle avec barre : encodé en paramètre de requête pour la suppression', async () => {
    await aiAdmin.deleteModel('groq', 'vendor/modele:free')
    expect(last().init.method).toBe('DELETE')
    expect(last().url).toMatch(/\/providers\/groq\/models\?modelId=vendor%2Fmodele%3Afree$/)
  })

  it('test de compatibilité : confirmation de facturation toujours explicite', async () => {
    await aiAdmin.testFeature('cv.import.ocr', 'openai', 'm', { temperature: 0.2 })
    expect(last().url).toMatch(/\/features\/cv\.import\.ocr\/test$/)
    expect(bodyOf()).toEqual({ providerId: 'openai', modelId: 'm', params: { temperature: 0.2 }, confirmBilling: true })
  })

  it('affectation : version transmise pour la détection des conflits', async () => {
    await aiAdmin.saveAssignment('inkspace.generate', { providerId: 'openai', modelId: 'm', params: {}, maxOutputTokens: 10, timeoutMs: 1000, enabled: true, version: 7 })
    expect(bodyOf()).toMatchObject({ version: 7, enabled: true })
  })

  it('budget en USD (le serveur convertit)', async () => {
    await aiAdmin.saveBudget(5, 30, 8)
    expect(bodyOf()).toEqual({ dailyUsd: 5, monthlyUsd: 30, globalConcurrency: 8 })
  })
})

describe('erreurs', () => {
  it('message du serveur repris, détails conservés (fonctionnalités qui utilisent un modèle)', async () => {
    reply = { status: 409, body: { error: 'Ce modèle est utilisé par une fonctionnalité active.', code: 'AI_MODEL_IN_USE', features: ['agent.chat'] } }
    const err = await aiAdmin.deleteModel('groq', 'm').catch((e: InstanceType<typeof AiAdminError>) => e) as InstanceType<typeof AiAdminError>
    expect(err).toBeInstanceOf(AiAdminError)
    expect(err).toMatchObject({ status: 409, code: 'AI_MODEL_IN_USE', message: 'Ce modèle est utilisé par une fonctionnalité active.' })
    expect(err.details).toEqual({ features: ['agent.chat'] })
  })

  it('MFA manquante : message explicite', async () => {
    reply = { status: 403, body: { error: 'x', code: 'MFA_REQUIRED' } }
    const err = await aiAdmin.overview().catch((e: Error) => e) as Error
    expect(err.message).toMatch(/double authentification/)
  })

  it('serveur injoignable : jamais une fausse réussite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = await aiAdmin.saveBudget(5, 30, 8).catch((e: Error) => e) as Error
    expect(err).toBeInstanceOf(AiAdminError)
    expect(err.message).toMatch(/rien n’a été modifié/)
  })
})

describe('formats', () => {
  it('montants en micro-USD lisibles', () => {
    expect(formatUsd(5_000_000)).toMatch(/^5,00\s\$$/)
    expect(formatUsd(17_400)).toMatch(/^0,02\s\$$/)
    expect(formatUsd(4_000)).toMatch(/^0,0040\s\$$/)
    expect(formatUsd(null)).toBe('—')
  })

  it('jauges bornées', () => {
    expect(ratio(2, 4)).toBe(50)
    expect(ratio(10, 4)).toBe(100)
    expect(ratio(1, 0)).toBe(100)
  })

  it('libellés des neuf fonctionnalités', () => {
    expect(featureLabel('agent.chat')).toBe('Assistant Clone IA')
    expect(featureLabel('inconnue')).toBe('inconnue')
  })
})

describe('sécurité du code du centre IA', () => {
  const dir = path.resolve(__dirname)
  const files = fs.readdirSync(dir, { recursive: true }).map(String).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
  const code = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')

  it('aucune clé ni configuration conservée dans le navigateur', () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
  })

  it('le champ de clé n’est ni affiché ni mémorisé par le navigateur', () => {
    const providers = fs.readFileSync(path.join(dir, 'sections/ProvidersSection.tsx'), 'utf8')
    expect(providers).toMatch(/type="password"/)
    expect(providers).toMatch(/autoComplete="off"/)
    expect(providers).toMatch(/setKey\(''\)\s*\/\/ jamais conservée/)
  })

  it('aucun appel direct à Supabase pour la configuration IA : tout passe par blog-api', () => {
    expect(code).not.toMatch(/supabase\.(from|rpc)\(/)
  })

  it('chargé à la demande depuis le dashboard', () => {
    const dashboard = fs.readFileSync(path.resolve(dir, '../../hooks/AdminDashboard.tsx'), 'utf8')
    expect(dashboard).toMatch(/lazy\(\(\) => import\('\.\.\/features\/ai-admin\/AiAdminPanel'\)\)/)
  })
})

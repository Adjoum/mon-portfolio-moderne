// P0.A2 — Client IA du navigateur : uniquement blog-api, aucune clé, aucun choix de modèle
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runAiFeature, AiFeatureError, describeAiError, fetchAiAvailability } from './aiClient'

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers }))

afterEach(() => vi.restoreAllMocks())

describe('runAiFeature', () => {
  it('appelle /ai/run/:featureId de blog-api avec { input } seulement', async () => {
    const spy = respond(200, { content: 'ok', requestId: 'r' })
    await expect(runAiFeature('cv.review', { lang: 'fr' })).resolves.toBe('ok')

    const [url, init] = spy.mock.calls[0]
    expect(String(url)).toMatch(/\/ai\/run\/cv\.review$/)
    expect(String(url)).not.toMatch(/openai|anthropic|groq|x\.ai|googleapis|openrouter/)
    expect(JSON.parse(String(init?.body))).toEqual({ input: { lang: 'fr' } })
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBeNull()
    expect(String(init?.body)).not.toMatch(/model|provider|system|max_tokens/)
  })

  it.each([
    [503, 'AI_FEATURE_UNAVAILABLE', true],
    [503, 'AI_FEATURE_DISABLED',    true],
    [429, 'AI_QUOTA_EXCEEDED',      false],
    [504, 'AI_TIMEOUT',             false],
    [502, 'AI_PROVIDER_ERROR',      false],
  ])('HTTP %i %s → AiFeatureError (indisponible : %s)', async (status, code, unavailable) => {
    respond(status, { code, error: 'message serveur' }, { 'Retry-After': '60' })
    const err = await runAiFeature('cv.generate', {}).catch(e => e)
    expect(err).toBeInstanceOf(AiFeatureError)
    expect(err.code).toBe(code)
    expect(err.unavailable).toBe(unavailable)
    expect(err.retryAfterSec).toBe(60)
    expect(err.message).not.toBe('message serveur')   // message traduit côté client
  })

  it('réseau coupé → message explicite, jamais silencieux', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await runAiFeature('latex.improve', {}).catch(e => e)
    expect(err.code).toBe('AI_NETWORK')
    expect(err.message).toMatch(/injoignable/)
  })

  it('réponse sans contenu → erreur', async () => {
    respond(200, { requestId: 'r' })
    await expect(runAiFeature('cv.generate', {})).rejects.toBeInstanceOf(AiFeatureError)
  })
})

describe('describeAiError', () => {
  it('indique le champ invalide', () => {
    expect(describeAiError(400, { code: 'AI_INVALID_INPUT', field: 'rawExps' })).toMatch(/rawExps/)
  })
  it('413 → contenu trop volumineux', () => {
    expect(describeAiError(413, null)).toMatch(/volumineux/)
  })
})

describe('fetchAiAvailability', () => {
  it('table id → statut', async () => {
    respond(200, { features: [{ id: 'cv.generate', available: false, reason: 'not_configured' }] })
    expect(await fetchAiAvailability()).toEqual({ 'cv.generate': { available: false, reason: 'not_configured' } })
  })
  it('API injoignable → null (les fonctions restent proposées, l’erreur sera affichée à l’appel)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchAiAvailability()).toBeNull()
  })
})

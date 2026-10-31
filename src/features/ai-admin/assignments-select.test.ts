// Centre IA, anomalie de recette : listes « Fournisseur » et « Modèle » illisibles en thème sombre
// (options blanches sur fond blanc système). Rendu serveur du formulaire d'affectation : aucune
// requête réseau, les effets (chargement du catalogue) ne s'exécutent pas.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

const { default: AssignmentsSection } = await import('./sections/AssignmentsSection')
const { selectClass, inputClass } = await import('./styles')
const { PROVIDER_IDS } = await import('./api')
type Overview = import('./api').Overview

const provider = (id: string, displayName: string, keyStatus: 'valid' | 'not_configured' | 'invalid', enabled = true) => ({
  id, displayName, enabled, keyStatus, keyFingerprint: null, keyUpdatedAt: null, lastCheckAt: null, lastCheckOk: null, lastCheckCode: null,
  lastSyncAt: null, lastSyncAttemptAt: null, lastSyncOk: null, lastSyncCode: null, lastSyncCount: null, modelCount: 0, assignedCount: 0,
})

const overview = {
  providers: [
    provider('openai', 'OpenAI', 'valid', false), provider('groq', 'Groq', 'valid'), provider('xai', 'xAI', 'not_configured'),
    provider('gemini', 'Google Gemini', 'invalid'), provider('openrouter', 'OpenRouter', 'not_configured'), provider('anthropic', 'Anthropic', 'not_configured'),
  ],
  features: [{
    id: 'latex.generate', section: 'Éditeur LaTeX', requiredCapabilities: ['text'], output: 'text', personalData: true,
    providerId: 'groq', modelId: 'openai/gpt-oss-120b', enabled: true, params: { reasoning_effort: 'low' }, maxOutputTokens: 3000, timeoutMs: 85000,
    version: 1, updatedAt: '2026-10-31T00:00:00Z', blocker: null, compat: null,
    quotas: { perSubjectPerDay: 3, globalPerDay: 100, perMinute: 6, concurrency: 2, dailyBudgetMicroUsd: null, monthlyBudgetMicroUsd: null, version: 1 },
    usage: { dayRequests: 0, dayCostMicroUsd: 0, monthCostMicroUsd: 0 },
  }],
  budget: { dailyLimitMicroUsd: null, monthlyLimitMicroUsd: null, globalConcurrency: null, dayCostMicroUsd: 0, monthCostMicroUsd: 0, dayRequests: 0 },
  runtime: { databaseConfigured: true },
  paramsByProvider: Object.fromEntries(PROVIDER_IDS.map(p => [p, ['reasoning_effort']])),
} as unknown as Overview

const render = () => renderToStaticMarkup(createElement(AssignmentsSection, {
  overview, reload: async () => undefined, openFeature: 'latex.generate', onOpenFeature: () => {},
}))

/** Contenu de la liste dont l'identifiant se termine par `suffix` */
const selectNamed = (html: string, suffix: string) => {
  const match = new RegExp(`<select[^>]*id="[^"]*${suffix}"[^>]*>([\\s\\S]*?)</select>`).exec(html)
  expect(match, suffix).not.toBeNull()
  return { tag: match![0].slice(0, match![0].indexOf('>') + 1), body: match![1] }
}

describe('listes déroulantes du centre IA en thème sombre', () => {
  it('la classe des listes impose un fond opaque et un rendu sombre des options', () => {
    expect(selectClass).toContain('[color-scheme:dark]')
    expect(selectClass).toMatch(/(^| )bg-slate-900( |$)/)
    expect(selectClass).toContain('[&_option]:bg-slate-900')
    expect(selectClass).toContain('[&_option]:text-gray-100')
    // Aucun fond translucide : c'est lui qui laissait le système peindre les options en blanc
    expect(selectClass).not.toContain('bg-white/5')
    expect(inputClass).toContain('bg-white/5')
  })

  it.each(['-provider', '-model', '-reasoning_effort'])('liste %s : classe sombre appliquée', (suffix) => {
    const { tag } = selectNamed(render(), suffix)
    const className = (/class="([^"]*)"/.exec(tag)?.[1] ?? '').replace(/&amp;/g, '&')
    expect(className).toBe(selectClass)
  })

  it('aucune liste du centre IA n’utilise la classe des champs texte', () => {
    for (const tag of render().match(/<select[^>]*>/g) ?? []) expect(tag).not.toContain('bg-white/5')
  })

  it('les six fournisseurs restent proposés : configurés d’abord, les autres regroupés à part', () => {
    const { body } = selectNamed(render(), '-provider')
    const groups = [...body.matchAll(/<optgroup label="([^"]*)">([\s\S]*?)<\/optgroup>/g)]
    expect(groups.map(g => g[1])).toEqual(['Configurés', 'Sans clé valide (à configurer dans « Fournisseurs »)'])
    const values = (html: string) => [...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1])
    expect(values(groups[0][2])).toEqual(['openai', 'groq'])
    expect(values(groups[1][2])).toEqual(['xai', 'gemini', 'openrouter', 'anthropic'])
    expect(body).toContain('OpenAI — désactivé')
    expect(body).toContain('Google Gemini — clé refusée')
    expect(body).toMatch(/<option value="groq" selected="">/)
  })
})

// Rapport GO / NO-GO unique : le verdict ne dépend que des conditions bloquantes
import { describe, it, expect } from 'vitest'
// @ts-expect-error module JavaScript sans déclaration de types
import { evaluate, renderReport } from '../../supabase/checks/go-no-go.mjs'

const ok = { ok: true, detail: '' }
const complete = {
  supabase: { motDePasseBaseConnu: true, hotePooler: 'aws-0-eu.pooler.supabase.com', certificatTelecharge: true },
  vercel: { brancheProduction: 'main', offre: 'Hobby', autoAssignDomaines: true, nomsVariables: 'VITE_API_URL' },
  oracle: { portsConsoleVerifies: true },
  recette: { reussie: true, date: '2026-11-01' },
}

describe('evaluate', () => {
  it('toutes les conditions levées : GO, même si des informations non bloquantes manquent', () => {
    const result = evaluate({ inventory: ok, phase0: ok, vm: ok, releves: complete })
    expect(result.go).toBe(true)
    expect(result.information.every((i: { value: string }) => i.value === 'indisponible')).toBe(true)
  })

  it('aucun fichier ni relevé : NO-GO, toutes les conditions listées', () => {
    const absent = { ok: false, detail: 'absent' }
    const result = evaluate({ inventory: absent, phase0: absent, vm: absent, releves: null })
    expect(result.go).toBe(false)
    expect(result.blocking).toHaveLength(8)
    expect(result.blocking.every((c: { ok: boolean }) => !c.ok)).toBe(true)
  })

  it.each([
    ['sauvegarde en échec', { phase0: { ok: false, detail: 'x' } }],
    ['VM absente', { vm: { ok: false, detail: 'x' } }],
    ['recette non réussie', { releves: { ...complete, recette: { reussie: false } } }],
    ['mot de passe inconnu', { releves: { ...complete, supabase: { ...complete.supabase, motDePasseBaseConnu: false } } }],
    ['réponse texte au lieu de true', { releves: { ...complete, recette: { reussie: 'oui' } } }],
  ])('%s : NO-GO', (_label, change) => {
    expect(evaluate({ inventory: ok, phase0: ok, vm: ok, releves: complete, ...change }).go).toBe(false)
  })
})

describe('renderReport', () => {
  it('rappelle qu’aucune migration n’est autorisée, y compris sur un GO', () => {
    const text = renderReport(evaluate({ inventory: ok, phase0: ok, vm: ok, releves: complete }), '2026-11-01')
    expect(text).toContain('**Verdict : GO.**')
    expect(text).toContain('Aucune migration de production n’est autorisée par ce rapport')
  })
})

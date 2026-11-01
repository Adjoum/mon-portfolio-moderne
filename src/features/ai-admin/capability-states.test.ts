// P1 : états de capacité du centre IA. Un test en échec n'est jamais présenté comme un succès vert.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

const { compatState, modelStates, CAPABILITY_STATES, adjustmentLabel } = await import('./format')
const { probeNotice } = await import('./probeNotice')
type ProbeResult = import('./api').ProbeResult

const probe = (over: Partial<ProbeResult>): ProbeResult => ({
  status: 'compatible', capabilities: ['text'], required: ['text'], failedCapability: null, code: null, param: null,
  rejectedParams: [], adjustments: [], vision: null, latencyMs: 120, estimatedCostMicroUsd: 30, recorded: true,
  message: null, matrixVersion: '2026-11-01.1', estimate: { requests: 1, maxRequests: 2, maxCostMicroUsd: 100 }, ...over,
})

describe('états de capacité', () => {
  it('six états distincts, libellés demandés', () => {
    expect(['available', 'vision_confirmed', 'text_only', 'untested', 'incompatible', 'config_error'].map(s => CAPABILITY_STATES[s as keyof typeof CAPABILITY_STATES].label))
      .toEqual(['Disponible', 'Vision confirmée', 'Texte uniquement', 'Non testé', 'Incompatible confirmé', 'Erreur de configuration'])
  })

  it.each([
    [null, 'untested'],
    [{ status: 'compatible', capabilities: ['text', 'vision'], failedCapability: null }, 'vision_confirmed'],
    [{ status: 'compatible', capabilities: ['text', 'json'], failedCapability: null }, 'compatible'],
    [{ status: 'incompatible', capabilities: ['text'], failedCapability: 'vision' }, 'text_only'],
    [{ status: 'incompatible', capabilities: ['text'], failedCapability: 'json' }, 'incompatible'],
    [{ status: 'config_error', capabilities: ['text'], failedCapability: 'vision' }, 'config_error'],
  ] as const)('%j → %s', (compat, state) => {
    expect(compatState(compat as never)).toBe(state)
  })

  it('états d’un modèle du catalogue : disponible et vision confirmée sont cumulables', () => {
    expect(modelStates({ status: 'available', origin: 'official', lastSeenAt: '2026-11-01', compat: [
      { featureId: 'cv.import.ocr', status: 'compatible', testedAt: '', capabilities: ['text', 'vision'] },
      { featureId: 'cv.generate', status: 'config_error', testedAt: '', capabilities: [] },
    ] })).toEqual(['available', 'vision_confirmed', 'config_error'])
    expect(modelStates({ status: 'unverified', origin: 'manual', lastSeenAt: null, compat: [] })).toEqual(['untested'])
  })
})

describe('message d’un test', () => {
  it('compatible avec vision : succès, code lu affiché', () => {
    const notice = probeNotice(probe({ capabilities: ['text', 'vision'], vision: { expected: 'K7R', received: 'K7R' } }))
    expect(notice.type).toBe('success')
    expect(notice.text).toContain('K7R')
  })

  it.each([
    ['bad_request', 'config_error'], ['invalid_image', 'config_error'], ['unsupported_parameter', 'config_error'], ['model_not_listed', 'config_error'],
  ] as const)('%s : jamais vert (avertissement, rien de conclu)', (code, status) => {
    const notice = probeNotice(probe({ status, code, capabilities: ['text'], failedCapability: 'vision' }))
    expect(notice.type).toBe('warning')
    expect(notice.text).toContain('Erreur de configuration')
    expect(notice.text).not.toMatch(/Test réussi/)
  })

  it('texte uniquement : erreur, avec le code attendu et la réponse reçue', () => {
    const notice = probeNotice(probe({ status: 'incompatible', code: 'vision_misread', failedCapability: 'vision', vision: { expected: 'K7R', received: 'rouge' } }))
    expect(notice.type).toBe('error')
    expect(notice.text).toContain('Texte uniquement')
    expect(notice.text).toContain('attendu K7R, reçu « rouge »')
  })

  it('aucune requête envoyée : dit clairement que rien n’a été facturé', () => {
    expect(probeNotice(probe({ status: 'config_error', code: 'unsupported_parameter', recorded: false })).text).toContain('Aucune requête facturée')
  })

  it('corrections automatiques expliquées', () => {
    expect(adjustmentLabel('endpoint:responses')).toContain('API Responses')
    expect(adjustmentLabel('output_limit_field:max_completion_tokens')).toContain('max_completion_tokens')
  })
})

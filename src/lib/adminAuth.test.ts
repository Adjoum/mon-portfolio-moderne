// P0.A1 — Garde d'interface /admin : une session Supabase seule ne suffit plus.
// Le client Supabase est simulé : aucun appel réseau.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mock = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  rpc:     { data: null as unknown, error: null as unknown },
  aal:     { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null as unknown },
  factors: { data: { all: [] as unknown[], totp: [] as { id: string }[] }, error: null as unknown },
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mock.session } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => mock.aal,
        listFactors: async () => mock.factors,
      },
    },
    rpc: vi.fn(async () => mock.rpc),
  },
}))

const { resolveAdminGateStatus, evaluateAdminAccess, describeAdminApiError, adminFetch } = await import('./adminAuth')
const { supabase } = await import('./supabase')

beforeEach(() => {
  mock.session = { access_token: 'header.payload.signature' }
  mock.rpc     = { data: true, error: null }
  mock.aal     = { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }
  mock.factors = { data: { all: [], totp: [] }, error: null }
})

describe('resolveAdminGateStatus', () => {
  const base = { hasSession: true, isAdmin: true, currentLevel: 'aal2', hasVerifiedTotp: true }
  it.each([
    ['aucune session',                      { ...base, hasSession: false },                          'signed_out'],
    ['session non admin',                   { ...base, isAdmin: false },                             'not_admin'],
    ['session non admin même en aal2',      { ...base, isAdmin: false, currentLevel: 'aal2' },       'not_admin'],
    ['vérification admin impossible',       { ...base, isAdmin: null },                              'error'],
    ['admin sans facteur',                  { ...base, currentLevel: 'aal1', hasVerifiedTotp: false },'mfa_enroll'],
    ['admin avec TOTP non validé (aal1)',   { ...base, currentLevel: 'aal1' },                       'mfa_challenge'],
    ['niveau inconnu',                      { ...base, currentLevel: null },                         'mfa_challenge'],
    ['admin aal2',                          base,                                                    'ready'],
  ] as const)('%s → %s', (_label, input, expected) => {
    expect(resolveAdminGateStatus(input)).toBe(expected)
  })
})

describe('evaluateAdminAccess (client Supabase simulé)', () => {
  it('sans session → signed_out, sans appel rpc', async () => {
    mock.session = null
    vi.mocked(supabase.rpc).mockClear()
    expect((await evaluateAdminAccess()).status).toBe('signed_out')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('utilisateur Supabase ordinaire → not_admin', async () => {
    mock.rpc = { data: false, error: null }
    expect((await evaluateAdminAccess()).status).toBe('not_admin')
  })

  it('réponse rpc non booléenne → not_admin (seul true donne accès)', async () => {
    mock.rpc = { data: 'true', error: null }
    expect((await evaluateAdminAccess()).status).toBe('not_admin')
  })

  it('erreur rpc (fonction absente, réseau) → error, jamais ready', async () => {
    mock.rpc = { data: null, error: { message: 'PGRST202' } }
    expect((await evaluateAdminAccess()).status).toBe('error')
  })

  it('admin sans second facteur → enrôlement obligatoire', async () => {
    expect((await evaluateAdminAccess()).status).toBe('mfa_enroll')
  })

  it('admin avec TOTP en aal1 → défi MFA', async () => {
    mock.factors = { data: { all: [], totp: [{ id: 'factor-1' }] }, error: null }
    expect(await evaluateAdminAccess()).toEqual({ status: 'mfa_challenge', factorId: 'factor-1' })
  })

  it('admin en aal2 → ready', async () => {
    mock.aal = { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }
    mock.factors = { data: { all: [], totp: [{ id: 'factor-1' }] }, error: null }
    expect((await evaluateAdminAccess()).status).toBe('ready')
  })
})

describe('adminFetch', () => {
  it('envoie uniquement le jeton de session, aucun rôle', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await adminFetch('http://127.0.0.1/api/agent/knowledge/list')
    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer header.payload.signature')
    expect([...headers.keys()].filter(k => /role|admin/i.test(k))).toEqual([])
    fetchSpy.mockRestore()
  })
})

describe('describeAdminApiError', () => {
  it.each([
    [401, { code: 'UNAUTHORIZED' },             /Reconnectez-vous/],
    [403, { code: 'FORBIDDEN' },                /réservé/],
    [403, { code: 'MFA_REQUIRED' },             /double authentification/],
    [503, { code: 'KNOWLEDGE_WRITE_DISABLED' }, /désactivée/],
    [429, null,                                 /Trop de requêtes/],
    [500, { error: 'x'.repeat(500) },           /Erreur serveur \(500\)/],
  ])('%i %j', (status, body, expected) => {
    expect(describeAdminApiError(status, body)).toMatch(expected)
  })
})

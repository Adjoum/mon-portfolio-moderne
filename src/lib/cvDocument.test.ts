// P0.CV — Résolution du CV affiché : la référence persistante prime toujours sur le fichier statique
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  storage: {
    from: (bucket: string) => ({
      getPublicUrl: (path: string, opts?: { download?: string }) => ({
        data: { publicUrl: `https://stockage.test/${bucket}/${path}${opts?.download ? `?download=${opts.download}` : ''}` },
      }),
    }),
  },
}))
vi.mock('./supabase', () => ({ supabase: mock }))

const { resolveCvState, fetchActiveCv, cvVersionUrls, LEGACY_CV_URL } = await import('./cvDocument')

const VERSION = {
  id: '11111111-1111-4111-8111-111111111111', bucket: 'portfolio-public-documents',
  storage_path: 'cv/versions/11111111-1111-4111-8111-111111111111.pdf',
  sha256: 'a'.repeat(64), size_bytes: 1000, activated_at: '2026-10-30T10:00:00Z',
}
const urls = () => ({ viewUrl: 'V', downloadUrl: 'D' })

beforeEach(() => {
  mock.rpc.mockReset()
})

describe('resolveCvState', () => {
  it('une version active prime sur le fichier statique', () => {
    expect(resolveCvState({ data: [VERSION], error: null }, urls)).toEqual({ kind: 'active', version: VERSION, viewUrl: 'V', downloadUrl: 'D' })
  })

  it('aucune version publiée → fichier statique', () => {
    expect(resolveCvState({ data: [], error: null }, urls)).toMatchObject({ kind: 'legacy', viewUrl: LEGACY_CV_URL })
  })

  it('migration non appliquée (PGRST202) → fichier statique, le site continue de fonctionner', () => {
    expect(resolveCvState({ data: null, error: { code: 'PGRST202' } }, urls).kind).toBe('legacy')
  })

  it.each([
    ['panne serveur', { code: '500' }],
    ['réseau',        {}],
    ['délai dépassé', { code: 'ETIMEDOUT' }],
  ])('%s → erreur explicite, JAMAIS le fichier statique', (_l, error) => {
    expect(resolveCvState({ data: null, error }, urls)).toEqual({ kind: 'error' })
  })
})

describe('fetchActiveCv', () => {
  it('lit la référence à chaque appel, sans cache local', async () => {
    mock.rpc.mockResolvedValue({ data: [VERSION], error: null })
    await fetchActiveCv()
    await fetchActiveCv()
    expect(mock.rpc).toHaveBeenCalledTimes(2)
    expect(mock.rpc).toHaveBeenCalledWith('cv_active')
  })

  it('exception réseau → erreur explicite', async () => {
    mock.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchActiveCv()).toEqual({ kind: 'error' })
  })

  it('une ancienne valeur en localStorage ne peut pas écraser la version active', async () => {
    const store = globalThis as { localStorage?: unknown }
    store.localStorage = { getItem: () => 'data:application/pdf;base64,ANCIEN' }
    mock.rpc.mockResolvedValue({ data: [VERSION], error: null })
    const cv = await fetchActiveCv()
    expect(cv.kind === 'active' && cv.viewUrl).toContain(VERSION.storage_path)
    delete store.localStorage
  })
})

describe('cvVersionUrls', () => {
  it('aperçu et téléchargement désignent le même objet versionné', () => {
    const { viewUrl, downloadUrl } = cvVersionUrls(VERSION)
    expect(viewUrl).toContain(VERSION.storage_path)
    expect(downloadUrl.split('?')[0]).toBe(viewUrl)
    expect(downloadUrl).toContain('download=CV-Adjoumani.pdf')
  })
})

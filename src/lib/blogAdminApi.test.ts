// Écritures du blog depuis le navigateur : jeton de session Supabase, jamais le jeton du blog.
// Le client Supabase et fetch sont simulés : aucun appel réseau.
import fs from 'node:fs'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mock = vi.hoisted(() => ({ session: null as null | { access_token: string } }))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mock.session } }) } },
}))

const { getArticleForEdit, saveArticle, deleteArticleAsAdmin, uploadBlogImage } = await import('./blogAdminApi')

const calls: { url: string; init: RequestInit }[] = []
function answer(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
}
const header = (i: number, name: string) => new Headers(calls[i].init.headers).get(name)

beforeEach(() => {
  calls.length = 0
  mock.session = { access_token: 'supabase.session.token' }
  // Un ancien jeton du blog resté dans le navigateur : il ne doit jamais être lu ni envoyé
  vi.stubGlobal('localStorage', { getItem: () => 'ancien.jeton.blog', setItem: () => {}, removeItem: () => {} })
})

describe('client d’écriture du blog', () => {
  it('envoie le jeton Supabase, jamais celui du blog', async () => {
    answer(201, { _id: 'a1' })
    await saveArticle({ title: 'Titre' })
    expect(header(0, 'Authorization')).toBe('Bearer supabase.session.token')
    expect(JSON.stringify(calls)).not.toContain('ancien.jeton.blog')
  })

  it('création, modification, lecture du brouillon, suppression : bonnes routes et méthodes', async () => {
    answer(200, {})
    await saveArticle({ title: 'T' })
    await saveArticle({ title: 'T' }, 'a/1')
    await getArticleForEdit('a1')
    await deleteArticleAsAdmin('a1')
    expect(calls.map(c => [c.init.method ?? 'GET', c.url.replace(/^.*\/api/, '')])).toEqual([
      ['POST', '/articles'], ['PUT', '/articles/a%2F1'], ['GET', '/articles/id/a1'], ['DELETE', '/articles/a1'],
    ])
    expect(header(0, 'Content-Type')).toBe('application/json')
  })

  it('image : multipart laissé au navigateur (aucun Content-Type forcé)', async () => {
    answer(200, { url: 'https://res.cloudinary.test/a.png' })
    const res = await uploadBlogImage(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(res.url).toBe('https://res.cloudinary.test/a.png')
    expect(header(0, 'Content-Type')).toBeNull()
    expect(calls[0].init.body).toBeInstanceOf(FormData)
  })

  it.each([
    [403, 'MFA_REQUIRED', 'Validez la double authentification'],
    [401, 'ADMIN_SESSION_EXPIRED', 'verrouillée après 10 minutes'],
    [503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Administration indisponible'],
  ])('refus %i %s : message lisible', async (status, code, text) => {
    answer(status, { error: 'x', code })
    await expect(saveArticle({ title: 'T' })).rejects.toThrow(text)
  })

  it('sans session Supabase : aucun en-tête Authorization', async () => {
    mock.session = null
    answer(401, { code: 'UNAUTHORIZED' })
    await expect(deleteArticleAsAdmin('a1')).rejects.toThrow('Session absente')
    expect(header(0, 'Authorization')).toBeNull()
  })
})

describe('plus aucune écriture d’administration avec le jeton du blog', () => {
  it.each(['src/pages/AdminBlogPage.tsx', 'src/pages/BlogPage.tsx', 'src/lib/blogAdminApi.ts', 'src/components/admin/AdminArea.tsx'])('%s', (file) => {
    const code = fs.readFileSync(file, 'utf8')
    expect(code).not.toContain('blog_token')
    expect(code).not.toContain('blog_user')
    expect(code).not.toContain('AdminLoginPage')
  })
})

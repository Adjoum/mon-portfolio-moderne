// P2 — Import de CV (navigateur) : requête minimale vers blog-api, données intermédiaires conformes
// au schéma strict du serveur, réécriture appliquée champ par champ sans toucher aux faits.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { classify, extractText, rewriteChanges, applyRewrite, structureText, ImportFailure } from './importCv'
import { forServer, normalizeCv } from './cvData'
import { sampleCv } from '../templates/sample'

afterEach(() => vi.restoreAllMocks())

const file = (name: string, type: string, body = 'x') => new File([body], name, { type })

describe('formats', () => {
  it.each([
    ['cv.pdf', 'application/pdf', 'pdf'], ['CV.DOCX', '', 'docx'], ['cv.txt', 'text/plain', 'txt'], ['cv.rtf', 'application/rtf', 'rtf'],
    ['scan.jpg', 'image/jpeg', 'image'], ['scan.png', 'image/png', 'image'],
    ['cv.docm', '', null], ['cv.html', 'text/html', null], ['photo.svg', 'image/svg+xml', null], ['faux.png', 'text/html', null], ['cv.exe', '', null],
  ])('%s (%s) → %s', (name, type, kind) => {
    expect(classify(file(name, type))).toBe(kind)
  })
})

describe('extraction', () => {
  it('octets bruts et type déclaré uniquement : ni nom de fichier, ni identifiant', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Awa Konan', truncated: false, pages: 1, needsOcr: false }), { status: 200 }))
    const f = file('cv-awa-konan.pdf', 'application/pdf', '%PDF-1.7')
    expect(await extractText(f, 'pdf')).toEqual({ text: 'Awa Konan', truncated: false, needsOcr: false })
    const [url, init] = spy.mock.calls[0]
    expect(String(url)).toMatch(/\/cv\/import$/)
    expect(init?.body).toBe(f)
    const headers = new Headers(init?.headers)
    expect([...headers.keys()].sort()).toEqual(['content-type', 'x-file-type'])
    expect(headers.get('content-type')).toBe('application/octet-stream')
    expect(JSON.stringify([...headers.entries()])).not.toContain('awa')
  })

  it('erreur du serveur : message lisible, code conservé', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'IMPORT_ACTIVE_CONTENT', error: 'Document refusé : macros.' }), { status: 422 }))
    const err = await extractText(file('cv.docx', ''), 'docx').catch(e => e)
    expect(err).toBeInstanceOf(ImportFailure)
    expect(err.code).toBe('IMPORT_ACTIVE_CONTENT')
    expect(err.message).toBe('Document refusé : macros.')
  })

  it('structuration : réponse normalisée (liens dangereux et éléments vides retirés)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ content: JSON.stringify({
      identity: { fullName: 'Awa Konan', links: [{ label: 'x', url: 'javascript:alert(1)' }] },
      experiences: [{ role: 'Data Analyst', bullets: ['A', ''] }, {}],
    }) }), { status: 200 }))
    const cv = await structureText('Awa Konan', 'fr')
    expect(cv.identity.links).toEqual([])
    expect(cv.experiences).toEqual([{ id: 'e1', role: 'Data Analyst', organization: '', location: '', start: '', end: '', bullets: ['A'] }])
  })
})

describe('données intermédiaires', () => {
  it('saisie en cours (lignes et éléments vides) : nettoyée avant envoi', () => {
    const cv = normalizeCv(sampleCv())
    cv.experiences[0].bullets = ['A', '', '  ']
    cv.skills[0].items = ['Python', '']
    cv.experiences.push({ id: '', role: '', organization: '', location: '', start: '', end: '', bullets: [''] })
    const out = forServer(cv)
    expect(out.experiences[0].bullets).toEqual(['A'])
    expect(out.skills[0].items).toEqual(['Python'])
    expect(out.experiences).toHaveLength(3)
  })
})

describe('réécriture', () => {
  const before = forServer(sampleCv())
  const after = JSON.parse(JSON.stringify(before))
  after.identity.headline = 'Titre reformulé'
  after.summary = 'Profil reformulé'
  after.experiences[0].bullets = ['Puce reformulée']
  after.experiences[0].organization = 'Employeur inventé'
  after.education[0].degree = 'Doctorat inventé'

  it('changements présentés champ par champ (jamais les faits)', () => {
    const keys = rewriteChanges(before, after).map(c => c.key)
    expect(keys).toEqual(['headline', 'summary', 'exp:0'])
  })

  it('seuls les changements acceptés sont appliqués ; employeurs et diplômes inchangés', () => {
    const out = applyRewrite(before, after, new Set(['summary', 'exp:0']))
    expect(out.identity.headline).toBe(before.identity.headline)
    expect(out.summary).toBe('Profil reformulé')
    expect(out.experiences[0].bullets).toEqual(['Puce reformulée'])
    expect(out.experiences[0].organization).toBe(before.experiences[0].organization)
    expect(out.education[0].degree).toBe(before.education[0].degree)
  })
})

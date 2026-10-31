// Aperçu PDF de l'éditeur LaTeX : client navigateur de POST /api/cv/compile
import { describe, it, expect, vi, afterEach } from 'vitest'
import { compileLatexPdf, LatexCompileError, stripCodeFences } from './latexCompile'
import { buildFinalLatex, photoPlaceholder, TEMPLATES } from '../pages/CVBuilder/latexTemplates'

const PDF = new TextEncoder().encode('%PDF-1.5\n%%EOF\n')
const respond = (status: number, body: BodyInit, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers }))

afterEach(() => vi.restoreAllMocks())

describe('compileLatexPdf', () => {
  it('appelle blog-api avec { code, photo } uniquement, sans identifiant ni cookie', async () => {
    const spy = respond(200, PDF, { 'Content-Type': 'application/pdf' })
    const blob = await compileLatexPdf('\\documentclass{article}', 'data:image/jpeg;base64,/9j/')
    expect(blob.type).toBe('application/pdf')

    const [url, init] = spy.mock.calls[0]
    expect(String(url)).toMatch(/\/cv\/compile$/)
    expect(JSON.parse(String(init?.body))).toEqual({ code: '\\documentclass{article}', photo: 'data:image/jpeg;base64,/9j/' })
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(init?.credentials).toBeUndefined()
  })

  it('sans photo : le champ photo est absent', async () => {
    const spy = respond(200, PDF, { 'Content-Type': 'application/pdf' })
    await compileLatexPdf('x', null)
    expect(Object.keys(JSON.parse(String(spy.mock.calls[0][1]?.body)))).toEqual(['code'])
  })

  it.each([
    ['HTML déclaré PDF', '<html><script>alert(1)</script>', 'application/pdf'],
    ['PDF déclaré HTML', '%PDF-1.5', 'text/html'],
  ])('réponse non PDF (%s) : refusée, jamais affichée', async (_label, body, type) => {
    respond(200, body, { 'Content-Type': type })
    await expect(compileLatexPdf('x', null)).rejects.toMatchObject({ code: 'LATEX_INVALID_RESPONSE' })
  })

  it('erreur de compilation : message, lignes et extraits du serveur', async () => {
    respond(422, JSON.stringify({
      code: 'LATEX_COMPILE_ERROR', error: 'La compilation LaTeX a échoué.',
      details: [{ line: 12, message: 'Undefined control sequence.', context: '\\textbfz' }, { message: 42 }],
    }), { 'Content-Type': 'application/json' })
    const err = await compileLatexPdf('x', null).catch(e => e) as LatexCompileError
    expect(err).toBeInstanceOf(LatexCompileError)
    expect(err.message).toBe('La compilation LaTeX a échoué.')
    expect(err.details).toEqual([{ line: 12, message: 'Undefined control sequence.', context: '\\textbfz' }])
    expect(err.unavailable).toBe(false)
    expect(err.throttled).toBe(false)
  })

  it.each([
    [503, 'LATEX_COMPILE_DISABLED', true, false],
    [503, 'LATEX_RUNNER_UNAVAILABLE', true, false],
    [502, 'LATEX_RUNNER_ERROR', true, false],
    [429, 'LATEX_QUOTA_EXCEEDED', false, true],
    [429, 'RATE_LIMIT_EXCEEDED', false, true],
    [503, 'LATEX_BUSY', false, false],
  ])('HTTP %i %s → indisponible : %s, limite : %s', async (status, code, unavailable, throttled) => {
    respond(status, JSON.stringify({ code, error: 'message' }), { 'Content-Type': 'application/json', 'Retry-After': '120' })
    const err = await compileLatexPdf('x', null).catch(e => e) as LatexCompileError
    expect(err.code).toBe(code)
    expect(err.unavailable).toBe(unavailable)
    expect(err.throttled).toBe(throttled)
    expect(err.retryAfterSec).toBe(120)
  })

  it('API injoignable → LATEX_NETWORK', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(compileLatexPdf('x', null)).rejects.toMatchObject({ code: 'LATEX_NETWORK' })
  })
})

describe('code compilé et téléchargé', () => {
  it('la photo remplace le marqueur, largeur bornée et arrondie', () => {
    const out = buildFinalLatex('a\n%%PHOTO%%\nb', true, 3.3000000000000003)
    expect(out).toBe('a\n\\includegraphics[width=3.3cm,keepaspectratio]{photo.jpg}\nb')
    expect(buildFinalLatex('%%PHOTO%%', true, 99)).toContain('width=6.0cm')
  })

  it('sans photo : cadre coloré si xcolor est chargé, simple cadre sinon (jamais d’erreur de couleur)', () => {
    expect(photoPlaceholder('\\usepackage{xcolor}')).toContain('\\definecolor{softblue}')
    expect(photoPlaceholder('\\usepackage[dvipsnames]{xcolor}')).toContain('\\colorbox{softblue}')
    expect(photoPlaceholder('\\usepackage{graphicx}')).toMatch(/^\\fbox\{/)
    expect(photoPlaceholder('\\usepackage{graphicx}')).not.toContain('color')
  })

  it('les numéros de ligne restent identiques (une ligne remplacée par une ligne)', () => {
    for (const t of Object.values(TEMPLATES)) {
      for (const photo of [true, false]) {
        expect(buildFinalLatex(t.code, photo, 3.2).split('\n')).toHaveLength(t.code.split('\n').length)
      }
    }
  })

  it('un « $ » dans le code n’est pas interprété par replace', () => {
    expect(buildFinalLatex('$&$ %%PHOTO%% $1', false, 3.2)).toMatch(/^\$&\$ .* \$1$/)
  })

  it('balises Markdown retirées d’une génération IA', () => {
    expect(stripCodeFences('```latex\n\\documentclass{article}\n```')).toBe('\\documentclass{article}')
    expect(stripCodeFences('\\documentclass{article}')).toBe('\\documentclass{article}')
  })
})

// P1 — Correction IA des erreurs LaTeX : modifications revalidées dans le navigateur, appliquées
// seulement à l'instantané envoyé, deux tentatives au plus ; panneau d'erreur.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyEdits, hunks, validateEdits, EditError } from './edits'
import { requestFix, isFixable, MAX_FIX_ATTEMPTS } from './fix'
import { LatexCompileError } from '../../../lib/latexCompile'
import { ErrorPanel } from '../components/ErrorPanel'

const CODE = ['\\documentclass{article}', '\\begin{document}', 'Awa Konan', '\\textbfz{Data Analyst}', '%%PHOTO%%', '\\end{document}'].join('\n')

afterEach(() => vi.restoreAllMocks())

describe('modifications de lignes', () => {
  it('remplacement, insertion avant une ligne, suppression, ajout en fin', () => {
    const out = applyEdits(CODE, [
      { start: 4, end: 4, replacement: '\\textbf{Data Analyst}' },
      { start: 2, end: 1, replacement: '\\usepackage{xcolor}' },
      { start: 3, end: 3, replacement: '' },
      { start: 7, end: 6, replacement: '% fin' },
    ])
    expect(out.split('\n')).toEqual(['\\documentclass{article}', '\\usepackage{xcolor}', '\\begin{document}', '\\textbf{Data Analyst}', '%%PHOTO%%', '\\end{document}', '% fin'])
  })

  it.each([
    ['ligne absente', [{ start: 50, end: 50, replacement: 'x' }]],
    ['plage inversée', [{ start: 4, end: 2, replacement: 'x' }]],
    ['chevauchement', [{ start: 2, end: 4, replacement: 'a' }, { start: 3, end: 3, replacement: 'b' }]],
    ['type inattendu', [{ start: '4', end: 4, replacement: 'x' }]],
    ['plus de 20 modifications', Array.from({ length: 21 }, () => ({ start: 1, end: 0, replacement: '%' }))],
  ])('refusé : %s', (_label, edits) => {
    expect(() => validateEdits(CODE, edits)).toThrow(EditError)
  })

  it('aperçu : lignes retirées et ajoutées, avec contexte numéroté', () => {
    const [h] = hunks(CODE, [{ start: 4, end: 4, replacement: '\\textbf{Data Analyst}' }])
    expect(h.removed).toEqual([{ n: 4, text: '\\textbfz{Data Analyst}' }])
    expect(h.added).toEqual(['\\textbf{Data Analyst}'])
    expect(h.before.map(l => l.n)).toEqual([2, 3])
    expect(h.after.map(l => l.n)).toEqual([5, 6])
  })
})

describe('requestFix', () => {
  it('envoie le code, les erreurs (5 au plus) et la tentative ; rien d’autre', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      content: JSON.stringify({ edits: [{ start: 4, end: 4, replacement: '\\textbf{Data Analyst}' }], explanation: 'Faute de frappe.' }),
    }), { status: 200 }))
    const errors = Array.from({ length: 7 }, (_, i) => ({ line: 4, message: `Erreur ${i}`, context: 'x' }))
    const proposal = await requestFix(CODE, errors, 2)
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body))
    expect(String(spy.mock.calls[0][0])).toMatch(/\/ai\/run\/latex\.fix$/)
    expect(Object.keys(body.input).sort()).toEqual(['attempt', 'code', 'errors'])
    expect(body.input.errors).toHaveLength(5)
    expect(body.input.attempt).toBe(2)
    expect(proposal).toEqual({ base: CODE, edits: [{ start: 4, end: 4, replacement: '\\textbf{Data Analyst}' }], explanation: 'Faute de frappe.' })
  })

  it('proposition hors du document refusée dans le navigateur aussi', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ content: JSON.stringify({ edits: [{ start: 99, end: 99, replacement: 'x' }] }) }), { status: 200 }))
    await expect(requestFix(CODE, [{ message: 'x' }], 1)).rejects.toBeInstanceOf(EditError)
  })

  it('deux tentatives au maximum', () => {
    expect(MAX_FIX_ATTEMPTS).toBe(2)
  })
})

describe('panneau d’erreur', () => {
  const error = new LatexCompileError('LATEX_COMPILE_ERROR', 422, 'La compilation LaTeX a échoué.', [{ line: 4, message: 'Undefined control sequence.', context: '\\textbfz' }])
  const render = (fix: Partial<Parameters<typeof ErrorPanel>[0]['fix']>, err = error) => renderToStaticMarkup(createElement(ErrorPanel, {
    error: err, hasPdf: true, onGoToLine: () => {}, onUndo: () => {}, canUndo: true,
    fix: { available: true, attempts: 0, max: 2, busy: false, message: null, onFix: () => {}, ...fix },
  }))

  it('bouton « Corriger l’erreur avec l’IA », ligne cliquable, retour à la version précédente', () => {
    const html = render({})
    expect(html).toContain('Corriger l’erreur avec l’IA')
    expect(html).toContain('Ligne 4')
    expect(html).toContain('Version précédente')
    expect(html).toContain('role="alert"')
  })

  it('deuxième tentative, puis plus de bouton après deux essais', () => {
    expect(render({ attempts: 1 })).toContain('Nouvelle tentative de correction (2/2)')
    const exhausted = render({ attempts: 2 })
    expect(exhausted).not.toContain('Corriger l’erreur avec l’IA')
    expect(exhausted).toContain('Deux corrections automatiques ont été tentées')
  })

  it('fonction désactivée dans le centre IA : message, pas de bouton', () => {
    const html = render({ available: false })
    expect(html).not.toContain('Corriger l’erreur avec l’IA')
    expect(html).toContain('momentanément indisponible')
  })

  it.each([
    ['LATEX_COMPILE_ERROR', true], ['LATEX_PACKAGE_NOT_ALLOWED', true], ['LATEX_FORBIDDEN_COMMAND', true],
    ['LATEX_QUOTA_EXCEEDED', false], ['LATEX_TIMEOUT', false], ['LATEX_RUNNER_UNAVAILABLE', false], ['LATEX_BUSY', false],
  ])('%s corrigeable par l’IA : %s', (code, expected) => {
    expect(isFixable(new LatexCompileError(code, 422, 'x'))).toBe(expected)
  })
})

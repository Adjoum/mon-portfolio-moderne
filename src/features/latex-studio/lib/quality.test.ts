// P3 — Contrôle qualité du rendu, sur des pages synthétiques (les vrais PDF : scripts/latex-templates-recette.mjs)
import { describe, it, expect } from 'vitest'
import { analyzeQuality, type PageText, type TextItem } from './quality'

const A4 = { width: 595.28, height: 841.89 }
const item = (str: string, x: number, y: number, height = 10, width = str.length * 5): TextItem => ({ str, x, y, width, height })
const page = (items: TextItem[]): PageText => ({ ...A4, items })
const codes = (pages: PageText[], warnings = [], name = '') => analyzeQuality(pages, warnings, name).map(i => i.code)

const BODY = [item('Expérience', 54, 700), item('Data Analyst — Institut A', 54, 680), item('Python, SQL', 54, 400)]
const NAME = item('Awa Konan', 54, 780, 24, 120)

describe('contrôle qualité', () => {
  it('document propre : aucun défaut', () => {
    expect(analyzeQuality([page([NAME, ...BODY])], [], 'Awa Konan')).toEqual([])
  })

  it('nom coupé sur deux lignes (cas du modèle d’origine « ADJOU- / MANI »)', () => {
    const split = [item('KOFFI WILFRIED ADJOU-', 54, 780, 24, 300), item('MANI', 54, 752, 24, 60), ...BODY]
    expect(codes([page(split)])).toContain('name-split')
  })

  it('nom en capitales espacées reconnu (insensible à la casse et aux espaces)', () => {
    const spaced = [item('A W A K O N A N', 54, 780, 24, 160), ...BODY]
    expect(codes([page(spaced)], [], 'Awa Konan')).not.toContain('name-split')
  })

  it('texte hors des marges ou coupé au bord', () => {
    expect(codes([page([NAME, ...BODY, item('Texte qui déborde à droite', 500, 500, 10, 120)])])).toContain('margin')
    expect(codes([page([NAME, ...BODY, item('Pied coupé', 54, 2)])])).toContain('margin')
  })

  it('page blanche', () => {
    expect(codes([page([NAME, ...BODY]), page([])])).toContain('blank-page')
  })

  it('dernière page presque vide : conseil de mise en page', () => {
    const issues = analyzeQuality([page([NAME, ...BODY]), page([item('Centres d’intérêt', 54, 780), item('Sport', 54, 765)])], [])
    expect(issues.find(i => i.code === 'last-page')?.severity).toBe('info')
  })

  it('coordonnées fictives et textes d’exemple', () => {
    const fake = [NAME, item('+225 XX XX XX XX', 54, 760), item('votreemail@email.com', 200, 760), ...BODY]
    const messages = analyzeQuality([page(fake)], []).filter(i => i.code === 'placeholder').map(i => i.message)
    expect(messages.join(' ')).toMatch(/téléphone fictif/)
    expect(messages.join(' ')).toMatch(/adresse e-mail fictive/)
  })

  it('avertissements de TeX : débordement (avec ligne) et caractère manquant', () => {
    const issues = analyzeQuality([page([NAME, ...BODY])], [
      { kind: 'overfull', line: 42, message: 'Texte trop large de 12.0 pt : il dépasse dans la marge.' },
      { kind: 'missing-char', message: 'Caractère absent de la police, non imprimé : ✓' },
    ])
    expect(issues).toContainEqual(expect.objectContaining({ code: 'overflow', line: 42, severity: 'warning' }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'missing-char', severity: 'error' }))
  })
})

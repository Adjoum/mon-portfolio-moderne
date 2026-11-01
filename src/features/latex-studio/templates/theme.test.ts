// P5 : variables de thème centralisées. Valeurs bornées, aucune injection, rendu déterministe,
// chaque réglage visible dans le code produit.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_LIBRARY, renderCv } from './library'
import { sampleCv } from './sample'
import { FONT_CHOICES, FONT_LINES, resolveTheme, sanitizeTheme, DEFAULT_DESIGN, type ThemeOverrides } from './theme'

const render = (theme: ThemeOverrides, id = 'silicon-valley', extra = {}) => renderCv(id, sampleCv(), { theme, ...extra })
const section = (code: string) => /\\newcommand\{\\cvsection\}.*$/m.exec(code)?.[0] ?? ''

describe('réglages relus et bornés', () => {
  it('valeurs hors limites ramenées dans les bornes, valeurs inconnues écartées', () => {
    expect(sanitizeTheme({ nameSize: 1e9, lineSpread: -4, marginX: 0.2, tracking: 999, columnRatio: 0.9 }))
      .toEqual({ nameSize: 40, lineSpread: 0.9, marginX: 1, tracking: 150, columnRatio: 0.42 })
    expect(sanitizeTheme({ paper: 'a3', density: 'énorme', separator: 'double', sectionAlign: 'justify', inconnu: 1 })).toEqual({})
    expect(sanitizeTheme(null)).toEqual({})
  })

  it('aucune valeur ne peut injecter de LaTeX', () => {
    const hostile = {
      heading: '000000}\\immediate\\write18{rm}', text: 'red', rule: '#12345', secondary: '12345G',
      headlineSize: 'large}\\input{/etc/passwd', detailSize: '\\def', nameSize: '24}\\write18{x}', lineSpread: '1}\\x',
    }
    const t = sanitizeTheme(hostile)
    expect(t).toEqual({})
    const code = render(hostile as unknown as ThemeOverrides)
    expect(code).not.toMatch(/write18|passwd|\\def\b|\\x\b/)
  })

  it('couleurs hexadécimales normalisées en majuscules', () => {
    expect(sanitizeTheme({ heading: '0f766e' }).heading).toBe('0F766E')
  })
})

describe('variables de thème dans le code', () => {
  it('style d’origine inchangé sans réglage', () => {
    const code = render({})
    expect(code).toContain('\\documentclass[10pt,a4paper]{article}')
    expect(code).toContain('\\newcommand{\\cvnamefont}{\\fontsize{24}{28}\\selectfont}')
    expect(code).toContain('\\colorlet{heading}{accent}')
    expect(section(code)).toContain('\\hrule height \\cvrulewidth')
    expect(code).not.toContain('\\linespread')
  })

  it.each([
    [{ nameSize: 30 }, '\\fontsize{30}{35}\\selectfont'],
    [{ heading: '7A1E2C' }, '\\definecolor{heading}{HTML}{7A1E2C}'],
    [{ text: '1F2937' }, '\\definecolor{bodytext}{HTML}{1F2937}'],
    [{ rule: 'B45309' }, '\\definecolor{cvrule}{HTML}{B45309}'],
    [{ secondary: '0E7490' }, '\\definecolor{accent2}{HTML}{0E7490}'],
    [{ paper: 'letter' }, '\\documentclass[10pt,letterpaper]{article}'],
    [{ marginX: 2.5, marginY: 1.2 }, 'top=1.2cm,bottom=1.2cm,left=2.5cm,right=2.5cm'],
    [{ lineSpread: 1.2 }, '\\linespread{1.2}'],
    [{ paragraphSkip: 6 }, '\\setlength{\\parskip}{6pt}'],
    [{ sectionBefore: 14 }, '\\setlength{\\cvsectionbefore}{14pt}'],
    [{ sectionSize: 'Large', sectionBold: false }, '\\newcommand{\\cvsectionfont}{\\Large\\mdseries}'],
    [{ sectionUpper: false, tracking: 0 }, '\\newcommand{\\cvtitletext}[1]{#1}'],
    [{ tracking: 120 }, '\\textls[120]{\\MakeUppercase{#1}}'],
    [{ headlineSize: 'Large', headlineItalic: true }, '\\newcommand{\\cvheadline}{\\color{accent2}\\Large\\itshape}'],
    [{ detailSize: 'footnotesize' }, '\\newcommand{\\cvdetailfont}{\\footnotesize}'],
    [{ density: 'airy' }, 'itemsep=3pt,topsep=3pt'],
  ] as [ThemeOverrides, string][])('%j → %s', (theme, expected) => {
    expect(render(theme)).toContain(expected)
  })

  it('texte en couleur appliqué dès le début du document', () => {
    expect(render({ text: '1F2937' })).toMatch(/\\begin\{document\}\n\\color\{bodytext\}/)
  })

  it('titres centrés et sans séparateur', () => {
    const code = section(render({ sectionAlign: 'center', separator: 'none' }))
    expect(code).toContain('{\\centering ')
    expect(code).not.toContain('\\hrule')
  })

  it('séparateur épais', () => {
    expect(render({ separator: 'thick' })).toContain('\\setlength{\\cvrulewidth}{1.4pt}')
  })

  it('entrées : garder sur une page, ou simple nouveau paragraphe', () => {
    expect(render({})).toContain('\\needspace{3\\baselineskip}')
    const loose = render({ keepEntries: false })
    expect(loose).not.toContain('\\needspace{3\\baselineskip}')
    expect(loose).toContain('\\par\n\\begin{tabularx}')
  })

  it('largeur de la colonne latérale (modèle à deux colonnes)', () => {
    expect(render({ columnRatio: 0.35 }, 'software-architect')).toContain('\\columnratio{0.35}')
  })

  it('dix polices proposées, chacune avec sa ligne de préambule', () => {
    expect(FONT_CHOICES).toHaveLength(10)
    for (const f of FONT_CHOICES) {
      expect(FONT_LINES[f.id]).toBeTruthy()
      expect(renderCv('executive-prestige', sampleCv(), { font: f.id })).toContain(FONT_LINES[f.id])
    }
  })

  it('aucune valeur indéfinie dans le code, quel que soit le modèle ou le thème', () => {
    const themes: ThemeOverrides[] = [{}, { density: 'airy', separator: 'thick', sectionAlign: 'center', paper: 'letter' }, { density: 'compact', separator: 'none', keepEntries: false }]
    for (const t of TEMPLATE_LIBRARY) for (const theme of themes) {
      const code = renderCv(t.id, sampleCv('long'), { theme })
      expect(code, t.id).not.toMatch(/undefined|NaN|null|\[object/)
      expect(renderCv(t.id, sampleCv('long'), { theme })).toBe(code)
    }
  })
})

describe('résolution du thème', () => {
  it('ordre : style du modèle, puis densité, puis réglages', () => {
    const base = { ...DEFAULT_DESIGN, nameSize: 22, sectionBefore: 11 }
    expect(resolveTheme(base, false, {}).sectionBefore).toBe(11)
    expect(resolveTheme(base, false, { density: 'compact' }).sectionBefore).toBe(5)
    expect(resolveTheme(base, false, { density: 'compact', sectionBefore: 9 }).sectionBefore).toBe(9)
    expect(resolveTheme(base, true, {}).density).toBe('compact')
    expect(resolveTheme(base, true, { nameSize: 30 }).design.nameSize).toBe(30)
  })
})

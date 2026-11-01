// P3 — Modèles de CV : chaque modèle, avec et sans photo, court ou long, respecte la politique de
// latex-runner ; une donnée malveillante ne devient jamais une commande ; aucune section n'est perdue.
import { describe, it, expect } from 'vitest'
// @ts-expect-error module JavaScript du service, sans déclarations de types
import { checkSource } from '../../../../latex-runner/src/policy.mjs'
import { TEMPLATE_LIBRARY, renderCv } from './library'
import { sampleCv } from './sample'
import { tex, texUrl, link } from './escape'
import { emptyCv, normalizeCv } from '../lib/cvData'
import { buildFinalLatex } from '../../../pages/CVBuilder/latexTemplates'

const variants = TEMPLATE_LIBRARY.flatMap(t => [
  { t, label: 'par défaut', opts: {} },
  { t, label: 'avec photo', opts: { photo: true } },
  { t, label: 'compact, anglais', opts: { compact: true, lang: 'en' as const, size: 10 as const } },
  { t, label: 'police Times, marges larges', opts: { font: 'times' as const, margins: 'large' as const, size: 12 as const } },
  ...(t.supports.twoColumns ? [{ t, label: 'une colonne', opts: { twoColumns: false } }] : []),
])

describe('bibliothèque', () => {
  it('huit modèles, identifiants uniques, catégories demandées', () => {
    expect(TEMPLATE_LIBRARY.map(t => t.name)).toEqual([
      'Silicon Valley Engineer', 'Executive Prestige', 'AI & Data Scientist', 'Software Architect',
      'Healthcare & Research', 'Minimal ATS Pro', 'Modern Creative', 'Academic Research',
    ])
    expect(new Set(TEMPLATE_LIBRARY.map(t => t.id)).size).toBe(8)
  })

  it.each(variants.map(v => [`${v.t.name} — ${v.label}`, v]))('%s : conforme à la politique de latex-runner', (_name, v) => {
    for (const size of ['short', 'long'] as const) {
      const code = renderCv(v.t.id, sampleCv(size), v.opts)
      for (const photo of [true, false]) expect(() => checkSource(buildFinalLatex(code, photo, 3.2))).not.toThrow()
    }
  })

  it.each(TEMPLATE_LIBRARY.map(t => [t.name, t]))('%s : toutes les sections renseignées figurent dans le document', (_name, t) => {
    const cv = sampleCv('short')
    const code = renderCv(t.id, cv)
    for (const text of ['Prénom NOM', 'Intitulé du poste', 'Diplôme et spécialité', 'Compétence clé', 'Nom du projet', 'Français', 'Certification professionnelle', 'Titre de la publication 1', 'Engagement associatif']) {
      expect(code, text).toContain(tex(text))
    }
  })

  it.each(TEMPLATE_LIBRARY.map(t => [t.name, t]))('%s : photo seulement si demandée (et ATS jamais)', (_name, t) => {
    expect(renderCv(t.id, sampleCv(), { photo: false })).not.toContain('%%PHOTO%%')
    expect(renderCv(t.id, sampleCv(), { photo: true }).includes('%%PHOTO%%')).toBe(t.supports.photo)
  })

  it('le nom n’est jamais coupé : il est mis à l’échelle sur une ligne', () => {
    for (const t of TEMPLATE_LIBRARY) expect(renderCv(t.id, sampleCv())).toMatch(/\\cvname\{[^\n]*Prénom NOM/)
  })

  it('CV vide : document valide, sans section vide', () => {
    for (const t of TEMPLATE_LIBRARY) {
      const code = renderCv(t.id, emptyCv())
      expect(() => checkSource(code)).not.toThrow()
      expect(code).not.toMatch(/\\cvsection\{/)
    }
  })
})

describe('données hostiles', () => {
  const evil = normalizeCv({
    identity: {
      fullName: 'Awa \\input{/etc/passwd} Konan',
      headline: '}\\immediate\\write18{curl evil}{',
      email: 'awa@exemple.ci}\\input{x}',
      links: [{ label: 'site', url: 'https://ok.example/a%20b#c' }, { label: 'x', url: 'javascript:alert(1)' }],
    },
    summary: '$\\catcode`\\^=7 ^^5cinput{/etc/passwd}$ 100 % & #1 _ ~ ^ < > | 😀 ﷺ',
    experiences: [{ role: '\\csname input\\endcsname', organization: 'A & B', bullets: ['\\begin{filecontents}{x}', '--- tirets ---'] }],
    skills: [{ category: 'Cat]égorie', items: ['C++', 'C#', 'R&D'] }],
  })

  it.each(TEMPLATE_LIBRARY.map(t => [t.name, t]))('%s : accepté par la politique, aucune commande injectée', (_name, t) => {
    const code = renderCv(t.id, evil, { photo: false })
    expect(() => checkSource(code)).not.toThrow()
    expect(code).not.toMatch(/\\input\{|\\write18|\\csname|\\catcode|\^\^|javascript:|\\begin\{filecontents\}/)
  })

  it('échappement : caractères spéciaux, caractères non composables retirés', () => {
    expect(tex('100 % & #1 _ ~ ^ $ { } \\')).toBe('100 \\% \\& \\#1 \\_ \\textasciitilde{} \\textasciicircum{} \\$ \\{ \\} \\textbackslash{}')
    expect(tex('Café — « été » 😀')).toBe('Café — « été »')
    expect(tex('a\n\nb')).toBe('a b')
  })

  it('liens : web ou courriel uniquement, caractères d’hyperref protégés', () => {
    expect(texUrl('javascript:alert(1)')).toBeNull()
    expect(texUrl('file:///etc/passwd')).toBeNull()
    expect(texUrl('https://a.b/c d')).toBeNull()
    expect(texUrl('exemple.com/profil')).toBe('https://exemple.com/profil')
    expect(texUrl('https://a.b/x%20y#z')).toBe('https://a.b/x\\%20y\\#z')
    expect(link('Site & co', 'https://a.b')).toBe('\\href{https://a.b}{Site \\& co}')
  })
})

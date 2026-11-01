// P6 : organisation des sections. Ordre, masquage, titres, sections personnalisées, sauts de page,
// appliqués par les huit modèles ; aucune section perdue ; valeurs validées.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_LIBRARY, renderCv } from '../templates/library'
import { sampleCv } from '../templates/sample'
import { LABELS } from '../templates/common'
import { choiceForTemplate } from './templateSwitch'
import { emptyLayout, move, nextCustomId, orderedSections, sanitizeLayout, visibleSections, type SectionLayout } from './layout'

const layout = (patch: Partial<SectionLayout>): SectionLayout => ({ ...emptyLayout(), ...patch })
/** Titres de section, dans l'ordre où ils apparaissent dans le code */
const titles = (code: string) => [...code.matchAll(/\\(?:cvsection|sidesection)\{([^}]*)\}/g)].map(m => m[1])

describe('organisation relue et bornée', () => {
  it('identifiants inconnus et doublons écartés, textes bornés, saisie conservée pendant la frappe', () => {
    const l = sanitizeLayout({
      order: ['skills', 'skills', 'inconnu', 'x1', '__proto__'], hidden: ['experience', 'x9'],
      titles: { skills: 'Savoir-faire ', bogus: 'x', education: '   ' },
      custom: [{ id: 'x1', title: 'Prix et ', items: ['Lauréat 2024 ', ''] }, { id: 'zz', title: 'pirate', items: [] }],
    })
    expect(l.order).toEqual(['skills', 'x1'])
    expect(l.hidden).toEqual(['experience'])
    expect(l.titles).toEqual({ skills: 'Savoir-faire ' })
    expect(l.custom).toEqual([{ id: 'x1', title: 'Prix et ', items: ['Lauréat 2024 ', ''] }])
  })

  it('caractères de contrôle neutralisés', () => {
    expect(sanitizeLayout({ titles: { skills: 'A\u0000B\u001b' } }).titles.skills).toBe('A B ')
  })

  it('ordre effectif : choix de l’utilisateur, puis sections non citées dans l’ordre du modèle', () => {
    const template = ['summary', 'experience', 'education', 'skills']
    expect(orderedSections(layout({ order: ['skills', 'experience'] }), template)).toEqual(['skills', 'experience', 'summary', 'education'])
    expect(visibleSections(layout({ hidden: ['education'] }), template)).toEqual(['summary', 'experience', 'skills'])
  })

  it('déplacement et identifiants de sections personnalisées', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(move(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(nextCustomId(layout({ custom: [{ id: 'x1', title: 'A', items: [] }] }))).toBe('x2')
  })
})

describe('rendu de l’organisation par les huit modèles', () => {
  const cv = sampleCv('long')

  it.each(TEMPLATE_LIBRARY.filter(t => t.id !== 'software-architect').map(t => [t.name, t.id]))('%s : Compétences avant Expériences', (_n, id) => {
    const t = titles(renderCv(id, cv, { layout: layout({ order: ['skills', 'experience'] }) }))
    const skills = t.findIndex(x => /Compétences/.test(x))
    const experience = t.findIndex(x => /Expérience|Recherche et enseignement/.test(x))
    expect(skills).toBeGreaterThanOrEqual(0)
    expect(skills).toBeLessThan(experience)
  })

  it.each(TEMPLATE_LIBRARY.map(t => [t.name, t.id]))('%s : section masquée absente, renommée, personnalisée, saut de page', (_n, id) => {
    const code = renderCv(id, cv, { twoColumns: false, layout: layout({
      hidden: ['interests'], titles: { languages: 'Langues parlées' },
      custom: [{ id: 'x1', title: 'Bénévolat & associations', items: ['Mentor, association fictive', 'Trésorier, club fictif'] }],
      breakBefore: ['education'],
    }) })
    expect(code).not.toMatch(/Centres d’intérêt/)
    expect(code).toContain('Langues parlées')
    expect(code).toContain('Bénévolat \\& associations')
    expect(code).toContain('\\item Mentor, association fictive')
    expect(code).toMatch(/\\clearpage\n\\cvsection\{(Formation|Education)\}/)
  })

  it('sans organisation : rendu strictement identique à l’ordre du modèle', () => {
    for (const t of TEMPLATE_LIBRARY) expect(renderCv(t.id, cv, { layout: emptyLayout() })).toBe(renderCv(t.id, cv))
  })

  it('l’ordre affiché pour chaque modèle est exactement celui de son PDF', () => {
    const L = LABELS.fr
    const byTitle: Record<string, string> = {
      [L.summary]: 'summary', [L.experience]: 'experience', [L.education]: 'education', [L.skills]: 'skills', [L.projects]: 'projects',
      [L.publications]: 'publications', [L.certifications]: 'certifications', [L.languages]: 'languages', [L.interests]: 'interests',
      [L.keySkills]: 'skills', [L.technical]: 'skills', [L.researchInterests]: 'summary', [L.research]: 'experience',
    }
    for (const t of TEMPLATE_LIBRARY.filter(x => !x.defaults.twoColumns)) {
      const shown = titles(renderCv(t.id, cv)).map(x => byTitle[x] ?? x)
      // Executive : profil mis en valeur sous l'en-tête, hors des sections
      const expected = t.sections.filter(s => !(t.id === 'executive-prestige' && s === 'summary'))
      expect(shown, t.id).toEqual(expected)
    }
  })

  it('deux colonnes : ordre latéral respecté, pas de saut de page dans paracol', () => {
    const code = renderCv('software-architect', cv, { layout: layout({ order: ['languages', 'skills'], breakBefore: ['education'] }) })
    const side = titles(code).filter(x => /Langues|Compétences/.test(x))
    expect(side).toEqual(['Langues', 'Compétences'])
    expect(code).not.toContain('\\clearpage')
  })

  it('Executive : le profil mis en valeur redevient une section si l’ordre est personnalisé', () => {
    const featured = renderCv('executive-prestige', cv)
    expect(titles(featured)).not.toContain('Profil')
    const ordered = renderCv('executive-prestige', cv, { layout: layout({ order: ['experience', 'summary'] }) })
    const t = titles(ordered)
    expect(t.indexOf('Profil')).toBeGreaterThan(t.findIndex(x => /Expérience/.test(x)))
  })

  it('l’organisation suit le CV d’un modèle à l’autre', () => {
    const l = layout({ order: ['skills'], hidden: ['interests'] })
    const next = choiceForTemplate('academic-research', { ...TEMPLATE_LIBRARY[0].defaults, layout: l })
    expect(next?.options.layout).toEqual(l)
  })

  it('titre hostile échappé : aucune commande LaTeX injectée', () => {
    const code = renderCv('silicon-valley', cv, { layout: layout({ titles: { skills: '\\input{/etc/passwd}' }, custom: [{ id: 'x1', title: '}\\write18{x}', items: ['\\def\\a{b}'] }] }) })
    expect(code).not.toMatch(/\\input\{|\\write18|\\def\\a/)
  })
})

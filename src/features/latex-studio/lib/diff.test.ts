// P7 et P8 : comparaisons avant / après (code, données), chiffres non justifiés, points à vérifier d'un import.
import { describe, it, expect } from 'vitest'
import { cvChanges, diffStats, lineDiff, numbersIn, unsupportedNumbers } from './diff'
import { importWarnings } from './importCv'
import { emptyCv, normalizeCv } from './cvData'

const CV = normalizeCv({
  identity: { fullName: 'Awa Konan', headline: 'Data Analyst', email: 'awa@exemple.ci', phone: '', location: 'Abidjan', links: [] },
  summary: 'Analyste de données en santé publique.',
  experiences: [{ role: 'Data Analyst', organization: 'Institut fictif', location: '', start: '2023', end: 'aujourd’hui', bullets: ['Tableaux de bord pour 12 districts'] }],
  education: [{ degree: 'Master Big Data', institution: 'Université fictive', location: '', start: '', end: '2022', details: '' }],
  skills: [{ category: 'Données', items: ['Python', 'SQL'] }],
})

describe('différences de code', () => {
  it('lignes ajoutées, retirées et inchangées, dans l’ordre', () => {
    const ops = lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne')
    expect(ops).toEqual([
      { type: 'same', text: 'a' }, { type: 'del', text: 'b' }, { type: 'add', text: 'B' },
      { type: 'same', text: 'c' }, { type: 'same', text: 'd' }, { type: 'add', text: 'e' },
    ])
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 })
    expect(diffStats(lineDiff('x', 'x'))).toEqual({ added: 0, removed: 0 })
  })
})

describe('différences de données', () => {
  it('champs modifiés seulement, avec section, avant et après', () => {
    const after = normalizeCv({ ...CV, summary: 'Analyste orientée aide à la décision.', experiences: [{ ...CV.experiences[0], bullets: ['Tableaux de bord'] }] })
    const changes = cvChanges(CV, after)
    expect(changes.map(c => `${c.section} — ${c.label}`)).toEqual(['Profil — Profil', 'Expériences — Data Analyst'])
    expect(changes[0]).toMatchObject({ before: 'Analyste de données en santé publique.', after: 'Analyste orientée aide à la décision.' })
    expect(cvChanges(CV, CV)).toEqual([])
  })

  it('élément ajouté ou retiré', () => {
    const changes = cvChanges(CV, normalizeCv({ ...CV, education: [], certifications: [{ name: 'PMP', issuer: 'PMI', date: '2024' }] }))
    expect(changes.map(c => [c.section, c.before ? 'avant' : '', c.after ? 'après' : ''])).toEqual([['Formation', 'avant', ''], ['Certifications', '', 'après']])
  })
})

describe('chiffres non justifiés d’un code généré', () => {
  it('normalisation : espaces de milliers, virgule décimale, zéros initiaux', () => {
    expect(numbersIn('4 800 ménages, 3,5 ans, 007')).toEqual(['4800', '3.5', '7'])
  })

  it('chiffres affichés absents des informations fournies ; commandes LaTeX ignorées', () => {
    const generated = '\\documentclass[11pt]{article}\n\\begin{document}\n\\vspace{12pt}\nAwa Konan, 12 districts, 35~\\% de gains en 2019.\n\\end{document}'
    expect(unsupportedNumbers(generated, ['Awa Konan, tableaux de bord pour 12 districts'])).toEqual(['35', '2019'])
    expect(unsupportedNumbers(generated, ['12 districts, 35 %, 2019'])).toEqual([])
  })
})

describe('points à vérifier d’un import', () => {
  it('nom, coordonnées, dates, sections manquantes', () => {
    expect(importWarnings(CV)).toEqual([])
    const partial = normalizeCv({ ...CV, identity: { ...CV.identity, email: '' }, experiences: [{ role: 'Stagiaire', organization: 'X', start: '', end: '', bullets: [] }], education: [] })
    expect(importWarnings(partial)).toEqual(['Aucune coordonnée (e-mail ou téléphone) trouvée.', '1 expérience(s) sans date.', 'Aucune formation trouvée.'])
    expect(importWarnings(emptyCv())).toContain('Nom non trouvé.')
  })
})

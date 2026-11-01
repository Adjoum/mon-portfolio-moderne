// P2 : changement de modèle. Contrat de données commun, rendu déterministe, aucune donnée perdue,
// confirmation avant d'écraser un code modifié, retour au modèle précédent.
import { describe, it, expect } from 'vitest'
import { TEMPLATE_LIBRARY } from '../templates/library'
import { normalizeCv, type CvData } from './cvData'
import { choiceForTemplate, initialGenerated, MAX_TEMPLATE_STEPS, planSwitch, pushStep, renderChoice, type TemplateStep } from './templateSwitch'

/** Chaque champ porte un repère unique : il doit se retrouver dans le code de CHAQUE modèle */
const FULL: CvData = normalizeCv({
  identity: { fullName: 'Repere Nom', headline: 'Repere Titre', email: 'repere@exemple.org', phone: '0102030405', location: 'Repere Ville', links: [{ label: 'Repere Lien', url: 'https://repere.example.org' }] },
  summary: 'Repere Profil',
  experiences: [{ role: 'Repere Poste', organization: 'Repere Employeur', location: 'Repere Lieu', start: '2021', end: '2024', bullets: ['Repere Realisation A', 'Repere Realisation B'] }],
  education: [{ degree: 'Repere Diplome', institution: 'Repere Ecole', location: '', start: '2018', end: '2020', details: 'Repere Mention' }],
  skills: [{ category: 'Repere Categorie', items: ['Repere Competence'] }],
  projects: [{ name: 'Repere Projet', description: 'Repere Description', link: '', technologies: ['Repere Techno'] }],
  languages: [{ name: 'Repere Langue', level: 'Repere Niveau' }],
  certifications: [{ name: 'Repere Certification', issuer: 'Repere Organisme', date: '2023' }],
  publications: [{ title: 'Repere Publication', venue: 'Repere Revue', year: '2022', authors: 'Repere Auteurs' }],
  interests: ['Repere Interet'],
})
const MARKERS = JSON.stringify(FULL).match(/Repere [A-Za-z]+/g)!

describe('contrat de données commun des modèles', () => {
  it.each(TEMPLATE_LIBRARY.map(t => [t.name, t.id]))('%s : toutes les données présentes, rendu déterministe', (_name, id) => {
    const template = TEMPLATE_LIBRARY.find(t => t.id === id)!
    const choice = { id, options: template.defaults }
    const code = renderChoice(choice, FULL)
    for (const marker of MARKERS) expect(code, marker).toContain(marker)
    expect(renderChoice(choice, FULL)).toBe(code)
    expect(code).toMatch(/^\\documentclass/)
    expect(code.trimEnd()).toMatch(/\\end\{document\}$/)
  })

  it('passer d’un modèle à l’autre puis revenir redonne exactement le même code', () => {
    const [a, b] = TEMPLATE_LIBRARY
    const first = renderChoice({ id: a.id, options: a.defaults }, FULL)
    renderChoice({ id: b.id, options: b.defaults }, FULL)
    expect(renderChoice({ id: a.id, options: a.defaults }, FULL)).toBe(first)
  })

  it('aucune donnée saisie : l’exemple explicite est utilisé', () => {
    const code = renderChoice({ id: TEMPLATE_LIBRARY[0].id, options: TEMPLATE_LIBRARY[0].defaults }, normalizeCv({}))
    expect(code).toContain('Prénom NOM')
  })

  it('choix d’un modèle : réglages du modèle, langue conservée, photo seulement si le modèle la prend en charge', () => {
    const ats = TEMPLATE_LIBRARY.find(t => !t.supports.photo)!
    const withPhoto = TEMPLATE_LIBRARY.find(t => t.supports.photo)!
    const previous = { ...withPhoto.defaults, lang: 'en' as const, photo: true }
    expect(choiceForTemplate(ats.id, previous)).toMatchObject({ id: ats.id, options: { lang: 'en', photo: false, font: ats.defaults.font } })
    expect(choiceForTemplate(withPhoto.id, previous)?.options.photo).toBe(true)
    expect(choiceForTemplate('inconnu', previous)).toBeNull()
  })
})

describe('plan de changement de modèle', () => {
  it('code généré par le studio : remplacé sans question', () => {
    expect(planSwitch('A', 'A', 'B')).toEqual({ kind: 'apply', code: 'B' })
  })

  it('code modifié à la main : confirmation demandée', () => {
    expect(planSwitch('A modifié', 'A', 'B')).toEqual({ kind: 'confirm', code: 'B', reason: 'manual' })
  })

  it('code d’une autre origine (IA, import, restauration) : confirmation demandée', () => {
    expect(planSwitch('code IA', null, 'B')).toEqual({ kind: 'confirm', code: 'B', reason: 'foreign' })
  })

  it('aucun changement : rien à confirmer', () => {
    expect(planSwitch('B', null, 'B').kind).toBe('apply')
  })

  it('session antérieure : un brouillon identique au rendu est reconnu comme généré', () => {
    const choice = { id: TEMPLATE_LIBRARY[1].id, options: TEMPLATE_LIBRARY[1].defaults }
    const code = renderChoice(choice, FULL)
    expect(initialGenerated(null, code, choice, FULL)).toBe(code)
    expect(initialGenerated(null, `${code}% retouche`, choice, FULL)).toBeNull()
    expect(initialGenerated('mémorisé', code, choice, FULL)).toBe('mémorisé')
  })

  it('historique des modèles borné', () => {
    let steps: TemplateStep[] = []
    for (let i = 0; i < MAX_TEMPLATE_STEPS + 5; i++) steps = pushStep(steps, { choice: { id: `t${i}`, options: TEMPLATE_LIBRARY[0].defaults }, code: `${i}`, generated: `${i}` })
    expect(steps).toHaveLength(MAX_TEMPLATE_STEPS)
    expect(steps.at(-1)?.choice.id).toBe(`t${MAX_TEMPLATE_STEPS + 4}`)
  })
})

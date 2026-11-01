// P8 : édition visuelle (passage cliqué → champ des données), lisibilité ATS sans note, analyse d'une offre.
import { describe, it, expect } from 'vitest'
import { fieldAt, fieldsOf, setField } from './visualEdit'
import { atsChecks, offerTerms, unusualTitles } from './ats'
import { normalizeCv } from './cvData'
import { renderCv } from '../templates/library'

const CV = normalizeCv({
  identity: { fullName: 'Awa Konan', headline: 'Data Analyst', email: 'awa.konan@exemple.ci', phone: '+225 07 00 00 00 01', location: 'Abidjan', links: [] },
  summary: 'Analyste de données en santé publique.',
  experiences: [{ role: 'Data Analyst', organization: 'Institut fictif de santé', location: 'Abidjan', start: '2023', end: 'aujourd’hui', bullets: ['Tableaux de bord Power BI pour 12 districts sanitaires'] }],
  education: [{ degree: 'Master Big Data', institution: 'Université fictive', location: '', start: '', end: '2022', details: '' }],
  skills: [{ category: 'Données', items: ['Python', 'SQL', 'Power BI'] }],
})
const code = renderCv('silicon-valley', CV).split('\n')
const lineWith = (re: RegExp) => code.find(l => re.test(l))!

describe('édition visuelle : passage cliqué → champ des données', () => {
  it('texte répété : le titre sous le nom et le poste d’une expérience sont distingués par leur ligne', () => {
    expect(fieldAt(CV, 'Data Analyst', 0.5, lineWith(/\\cvheadline/))?.path).toEqual(['identity', 'headline'])
    expect(fieldAt(CV, 'Data Analyst', 0.5, lineWith(/\\textbf\{Data Analyst\}/))?.path).toEqual(['experiences', 0, 'role'])
  })

  it('puce coupée sur deux lignes du PDF : la puce entière', () => {
    const f = fieldAt(CV, 'Tableaux de bord Power BI pour 12', 0.3, lineWith(/\\item Tableaux/))
    expect(f).toMatchObject({ path: ['experiences', 0, 'bullets', 0], label: 'Expérience 1 — Réalisation 1', multiline: true })
  })

  it('zone partagée (coordonnées) : le champ situé sous le clic', () => {
    const contacts = lineWith(/cvdetailfont/)
    const shown = 'Abidjan | awa.konan@exemple.ci | +225 07 00 00 00 01'
    expect(fieldAt(CV, shown, 0.05, contacts)?.path).toEqual(['identity', 'location'])
    expect(fieldAt(CV, shown, 0.45, contacts)?.path).toEqual(['identity', 'email'])
    expect(fieldAt(CV, shown, 0.95, contacts)?.path).toEqual(['identity', 'phone'])
  })

  it('texte du modèle sans champ (titre de section) : aucun champ', () => {
    expect(fieldAt(CV, 'FORMATION', 0.5, lineWith(/\\cvsection\{Formation\}/))).toBeNull()
  })

  it('modification : seul le champ visé change', () => {
    const next = setField(CV, ['experiences', 0, 'bullets', 0], 'Tableaux de bord pour 12 districts')
    expect(next.experiences[0].bullets).toEqual(['Tableaux de bord pour 12 districts'])
    expect(next.identity).toEqual(CV.identity)
    expect(CV.experiences[0].bullets[0]).toMatch(/Power BI/)
    expect(fieldsOf(CV).every(f => f.value.trim())).toBe(true)
  })
})

describe('lisibilité ATS : contrôles expliqués, sans note', () => {
  const long = 'Awa Konan Data Analyst awa.konan@exemple.ci +225 07 00 00 00 01 Expérience professionnelle Formation Compétences '.repeat(3)

  it('document lisible, coordonnées, une colonne, dates, longueur', () => {
    const checks = atsChecks({ text: long, pageCount: 1, cv: CV, twoColumns: false, photo: false, customTitles: [] })
    expect(checks.map(c => `${c.id}:${c.status}`)).toEqual(['text:ok', 'contact:ok', 'titles:ok', 'columns:ok', 'dates:ok', 'length:ok'])
    expect(JSON.stringify(checks)).not.toMatch(/score|\d+ ?%|\/100/i)
  })

  it('points d’attention : deux colonnes, photo, titres personnalisés, coordonnées et dates manquantes', () => {
    const cv = normalizeCv({ ...CV, identity: { ...CV.identity, phone: '' }, experiences: [{ ...CV.experiences[0], start: '', end: '' }] })
    const checks = atsChecks({ text: long.replace(/\+225[\d ]+/g, ''), pageCount: 1, cv, twoColumns: true, photo: true, customTitles: ['Mon parcours'] })
    expect(checks.filter(c => c.status !== 'ok').map(c => c.id)).toEqual(['contact', 'titles', 'columns', 'photo', 'dates'])
  })

  it('titres usuels reconnus, titres personnalisés relevés', () => {
    expect(unusualTitles({ skills: 'Compétences clés', experience: 'Expériences professionnelles', x1: 'Mon parcours', languages: 'Languages' })).toEqual(['Mon parcours'])
  })
})

describe('analyse d’une offre : termes présents ou absents, rien n’est ajouté', () => {
  const offer = `Nous recherchons un Data Analyst pour notre équipe santé.
Missions : construire des tableaux de bord Power BI, automatiser les rapports avec Python et SQL.
Atouts : Tableau, Azure, connaissance du DHIS2. Une expérience en santé publique est appréciée. Python avancé.`

  it('outils, sigles et noms propres relevés ; présence vérifiée dans le CV', () => {
    const terms = offerTerms(offer, CV)
    const byName = Object.fromEntries(terms.map(t => [t.term, t.present]))
    expect(byName['Power BI']).toBe(true)
    expect(byName['Python']).toBe(true)
    expect(byName['SQL']).toBe(true)
    expect(byName['Azure']).toBe(false)
    expect(byName['DHIS2']).toBe(false)
    expect(terms.find(t => t.term === 'Python')?.count).toBe(2)
    expect(terms.some(t => /^(nous|pour|avec|missions)$/i.test(t.term))).toBe(false)
  })
})

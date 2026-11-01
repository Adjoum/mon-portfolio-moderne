// Édition visuelle simplifiée (P8) : un passage cliqué dans le PDF est rattaché au champ des données
// qui le produit (poste, puce, diplôme, compétence…), modifiable dans un petit formulaire, sans LaTeX.
// Rattachement : texte de la zone cliquée, puis contexte de la ligne du code (un poste et ses dates
// appartiennent à la même expérience, ce qui le distingue d'un titre professionnel identique).
import type { CvData } from './cvData'
import { latexToText, norm } from './sync'

export type FieldPath = (string | number)[]
export interface CvField { path: FieldPath; label: string; value: string; multiline: boolean; entity: string }

/** Champs textuels du CV, avec un libellé lisible */
export function fieldsOf(cv: CvData): CvField[] {
  const out: CvField[] = []
  const add = (path: FieldPath, label: string, value: string, entity: string, multiline = false) => { if (value.trim()) out.push({ path, label, value, multiline, entity }) }
  const id = cv.identity
  add(['identity', 'fullName'], 'Nom', id.fullName, 'identity')
  add(['identity', 'headline'], 'Titre professionnel', id.headline, 'identity')
  add(['identity', 'email'], 'E-mail', id.email, 'identity')
  add(['identity', 'phone'], 'Téléphone', id.phone, 'identity')
  add(['identity', 'location'], 'Localisation', id.location, 'identity')
  id.links.forEach((l, i) => add(['identity', 'links', i, 'label'], `Lien ${i + 1} — libellé`, l.label, 'identity'))
  add(['summary'], 'Profil', cv.summary, 'summary', true)
  cv.experiences.forEach((e, i) => {
    const name = `Expérience ${i + 1}`
    const entity = `experience:${i}`
    add(['experiences', i, 'role'], `${name} — Poste`, e.role, entity)
    add(['experiences', i, 'organization'], `${name} — Organisation`, e.organization, entity)
    add(['experiences', i, 'location'], `${name} — Lieu`, e.location, entity)
    add(['experiences', i, 'start'], `${name} — Début`, e.start, entity)
    add(['experiences', i, 'end'], `${name} — Fin`, e.end, entity)
    e.bullets.forEach((b, k) => add(['experiences', i, 'bullets', k], `${name} — Réalisation ${k + 1}`, b, entity, true))
  })
  cv.education.forEach((d, i) => {
    const name = `Formation ${i + 1}`
    const entity = `education:${i}`
    add(['education', i, 'degree'], `${name} — Diplôme`, d.degree, entity)
    add(['education', i, 'institution'], `${name} — Établissement`, d.institution, entity)
    add(['education', i, 'location'], `${name} — Lieu`, d.location, entity)
    add(['education', i, 'start'], `${name} — Début`, d.start, entity)
    add(['education', i, 'end'], `${name} — Fin`, d.end, entity)
    add(['education', i, 'details'], `${name} — Détails`, d.details, entity, true)
  })
  cv.skills.forEach((s, i) => {
    add(['skills', i, 'category'], `Compétences ${i + 1} — Catégorie`, s.category, `skills:${i}`)
    s.items.forEach((item, k) => add(['skills', i, 'items', k], `Compétences ${i + 1} — ${item}`, item, `skills:${i}`))
  })
  cv.projects.forEach((p, i) => {
    add(['projects', i, 'name'], `Projet ${i + 1} — Nom`, p.name, `project:${i}`)
    add(['projects', i, 'description'], `Projet ${i + 1} — Description`, p.description, `project:${i}`, true)
  })
  cv.languages.forEach((l, i) => {
    add(['languages', i, 'name'], `Langue ${i + 1}`, l.name, `language:${i}`)
    add(['languages', i, 'level'], `Langue ${i + 1} — Niveau`, l.level, `language:${i}`)
  })
  cv.certifications.forEach((c, i) => {
    add(['certifications', i, 'name'], `Certification ${i + 1}`, c.name, `certification:${i}`)
    add(['certifications', i, 'issuer'], `Certification ${i + 1} — Organisme`, c.issuer, `certification:${i}`)
    add(['certifications', i, 'date'], `Certification ${i + 1} — Date`, c.date, `certification:${i}`)
  })
  cv.publications.forEach((p, i) => {
    add(['publications', i, 'title'], `Publication ${i + 1} — Titre`, p.title, `publication:${i}`)
    add(['publications', i, 'venue'], `Publication ${i + 1} — Revue`, p.venue, `publication:${i}`)
    add(['publications', i, 'authors'], `Publication ${i + 1} — Auteurs`, p.authors, `publication:${i}`)
  })
  cv.interests.forEach((x, i) => add(['interests', i], `Centre d’intérêt ${i + 1}`, x, 'interests'))
  return out
}

/**
 * Champ produisant le texte cliqué. `clicked` : texte de la zone (ou de la portion) cliquée ;
 * `fraction` : position du clic dans cette zone (0 à 1) ; `codeLine` : ligne du code qui l'a produite.
 */
export function fieldAt(cv: CvData, clicked: string, fraction: number, codeLine: string): CvField | null {
  const seg = norm(clicked)
  const line = norm(latexToText(codeLine))
  if (seg.length < 2) return null
  const fields = fieldsOf(cv).map(f => ({ ...f, ns: norm(f.value) })).filter(f => f.ns.length >= 2)
  // Champs présents dans la zone cliquée (ou la contenant), produits par cette ligne du code
  const candidates = fields.filter(f => (f.ns.includes(seg) || seg.includes(f.ns)) && (!line || line.includes(f.ns) || f.ns.includes(line) || f.ns.includes(seg)))
  if (!candidates.length) return null
  // Contexte : part de la ligne du code expliquée par les champs de la même entité (poste + dates d'une expérience)
  const coverage = (entity: string) => fields.filter(f => f.entity === entity && line.includes(f.ns)).reduce((n, f) => n + f.ns.length, 0)
  // Zone partagée par plusieurs champs (coordonnées) : le champ situé sous le clic
  const at = Math.max(0, Math.min(1, fraction)) * seg.length
  const distance = (f: { ns: string }) => {
    const i = seg.indexOf(f.ns)
    if (i < 0) return 0
    return at < i ? i - at : at > i + f.ns.length ? at - i - f.ns.length : 0
  }
  return candidates.sort((a, b) => distance(a) - distance(b) || coverage(b.entity) - coverage(a.entity) || a.ns.length - b.ns.length)[0]
}

/** CV avec un champ remplacé (copie ; le reste est inchangé) */
export function setField(cv: CvData, path: FieldPath, value: string): CvData {
  const copy: CvData = JSON.parse(JSON.stringify(cv))
  let node: Record<string | number, unknown> = copy as unknown as Record<string, unknown>
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>
  node[path[path.length - 1]] = value
  return copy
}

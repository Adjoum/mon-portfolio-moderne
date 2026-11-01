// Comparaisons avant / après (P7, P8) : lignes du code, champs des données, chiffres non justifiés.
// Tout est calculé dans le navigateur ; rien n'est envoyé.
import type { CvData } from './cvData'
import { codeTexts } from './sync'

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

/** Différence ligne à ligne (plus longue sous-suite commune) ; au-delà de 1 500 lignes, remplacement global */
export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > 2_250_000) return [...a.map(text => ({ type: 'del' as const, text })), ...b.map(text => ({ type: 'add' as const, text }))]
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ type: 'del', text: a[i++] })
    else ops.push({ type: 'add', text: b[j++] })
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

export const diffStats = (ops: DiffOp[]) => ({ added: ops.filter(o => o.type === 'add').length, removed: ops.filter(o => o.type === 'del').length })

export interface FieldChange { section: string; label: string; before: string; after: string }

const join = (items: string[]) => items.map(s => s.trim()).filter(Boolean).join('\n')
const period = (start: string, end: string) => [start, end].filter(Boolean).join(' – ')

/** Champs du CV qui diffèrent entre deux versions, dans l'ordre du CV */
export function cvChanges(before: CvData, after: CvData): FieldChange[] {
  const out: FieldChange[] = []
  const push = (section: string, label: string, a: string, b: string) => { if (a.trim() !== b.trim()) out.push({ section, label, before: a, after: b }) }
  const id = (x: CvData) => x.identity
  push('Identité', 'Nom', id(before).fullName, id(after).fullName)
  push('Identité', 'Titre professionnel', id(before).headline, id(after).headline)
  push('Identité', 'E-mail', id(before).email, id(after).email)
  push('Identité', 'Téléphone', id(before).phone, id(after).phone)
  push('Identité', 'Localisation', id(before).location, id(after).location)
  push('Identité', 'Liens', join(id(before).links.map(l => `${l.label} ${l.url}`)), join(id(after).links.map(l => `${l.label} ${l.url}`)))
  push('Profil', 'Profil', before.summary, after.summary)
  const entries = <T,>(section: string, a: T[], b: T[], name: (x: T) => string, text: (x: T) => string) => {
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const x = a[k]
      const y = b[k]
      push(section, (y ?? x) ? name((y ?? x) as T) : section, x ? text(x) : '', y ? text(y) : '')
    }
  }
  entries('Expériences', before.experiences, after.experiences, e => e.role || e.organization || 'Expérience',
    e => [`${e.role} — ${e.organization}${e.location ? `, ${e.location}` : ''} (${period(e.start, e.end)})`, ...e.bullets.filter(Boolean).map(b => `• ${b}`)].join('\n'))
  entries('Formation', before.education, after.education, d => d.degree || d.institution || 'Formation',
    d => [`${d.degree} — ${d.institution}${d.location ? `, ${d.location}` : ''} (${period(d.start, d.end)})`, d.details].filter(Boolean).join('\n'))
  entries('Compétences', before.skills, after.skills, s => s.category || 'Compétences', s => s.items.filter(Boolean).join(', '))
  entries('Projets', before.projects, after.projects, p => p.name || 'Projet', p => [p.name, p.description, p.technologies.filter(Boolean).join(', '), p.link].filter(Boolean).join('\n'))
  push('Langues', 'Langues', join(before.languages.map(l => `${l.name} ${l.level}`)), join(after.languages.map(l => `${l.name} ${l.level}`)))
  entries('Certifications', before.certifications, after.certifications, c => c.name || 'Certification', c => [c.name, c.issuer, c.date].filter(Boolean).join(' — '))
  entries('Publications', before.publications, after.publications, p => p.title || 'Publication', p => [p.title, p.venue, p.year, p.authors].filter(Boolean).join(' — '))
  push('Centres d’intérêt', 'Centres d’intérêt', join(before.interests), join(after.interests))
  return out
}

/** Nombres d'un texte, normalisés comme côté serveur (« 4 800 » = « 4800 », « 3,5 » = « 3.5 ») */
export function numbersIn(text: string): string[] {
  return [...text.replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)]
    .map(m => m[0].replace(',', '.').replace(/^0+(?=\d)/, ''))
}

/** Chiffres affichés par un code généré qui ne figurent dans aucune des informations fournies */
export function unsupportedNumbers(generated: string, sources: string[]): string[] {
  const known = new Set(sources.flatMap(s => numbersIn(s)))
  const shown = codeTexts(generated).flatMap(c => numbersIn(c.text))
  return [...new Set(shown.filter(n => !known.has(n)))]
}

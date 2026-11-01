// Lisibilité par les logiciels de recrutement (ATS) et analyse d'une offre d'emploi (P8).
// Contrôles locaux et déterministes, expliqués un par un, SANS note ni pourcentage : aucun éditeur
// d'ATS ne publie ses règles, un « score » serait trompeur. Rien n'est envoyé.
import type { CvData } from './cvData'
import { norm } from './sync'

export type AtsStatus = 'ok' | 'warn' | 'info'
export interface AtsCheck { id: string; status: AtsStatus; title: string; detail: string }

const STANDARD_TITLES = /^(profil|resume|summary|experiences?( professionnelles?)?|experience|formations?|education|competences?( cles| techniques)?|skills|core competencies|technical skills|projets?|projects|langues|languages|certifications?|publications?|centres? d.?interets?|interests|recherche et enseignement|research( and teaching)?|themes de recherche|research interests)$/

export function atsChecks({ text, pageCount, cv, twoColumns, photo, customTitles }: {
  /** Texte lu dans le PDF, et nombre de pages */
  text: string
  pageCount: number
  cv: CvData
  twoColumns: boolean
  photo: boolean
  /** Titres de section renommés par l'utilisateur */
  customTitles: string[]
}): AtsCheck[] {
  const plain = norm(text)
  const checks: AtsCheck[] = []
  const name = norm(cv.identity.fullName)
  checks.push(plain.length > 200 && (!name || plain.includes(name))
    ? { id: 'text', status: 'ok', title: 'Texte lisible par un logiciel', detail: 'Le texte du PDF est sélectionnable (pas une image) : il peut être extrait.' }
    : { id: 'text', status: 'warn', title: 'Texte difficile à extraire', detail: 'Le PDF contient peu de texte sélectionnable, ou le nom n’y figure pas d’un seul tenant.' })
  const email = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)
  const phone = /(\+?\d[\d\s.-]{7,}\d)/.test(text)
  checks.push(email && phone
    ? { id: 'contact', status: 'ok', title: 'Coordonnées présentes', detail: 'E-mail et téléphone figurent en texte dans le document.' }
    : { id: 'contact', status: 'warn', title: 'Coordonnées incomplètes', detail: `${email ? '' : 'Aucun e-mail. '}${phone ? '' : 'Aucun téléphone. '}Un recruteur ne pourra pas vous joindre facilement.` })
  checks.push(customTitles.length
    ? { id: 'titles', status: 'info', title: 'Titres de section personnalisés', detail: `${customTitles.map(t => `« ${t} »`).join(', ')} : un logiciel reconnaît mieux les titres usuels (Expérience, Formation, Compétences).` }
    : { id: 'titles', status: 'ok', title: 'Titres de section usuels', detail: 'Les sections portent des titres que les logiciels reconnaissent.' })
  checks.push(twoColumns
    ? { id: 'columns', status: 'warn', title: 'Mise en page sur deux colonnes', detail: 'Certains logiciels lisent les colonnes dans le désordre. Pour une candidature en ligne, préférez une colonne (réglage « Deux colonnes » ou modèle Minimal ATS Pro).' }
    : { id: 'columns', status: 'ok', title: 'Une seule colonne', detail: 'L’ordre de lecture est celui du document.' })
  if (photo) checks.push({ id: 'photo', status: 'info', title: 'Photo', detail: 'La photo est ignorée par les logiciels ; elle est déconseillée dans certains pays (États-Unis, Royaume-Uni, Canada).' })
  const undated = cv.experiences.filter(e => !e.start.trim() && !e.end.trim()).length
  checks.push(undated
    ? { id: 'dates', status: 'warn', title: 'Expériences sans date', detail: `${undated} expérience(s) sans date : les logiciels calculent souvent l’expérience à partir des dates.` }
    : { id: 'dates', status: 'ok', title: 'Expériences datées', detail: 'Chaque expérience a une période.' })
  checks.push(pageCount <= 2
    ? { id: 'length', status: 'ok', title: `${pageCount} page${pageCount > 1 ? 's' : ''}`, detail: 'Longueur habituelle.' }
    : { id: 'length', status: 'info', title: `${pageCount} pages`, detail: 'Au-delà de deux pages, réservez ce format aux CV académiques.' })
  return checks
}

/** Titres renommés (organisation des sections) qui ne sont pas des titres usuels */
export function unusualTitles(titles: Record<string, string>): string[] {
  const plain = (t: string) => t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  return Object.values(titles).map(t => t.trim()).filter(t => t && !STANDARD_TITLES.test(plain(t)))
}

const STOPWORDS = new Set(`a au aux avec ce ces cet cette dans de des du elle en et etre il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y d l s n c j m t qu est sont sera seront ont avez avoir fait faire plus tres bien ainsi afin selon sous entre vers chez sans tout tous toute toutes autre autres dont comme leurs nombreux nombreuses notamment egalement poste profil mission missions votre vos nous rejoindre recherchons recherche candidat candidate h f hf cdi cdd stage the and or of to in for with on at by an is are be as we you our your from this that will have has job role team work experience years year ans an annee annees`.split(/\s+/))

export interface OfferTerm { term: string; count: number; present: boolean }

/** Termes marquants d'une offre (noms propres, sigles, outils, mots répétés), présents ou non dans le CV */
export function offerTerms(offer: string, cv: CvData, max = 24): OfferTerm[] {
  const cvText = ` ${JSON.stringify(cv).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ')} `
  const terms = new Map<string, { term: string; count: number; first: number; strong: boolean }>()
  const add = (term: string, index: number, strong: boolean) => {
    const key = term.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    if (key.length < 2 || STOPWORDS.has(key) || /^\d+$/.test(key)) return
    const t = terms.get(key)
    if (t) { t.count++; t.strong ||= strong } else terms.set(key, { term, count: 1, first: index, strong })
  }
  const words = [...offer.matchAll(/[\p{L}\p{N}][\p{L}\p{N}+#.'’-]*[\p{L}\p{N}+#]|[\p{L}]/gu)]
  words.forEach((m, k) => {
    const w = m[0].replace(/[’']/g, '\'').replace(/^[ldjmnst]'/i, '')
    const prev = offer.slice(0, m.index).trimEnd()
    // Après « : » ou une virgule, une majuscule désigne un outil ou un nom propre (« Atouts : Azure, DHIS2 »)
    const sentenceStart = prev === '' || /[.!?•\n-]$/.test(prev)
    const tool = /[A-Z].*[A-Z]|\d|[+#.]/.test(w) && w.length >= 2
    const proper = /^\p{Lu}/u.test(w) && !sentenceStart
    add(w, k, tool || proper)
    // Expressions de deux mots à majuscules (« Power BI », « Machine Learning »)
    const next = words[k + 1]
    if (next && /^\p{Lu}/u.test(w) && /^\p{Lu}/u.test(next[0]) && offer.slice(m.index! + m[0].length, next.index).trim() === '') add(`${w} ${next[0]}`, k, true)
  })
  // Mot qui n'apparaît qu'au sein d'une expression relevée (« Power » dans « Power BI ») : écarté
  for (const [key, t] of terms) {
    if (!key.includes(' ')) continue
    for (const part of key.split(' ')) if ((terms.get(part)?.count ?? Infinity) <= t.count) terms.delete(part)
  }
  return [...terms.entries()]
    .filter(([, t]) => t.strong || t.count >= 2)
    .sort((a, b) => Number(b[1].strong) - Number(a[1].strong) || b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, max)
    .map(([key, t]) => ({ term: t.term, count: t.count, present: cvText.includes(` ${key.replace(/[^a-z0-9+#.]+/g, ' ').trim()} `) }))
}

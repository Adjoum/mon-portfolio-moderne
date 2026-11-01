// src/features/latex-studio/lib/layout.ts
// Organisation des sections du CV (P6) : ordre, sections masquées, titres renommés, sections
// personnalisées et sauts de page. Elle fait partie du document (options du modèle) : elle suit le
// CV d'un modèle à l'autre, passe par l'annulation, et chaque modèle l'applique à son rendu.
// Les valeurs sont bornées et validées : rien de ce qui vient de la session n'entre tel quel.

export const STANDARD_SECTIONS = ['summary', 'experience', 'education', 'skills', 'projects', 'publications', 'certifications', 'languages', 'interests'] as const
export type StandardSection = (typeof STANDARD_SECTIONS)[number]

export const SECTION_NAMES: Record<StandardSection, string> = {
  summary: 'Profil', experience: 'Expériences professionnelles', education: 'Formation', skills: 'Compétences',
  projects: 'Projets', publications: 'Publications', certifications: 'Certifications', languages: 'Langues', interests: 'Centres d’intérêt',
}

export interface CustomSection {
  /** « x1 », « x2 »… */
  id: string
  title: string
  /** Une ligne par élément ; une seule ligne = paragraphe, plusieurs = liste à puces */
  items: string[]
}

export interface SectionLayout {
  /** Ordre choisi : sections standard et personnalisées */
  order: string[]
  hidden: string[]
  titles: Record<string, string>
  custom: CustomSection[]
  /** Sections qui commencent une nouvelle page */
  breakBefore: string[]
}

export const MAX_CUSTOM_SECTIONS = 6
export const MAX_CUSTOM_ITEMS = 12
const MAX_TITLE = 60
const MAX_ITEM = 400

const isStandard = (id: string): id is StandardSection => (STANDARD_SECTIONS as readonly string[]).includes(id)
const isCustomId = (id: unknown): id is string => typeof id === 'string' && /^x[1-9][0-9]?$/.test(id)
/** Saisie conservée telle quelle pendant la frappe (espaces compris) ; nettoyée au rendu */
const text = (v: unknown, max: number) => (typeof v === 'string'
  ? [...v].map(ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').slice(0, max)
  : '')

export function emptyLayout(): SectionLayout {
  return { order: [], hidden: [], titles: {}, custom: [], breakBefore: [] }
}

/** Organisation relue (session, interface) : identifiants connus, textes bornés, sans doublon */
export function sanitizeLayout(raw: unknown): SectionLayout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const custom = (Array.isArray(o.custom) ? o.custom : []).slice(0, MAX_CUSTOM_SECTIONS).flatMap((c): CustomSection[] => {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    if (!isCustomId(x.id)) return []
    const items = (Array.isArray(x.items) ? x.items : []).slice(0, MAX_CUSTOM_ITEMS).map(i => text(i, MAX_ITEM))
    return [{ id: x.id, title: text(x.title, MAX_TITLE).trim() ? text(x.title, MAX_TITLE) : 'Section', items }]
  }).filter((c, i, all) => all.findIndex(d => d.id === c.id) === i)
  const known = (id: unknown): id is string => typeof id === 'string' && (isStandard(id) || custom.some(c => c.id === id))
  const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter(known))]
  const titles: Record<string, string> = {}
  if (o.titles && typeof o.titles === 'object') {
    for (const [id, title] of Object.entries(o.titles as Record<string, unknown>)) {
      const value = text(title, MAX_TITLE)
      if (known(id) && isStandard(id) && value.trim()) titles[id] = value
    }
  }
  return { order: ids(o.order), hidden: ids(o.hidden), titles, custom, breakBefore: ids(o.breakBefore) }
}

/**
 * Ordre effectif pour un modèle : l'ordre choisi, puis les sections qu'il ne cite pas, dans l'ordre
 * du modèle (aucune section n'est jamais perdue), puis les sections personnalisées non placées.
 */
export function orderedSections(layout: SectionLayout | undefined, templateOrder: readonly string[]): string[] {
  const l = sanitizeLayout(layout)
  const all = [...templateOrder.filter(isStandard), ...l.custom.map(c => c.id)]
  const chosen = l.order.filter(id => all.includes(id))
  return [...chosen, ...all.filter(id => !chosen.includes(id))]
}

/** Sections affichées, dans l'ordre effectif */
export function visibleSections(layout: SectionLayout | undefined, templateOrder: readonly string[]): string[] {
  const l = sanitizeLayout(layout)
  return orderedSections(l, templateOrder).filter(id => !l.hidden.includes(id))
}

export const nextCustomId = (layout: SectionLayout) => {
  for (let n = 1; n < 100; n++) if (!layout.custom.some(c => c.id === `x${n}`)) return `x${n}`
  return null
}

/** Déplace un élément d'une liste (glisser-déposer, Monter, Descendre) */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

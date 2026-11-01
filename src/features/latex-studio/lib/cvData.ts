// src/features/latex-studio/lib/cvData.ts
// Données intermédiaires d'un CV (même schéma que blog-api/src/ai/features/cvData.ts, qui les
// revalide strictement). Conservées dans sessionStorage le temps de l'onglet, jamais sur un serveur.

export interface CvLink { label: string; url: string }
export interface CvExperience { id: string; role: string; organization: string; location: string; start: string; end: string; bullets: string[] }
export interface CvEducation { id: string; degree: string; institution: string; location: string; start: string; end: string; details: string }
export interface CvSkillGroup { id: string; category: string; items: string[] }
export interface CvProject { id: string; name: string; description: string; link: string; technologies: string[] }
export interface CvLanguage { name: string; level: string }
export interface CvCertification { id: string; name: string; issuer: string; date: string }
export interface CvPublication { id: string; title: string; venue: string; year: string; authors: string }

export interface CvData {
  identity: { fullName: string; headline: string; email: string; phone: string; location: string; links: CvLink[] }
  summary: string
  experiences: CvExperience[]
  education: CvEducation[]
  skills: CvSkillGroup[]
  projects: CvProject[]
  languages: CvLanguage[]
  certifications: CvCertification[]
  publications: CvPublication[]
  interests: string[]
}

export function emptyCv(): CvData {
  return {
    identity: { fullName: '', headline: '', email: '', phone: '', location: '', links: [] },
    summary: '', experiences: [], education: [], skills: [], projects: [], languages: [],
    certifications: [], publications: [], interests: [],
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const arr = <T>(v: unknown, max: number, map: (x: Record<string, unknown>, i: number) => T | null): T[] =>
  (Array.isArray(v) ? v : []).slice(0, max).map((x, i) => map((x && typeof x === 'object' ? x : {}) as Record<string, unknown>, i)).filter((x): x is T => x !== null)
const strings = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v : []).slice(0, max).map(x => str(x, len)).filter(Boolean)

/**
 * Normalise des données reçues (serveur, session) ; identifiants réattribués dans l'ordre,
 * comme le fait le serveur : la réécriture IA s'y réfère.
 */
export function normalizeCv(raw: unknown): CvData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = (o.identity && typeof o.identity === 'object' ? o.identity : {}) as Record<string, unknown>
  return {
    identity: {
      fullName: str(id.fullName, 200), headline: str(id.headline, 200), email: str(id.email, 200),
      phone: str(id.phone, 60), location: str(id.location, 200),
      links: arr(id.links, 6, l => {
        const url = str(l.url, 300)
        return /^(https?:\/\/|mailto:)/i.test(url) || /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url) ? { label: str(l.label, 60) || url.replace(/^https?:\/\//i, ''), url } : null
      }),
    },
    summary: str(o.summary, 2000),
    // Éléments vides écartés, comme le fait le serveur ; identifiants attribués ensuite, dans l'ordre
    experiences: arr(o.experiences, 15, e => {
      const x = { id: '', role: str(e.role, 200), organization: str(e.organization, 200), location: str(e.location, 200), start: str(e.start, 40), end: str(e.end, 40), bullets: strings(e.bullets, 8, 600) }
      return x.role || x.organization || x.bullets.length ? x : null
    }).map((x, i) => ({ ...x, id: `e${i + 1}` })),
    education: arr(o.education, 10, d => {
      const x = { id: '', degree: str(d.degree, 200), institution: str(d.institution, 200), location: str(d.location, 200), start: str(d.start, 40), end: str(d.end, 40), details: str(d.details, 600) }
      return x.degree || x.institution ? x : null
    }).map((x, i) => ({ ...x, id: `d${i + 1}` })),
    skills: arr(o.skills, 10, s => {
      const items = strings(s.items, 25, 80)
      return items.length ? { id: '', category: str(s.category, 80), items } : null
    }).map((x, i) => ({ ...x, id: `s${i + 1}` })),
    projects: arr(o.projects, 10, p => {
      const link = str(p.link, 300)
      const x = { id: '', name: str(p.name, 200), description: str(p.description, 600), link: /^https?:\/\//i.test(link) ? link : '', technologies: strings(p.technologies, 15, 60) }
      return x.name || x.description ? x : null
    }).map((x, i) => ({ ...x, id: `p${i + 1}` })),
    languages: arr(o.languages, 8, l => (str(l.name, 60) ? { name: str(l.name, 60), level: str(l.level, 60) } : null)),
    certifications: arr(o.certifications, 15, (c, i) => (str(c.name, 200) ? { id: `c${i + 1}`, name: str(c.name, 200), issuer: str(c.issuer, 200), date: str(c.date, 40) } : null)),
    publications: arr(o.publications, 40, (u, i) => (str(u.title, 400) ? { id: `u${i + 1}`, title: str(u.title, 400), venue: str(u.venue, 200), year: str(u.year, 20), authors: str(u.authors, 400) } : null)),
    interests: strings(o.interests, 12, 80),
  }
}

/** Données envoyées à latex.rewrite : sans éléments vides (le serveur refuse les clés inconnues) */
export function forServer(cv: CvData): CvData {
  return normalizeCv({
    ...cv,
    experiences: cv.experiences.filter(e => e.role || e.organization || e.bullets.some(Boolean)).map(e => ({ ...e, bullets: e.bullets.filter(Boolean) })),
    education: cv.education.filter(d => d.degree || d.institution),
    skills: cv.skills.map(s => ({ ...s, items: s.items.filter(Boolean) })).filter(s => s.items.length),
    projects: cv.projects.filter(p => p.name || p.description),
  })
}

export const isEmptyCv = (cv: CvData) => !cv.identity.fullName && !cv.summary && !cv.experiences.length && !cv.education.length

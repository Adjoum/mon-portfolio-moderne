// blog-api/src/ai/features/cvData.ts
// Données intermédiaires d'un CV (studio LaTeX) : identité, profil, expériences, formations,
// compétences, projets, langues, certifications, publications, centres d'intérêt.
//
// Deux usages :
//   - entrée du navigateur (latex.rewrite) : validation STRICTE, toute clé inconnue est refusée ;
//   - sortie du modèle (latex.import.structure) : normalisation TOLÉRANTE, champs inconnus
//     ignorés, types corrigés, longueurs bornées.
// Les identifiants (e1, d1, s1, p1…) sont attribués ici : la réécriture IA ne peut viser que
// des éléments existants, et les faits (employeurs, diplômes, dates) ne viennent jamais du modèle.

import { InputError } from './validate';

export interface CvLink { label: string; url: string }
export interface CvExperience { id: string; role: string; organization: string; location: string; start: string; end: string; bullets: string[] }
export interface CvEducation { id: string; degree: string; institution: string; location: string; start: string; end: string; details: string }
export interface CvSkillGroup { id: string; category: string; items: string[] }
export interface CvProject { id: string; name: string; description: string; link: string; technologies: string[] }
export interface CvLanguage { name: string; level: string }
export interface CvCertification { id: string; name: string; issuer: string; date: string }
export interface CvPublication { id: string; title: string; venue: string; year: string; authors: string }

export interface CvData {
  identity: { fullName: string; headline: string; email: string; phone: string; location: string; links: CvLink[] };
  summary: string;
  experiences: CvExperience[];
  education: CvEducation[];
  skills: CvSkillGroup[];
  projects: CvProject[];
  languages: CvLanguage[];
  certifications: CvCertification[];
  publications: CvPublication[];
  interests: string[];
}

const S = 200;    // champ court
const M = 600;    // phrase
const L = 2000;   // paragraphe

/** Limites de taille : un CV réel de plusieurs pages y tient largement */
export const CV_LIMITS = {
  links: 6, experiences: 15, bullets: 8, education: 10, skills: 10, skillItems: 25,
  projects: 10, technologies: 15, languages: 8, certifications: 15, publications: 40, interests: 12,
} as const;

type Mode = 'strict' | 'lenient';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function str(value: unknown, max: number, field: string, mode: Mode): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    if (mode === 'strict') throw new InputError(field, 'texte attendu');
    return typeof value === 'number' ? String(value).slice(0, max) : '';
  }
  const cleaned = value.replace(CONTROL, '').trim();
  if (cleaned.length > max) {
    if (mode === 'strict') throw new InputError(field, `trop long (${max} caractères maximum)`);
    return cleaned.slice(0, max);
  }
  return cleaned;
}

function obj(value: unknown, field: string, allowed: readonly string[], mode: Mode): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    if (mode === 'strict') throw new InputError(field, 'objet attendu');
    return {};
  }
  if (mode === 'strict') {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key) || key === '__proto__' || key === 'constructor') throw new InputError(`${field}.${key}`, 'champ non autorisé');
    }
  }
  return value as Record<string, unknown>;
}

function list<T>(value: unknown, max: number, field: string, mode: Mode, map: (item: unknown, index: number) => T | null): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    if (mode === 'strict') throw new InputError(field, 'liste attendue');
    return [];
  }
  if (value.length > max && mode === 'strict') throw new InputError(field, `${max} éléments au maximum`);
  return value.slice(0, max).map(map).filter((x): x is T => x !== null);
}

const strings = (value: unknown, max: number, len: number, field: string, mode: Mode) =>
  list(value, max, field, mode, (v, i) => str(v, len, `${field}[${i}]`, mode) || null);

/**
 * Normalise des données de CV. En mode strict, la moindre anomalie lève une InputError ;
 * en mode tolérant, la valeur est corrigée ou ignorée.
 */
export function normalizeCvData(raw: unknown, mode: Mode): CvData {
  const root = obj(raw, 'cv', ['identity', 'summary', 'experiences', 'education', 'skills', 'projects', 'languages', 'certifications', 'publications', 'interests'], mode);
  const id = obj(root.identity ?? {}, 'cv.identity', ['fullName', 'headline', 'email', 'phone', 'location', 'links'], mode);

  const cv: CvData = {
    identity: {
      fullName: str(id.fullName, S, 'identity.fullName', mode),
      headline: str(id.headline, S, 'identity.headline', mode),
      email:    str(id.email, S, 'identity.email', mode),
      phone:    str(id.phone, 60, 'identity.phone', mode),
      location: str(id.location, S, 'identity.location', mode),
      links: list(id.links, CV_LIMITS.links, 'identity.links', mode, (v, i) => {
        const o = obj(v, `identity.links[${i}]`, ['label', 'url'], mode);
        const url = str(o.url, 300, `identity.links[${i}].url`, mode);
        // Liens web ou courriel uniquement : jamais javascript:, file:, data:…
        if (!url || !/^(https?:\/\/|mailto:)/i.test(url) && !/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)) {
          if (mode === 'strict' && url) throw new InputError(`identity.links[${i}].url`, 'adresse web attendue');
          return null;
        }
        return { label: str(o.label, 60, `identity.links[${i}].label`, mode) || url.replace(/^https?:\/\//i, ''), url };
      }),
    },
    summary: str(root.summary, L, 'summary', mode),
    experiences: list(root.experiences, CV_LIMITS.experiences, 'experiences', mode, (v, i) => {
      const o = obj(v, `experiences[${i}]`, ['id', 'role', 'organization', 'location', 'start', 'end', 'bullets'], mode);
      const e = {
        id: `e${i + 1}`,
        role: str(o.role, S, `experiences[${i}].role`, mode),
        organization: str(o.organization, S, `experiences[${i}].organization`, mode),
        location: str(o.location, S, `experiences[${i}].location`, mode),
        start: str(o.start, 40, `experiences[${i}].start`, mode),
        end: str(o.end, 40, `experiences[${i}].end`, mode),
        bullets: strings(o.bullets, CV_LIMITS.bullets, M, `experiences[${i}].bullets`, mode),
      };
      return e.role || e.organization || e.bullets.length ? e : null;
    }),
    education: list(root.education, CV_LIMITS.education, 'education', mode, (v, i) => {
      const o = obj(v, `education[${i}]`, ['id', 'degree', 'institution', 'location', 'start', 'end', 'details'], mode);
      const d = {
        id: `d${i + 1}`,
        degree: str(o.degree, S, `education[${i}].degree`, mode),
        institution: str(o.institution, S, `education[${i}].institution`, mode),
        location: str(o.location, S, `education[${i}].location`, mode),
        start: str(o.start, 40, `education[${i}].start`, mode),
        end: str(o.end, 40, `education[${i}].end`, mode),
        details: str(o.details, M, `education[${i}].details`, mode),
      };
      return d.degree || d.institution ? d : null;
    }),
    skills: list(root.skills, CV_LIMITS.skills, 'skills', mode, (v, i) => {
      const o = obj(v, `skills[${i}]`, ['id', 'category', 'items'], mode);
      const items = strings(o.items, CV_LIMITS.skillItems, 80, `skills[${i}].items`, mode);
      return items.length ? { id: `s${i + 1}`, category: str(o.category, 80, `skills[${i}].category`, mode), items } : null;
    }),
    projects: list(root.projects, CV_LIMITS.projects, 'projects', mode, (v, i) => {
      const o = obj(v, `projects[${i}]`, ['id', 'name', 'description', 'link', 'technologies'], mode);
      const link = str(o.link, 300, `projects[${i}].link`, mode);
      const p = {
        id: `p${i + 1}`,
        name: str(o.name, S, `projects[${i}].name`, mode),
        description: str(o.description, M, `projects[${i}].description`, mode),
        link: /^https?:\/\//i.test(link) ? link : '',
        technologies: strings(o.technologies, CV_LIMITS.technologies, 60, `projects[${i}].technologies`, mode),
      };
      return p.name || p.description ? p : null;
    }),
    languages: list(root.languages, CV_LIMITS.languages, 'languages', mode, (v, i) => {
      const o = obj(v, `languages[${i}]`, ['name', 'level'], mode);
      const name = str(o.name, 60, `languages[${i}].name`, mode);
      return name ? { name, level: str(o.level, 60, `languages[${i}].level`, mode) } : null;
    }),
    certifications: list(root.certifications, CV_LIMITS.certifications, 'certifications', mode, (v, i) => {
      const o = obj(v, `certifications[${i}]`, ['id', 'name', 'issuer', 'date'], mode);
      const name = str(o.name, S, `certifications[${i}].name`, mode);
      return name ? { id: `c${i + 1}`, name, issuer: str(o.issuer, S, `certifications[${i}].issuer`, mode), date: str(o.date, 40, `certifications[${i}].date`, mode) } : null;
    }),
    publications: list(root.publications, CV_LIMITS.publications, 'publications', mode, (v, i) => {
      const o = obj(v, `publications[${i}]`, ['id', 'title', 'venue', 'year', 'authors'], mode);
      const title = str(o.title, 400, `publications[${i}].title`, mode);
      return title ? { id: `u${i + 1}`, title, venue: str(o.venue, S, `publications[${i}].venue`, mode), year: str(o.year, 20, `publications[${i}].year`, mode), authors: str(o.authors, 400, `publications[${i}].authors`, mode) } : null;
    }),
    interests: strings(root.interests, CV_LIMITS.interests, 80, 'interests', mode),
  };
  return cv;
}

/** Nombres présents dans un texte (« 40 % », « 2 500 », « 3,5 »), normalisés pour comparaison */
export function numbersIn(text: string): string[] {
  return [...text.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)]
    .map(m => m[0].replace(',', '.').replace(/^0+(?=\d)/, ''));
}

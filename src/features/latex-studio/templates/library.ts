// src/features/latex-studio/templates/library.ts
// Huit modèles de CV, inspirés des usages professionnels internationaux, sans reproduire de modèle
// existant. Chaque modèle affiche TOUTES les sections renseignées (aucune donnée perdue) ; seuls
// l'ordre, la typographie et la mise en page changent. Paquets : liste autorisée de latex-runner.
import { normalizeCv, type CvData } from '../lib/cvData'
import type { CvTemplate, TemplateOptions } from './types'
import {
  END, bullets, certificationsList, contacts, educationEntry, experienceEntry, headerWithPhoto, interestsLine,
  labels, languagesLine, preamble, projectEntry, publicationsList, section, sectionMacro, skillsList, type Labels,
} from './common'
import { email, link, tex } from './escape'

const gap = (o: TemplateOptions) => (o.compact ? '4pt' : '7pt')

/** Corps commun : sections dans l'ordre demandé, chacune seulement si elle est renseignée */
type SectionId = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'publications' | 'certifications' | 'languages' | 'interests'

function body(cv: CvData, o: TemplateOptions, order: SectionId[], heading: (t: string) => string, titles: Partial<Labels> = {}, overrides: Partial<Record<SectionId, string>> = {}): string {
  const L = { ...labels(o), ...titles }
  const blocks: Record<SectionId, [string, string]> = {
    summary: [L.summary, tex(cv.summary)],
    experience: [L.experience, cv.experiences.map(e => experienceEntry(e, o)).join(`\n\\vspace{${gap(o)}}\n`)],
    education: [L.education, cv.education.map(d => educationEntry(d, o)).join(`\n\\vspace{${gap(o)}}\n`)],
    skills: [L.skills, skillsList(cv, o)],
    projects: [L.projects, cv.projects.map(projectEntry).join(`\n\\vspace{${gap(o)}}\n`)],
    publications: [L.publications, publicationsList(cv)],
    certifications: [L.certifications, certificationsList(cv)],
    languages: [L.languages, languagesLine(cv)],
    interests: [L.interests, interestsLine(cv)],
  }
  return order.map(id => section(heading, blocks[id][0], overrides[id] ?? blocks[id][1])).join('\n')
}

const ALL: SectionId[] = ['summary', 'experience', 'education', 'skills', 'projects', 'publications', 'certifications', 'languages', 'interests']
/** Garantit que chaque section figure dans l'ordre, même si un modèle l'oublie */
const complete = (order: SectionId[]) => [...order, ...ALL.filter(s => !order.includes(s))]

// ── 1. Silicon Valley Engineer ────────────────────────────────
const siliconValley: CvTemplate = {
  id: 'silicon-valley',
  name: 'Silicon Valley Engineer',
  category: 'Ingénierie logicielle',
  description: 'Sobre et très lisible, une colonne, centré sur les réalisations techniques mesurables.',
  defaults: { accent: '0B57D0', font: 'helvet', size: 10, margins: 'compact', compact: true, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const macros = sectionMacro(o, '{\\color{accent}\\bfseries\\textls[60]{\\MakeUppercase{#1}}}', '{\\color{rulegray}\\hrule height 0.6pt}')
    const head = [
      `\\cvname{\\fontsize{24}{28}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}{\\color{accent}\\large ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{4pt}{\\small ${contacts(cv, ' \\enspace\\textbar\\enspace ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros }),
      headerWithPhoto(head, o),
      body(cv, o, complete(['summary', 'experience', 'projects', 'skills', 'education', 'publications', 'certifications', 'languages', 'interests']), t => `\\cvsection{${t}}`),
      END,
    ].join('\n')
  },
}

// ── 2. Executive Prestige ─────────────────────────────────────
const executive: CvTemplate = {
  id: 'executive-prestige',
  name: 'Executive Prestige',
  category: 'Cadres et dirigeants',
  description: 'Élégant et aéré : en-tête centré, profil mis en valeur, compétences clés sur deux colonnes.',
  defaults: { accent: '1F3A5F', font: 'charter', size: 11, margins: 'normal', compact: false, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const L = labels(o)
    const macros = sectionMacro(o, '{\\color{accent}\\textls[110]{\\MakeUppercase{#1}}}', '{\\color{accent}\\hrule height 0.4pt}', { before: o.compact ? 6 : 10 })
    const name = `\\cvname{\\fontsize{25}{30}\\selectfont\\textls[90]{\\MakeUppercase{${tex(cv.identity.fullName)}}}}`
    const head = o.photo
      ? headerWithPhoto([`${name}\\par`, cv.identity.headline ? `\\vspace{3pt}{\\itshape\\large\\color{accent}${tex(cv.identity.headline)}}\\par` : '', `\\vspace{5pt}{\\small ${contacts(cv, ' \\textbullet{} ')}}\\par`].join('\n'), o)
      : [
          '\\begin{center}',
          `${name}\\par`,
          cv.identity.headline ? `\\vspace{3pt}{\\itshape\\large\\color{accent}${tex(cv.identity.headline)}}\\par` : '',
          `\\vspace{5pt}{\\small ${contacts(cv, ' \\textbullet{} ')}}`,
          '\\end{center}',
        ].join('\n')
    const rules = '\\vspace{2pt}{\\color{accent}\\rule{\\linewidth}{1.2pt}}\\par\\vspace{-8.5pt}{\\color{accent}\\rule{\\linewidth}{0.4pt}}\\par\\vspace{4pt}'
    const profile = cv.summary ? `\\begin{center}\\begin{minipage}{0.9\\linewidth}\\centering\\itshape ${tex(cv.summary)}\\end{minipage}\\end{center}` : ''
    const keySkills = cv.skills.length
      // Chaque catégorie reste d'un seul tenant (jamais son titre dans une colonne et ses éléments dans l'autre)
      ? `\\begin{multicols}{2}\\raggedcolumns\n${cv.skills.map(s => `\\begin{minipage}[t]{\\linewidth}\\raggedright ${s.category ? `\\textbf{${tex(s.category)}}\\\\` : ''}${s.items.map(tex).join(', ')}\\end{minipage}\\par\\vspace{5pt}`).join('\n')}\n\\end{multicols}`
      : ''
    return [
      preamble(cv, o, { packages: ['multicol'], macros }),
      head,
      rules,
      profile,
      body(cv, o, complete(['skills', 'experience', 'education', 'certifications', 'projects', 'publications', 'languages', 'interests']), t => `\\cvsection{${t}}`, { skills: L.keySkills }, { skills: keySkills, summary: '' }),
      END,
    ].join('\n')
  },
}

// ── 3. AI & Data Scientist ────────────────────────────────────
const dataScientist: CvTemplate = {
  id: 'ai-data-scientist',
  name: 'AI & Data Scientist',
  category: 'Data et IA',
  description: 'Pile technique en tête, projets de machine learning avec résultats, publications numérotées.',
  defaults: { accent: '0F766E', font: 'helvet', size: 10, margins: 'compact', compact: true, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const L = labels(o)
    const macros = sectionMacro(o, '{\\color{accent}\\rule[-0.5pt]{7pt}{7pt}}\\hspace{6pt}{\\bfseries\\large #1}', '{\\color{rulegray}\\hrule height 0.5pt}')
    const head = [
      `\\cvname{\\fontsize{23}{27}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      '\\vspace{3pt}{\\color{accent}\\rule{2.2cm}{2pt}}\\par\\vspace{3pt}',
      cv.identity.headline ? `{\\color{accent}\\bfseries ${tex(cv.identity.headline)}}\\par\\vspace{2pt}` : '',
      `{\\small ${contacts(cv, ' \\enspace\\textperiodcentered\\enspace ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros }),
      headerWithPhoto(head, o),
      body(cv, o, complete(['summary', 'skills', 'experience', 'projects', 'publications', 'education', 'certifications', 'languages', 'interests']), t => `\\cvsection{${t}}`, { skills: L.technical }),
      END,
    ].join('\n')
  },
}

// ── 4. Software Architect ─────────────────────────────────────
const architect: CvTemplate = {
  id: 'software-architect',
  name: 'Software Architect',
  category: 'Architecture et systèmes',
  description: 'Deux colonnes : compétences, langues et certifications à gauche ; architecture et réalisations à droite.',
  defaults: { accent: '3730A3', font: 'helvet', size: 10, margins: 'compact', compact: true, photo: false, twoColumns: true, lang: 'fr' },
  supports: { photo: true, twoColumns: true },
  render(cv, o) {
    const L = labels(o)
    const macros = [
      sectionMacro(o, '{\\color{accent}\\bfseries\\textls[50]{\\MakeUppercase{#1}}}', '{\\color{accent}\\hrule height 1pt}'),
      '\\newcommand{\\sidesection}[1]{\\par\\vspace{7pt}{\\color{accent}\\bfseries\\small\\textls[60]{\\MakeUppercase{#1}}}\\par\\vspace{2pt}}',
    ].join('\n')
    const head = [
      `\\cvname{\\fontsize{24}{28}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}{\\color{accent}\\large ${tex(cv.identity.headline)}}\\par` : '',
    ].filter(Boolean).join('\n')
    if (!o.twoColumns) {
      return [
        preamble(cv, o, { macros }),
        headerWithPhoto(`${head}\n\\vspace{4pt}{\\small ${contacts(cv)}}\\par`, o),
        body(cv, o, complete(['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'publications', 'languages', 'interests']), t => `\\cvsection{${t}}`),
        END,
      ].join('\n')
    }
    const id = cv.identity
    const contactLines = [id.location && tex(id.location), id.email && email(id.email), id.phone && tex(id.phone), ...id.links.map(l => link(l.label, l.url))].filter(Boolean).join('\\\\\n')
    const side = [
      contactLines && `\\sidesection{${L.contact}}\n{\\small\\raggedright ${contactLines}\\par}`,
      cv.skills.length && `\\sidesection{${L.skills}}\n${cv.skills.map(s => `{\\small${s.category ? `\\textbf{${tex(s.category)}}\\\\` : ''}\\raggedright ${s.items.map(tex).join(', ')}\\par}\\vspace{3pt}`).join('\n')}`,
      cv.languages.length && `\\sidesection{${L.languages}}\n{\\small\\raggedright ${languagesLine(cv, '\\\\ ')}\\par}`,
      cv.certifications.length && `\\sidesection{${L.certifications}}\n{\\small\\raggedright ${cv.certifications.map(c => [c.name, c.issuer, c.date].filter(Boolean).map(tex).join(', ')).join('\\\\[2pt] ')}\\par}`,
      cv.interests.length && `\\sidesection{${L.interests}}\n{\\small\\raggedright ${interestsLine(cv)}\\par}`,
    ].filter(Boolean).join('\n')
    const main = body(cv, o, ['summary', 'experience', 'projects', 'education', 'publications'], t => `\\cvsection{${t}}`)
    return [
      preamble(cv, o, { packages: ['paracol'], macros: `${macros}\n\\columnratio{0.3}\n\\setlength{\\columnsep}{1.4em}` }),
      headerWithPhoto(head, o),
      '\\vspace{6pt}',
      '\\begin{paracol}{2}',
      side,
      '\\switchcolumn',
      main,
      '\\end{paracol}',
      END,
    ].join('\n')
  },
}

// ── 5. Healthcare & Research ──────────────────────────────────
const healthcare: CvTemplate = {
  id: 'healthcare-research',
  name: 'Healthcare & Research',
  category: 'Santé et recherche',
  description: 'Santé, imagerie médicale, recherche clinique : parcours, formation et publications, photo prévue.',
  defaults: { accent: '0E7490', font: 'lmodern', size: 11, margins: 'normal', compact: false, photo: true, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const macros = sectionMacro(o, '{\\color{accent}\\large\\bfseries #1}', '{\\color{accent}\\hrule height 0.8pt}')
    const head = [
      `\\cvname{\\fontsize{24}{28}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{3pt}{\\color{accent}\\large ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{6pt}{\\small ${contacts(cv, '\\\\ ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros }),
      headerWithPhoto(head, o),
      body(cv, o, complete(['summary', 'experience', 'education', 'publications', 'certifications', 'skills', 'projects', 'languages', 'interests']), t => `\\cvsection{${t}}`),
      END,
    ].join('\n')
  },
}

// ── 6. Minimal ATS Pro ────────────────────────────────────────
const ats: CvTemplate = {
  id: 'minimal-ats',
  name: 'Minimal ATS Pro',
  category: 'Compatible ATS',
  description: 'Une colonne, sans tableau ni photo, titres standard : lu sans erreur par les logiciels de recrutement.',
  defaults: { accent: '111827', font: 'lmodern', size: 11, margins: 'normal', compact: false, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: false, twoColumns: false },
  render(cv, o) {
    const opts = { ...o, photo: false }
    const L = labels(opts)
    const macros = sectionMacro(o, '{\\bfseries\\MakeUppercase{#1}}', '\\hrule height 0.5pt')
    // Aucune table : titre, puis organisation et dates sur une ligne de texte
    const exp = cv.experiences.map(e => [
      '\\needspace{3\\baselineskip}',
      `\\textbf{${tex(e.role) || tex(e.organization)}}\\par`,
      [tex(e.organization), tex(e.location)].filter(Boolean).join(', ') + ([e.start, e.end].some(Boolean) ? ` \\hfill ${[tex(e.start), tex(e.end)].filter(Boolean).join(' -- ')}` : '') + '\\par',
      bullets(e.bullets),
    ].join('\n')).join('\n\\vspace{5pt}\n')
    const edu = cv.education.map(d => `\\needspace{2\\baselineskip}\\textbf{${tex(d.degree) || tex(d.institution)}}\\par ${[tex(d.institution), tex(d.location)].filter(Boolean).join(', ')}${[d.start, d.end].some(Boolean) ? ` \\hfill ${[tex(d.start), tex(d.end)].filter(Boolean).join(' -- ')}` : ''}\\par${d.details ? ` ${tex(d.details)}\\par` : ''}`).join('\n\\vspace{4pt}\n')
    const skills = cv.skills.map(s => `${s.category ? `\\textbf{${tex(s.category)} :} ` : ''}${s.items.map(tex).join(', ')}\\par`).join('\n')
    const head = [
      `\\cvname{\\fontsize{22}{26}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}${tex(cv.identity.headline)}\\par` : '',
      `\\vspace{3pt}${contacts(cv, ' \\textbar{} ')}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, { ...opts, accent: '111827' }, { macros }),
      head,
      body(cv, opts, ALL, t => `\\cvsection{${t}}`, { summary: L.summary }, { experience: exp, education: edu, skills }),
      END,
    ].join('\n')
  },
}

// ── 7. Modern Creative ────────────────────────────────────────
const creative: CvTemplate = {
  id: 'modern-creative',
  name: 'Modern Creative',
  category: 'Design contemporain',
  description: 'Bandeau coloré, compétences en étiquettes, accents graphiques discrets.',
  defaults: { accent: '7C3AED', font: 'helvet', size: 10, margins: 'compact', compact: false, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const macros = [
      sectionMacro(o, '{\\color{accent}\\rule[-1.5pt]{3pt}{12pt}}\\hspace{7pt}{\\bfseries\\large #1}', null, { before: o.compact ? 6 : 9 }),
      '\\newcommand{\\cvtag}[1]{{\\setlength{\\fboxsep}{2.5pt}\\fcolorbox{accent!35}{accent!7}{\\small\\strut #1}}\\hspace{4pt plus 2pt}\\allowbreak}',
    ].join('\n')
    const inner = [
      `\\cvname{\\fontsize{24}{28}\\selectfont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{3pt}{\\large ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{6pt}{\\small ${contacts(cv, ' \\enspace\\textbar\\enspace ')}}\\par`,
    ].filter(Boolean).join('\n')
    const band = [
      '{\\setlength{\\fboxsep}{12pt}\\hypersetup{urlcolor=white}%',
      '\\colorbox{accent}{\\parbox{\\dimexpr\\linewidth-2\\fboxsep\\relax}{\\color{white}',
      headerWithPhoto(inner, o),
      '}}}\\par\\vspace{4pt}',
    ].join('\n')
    const tags = cv.skills.length
      ? cv.skills.map(s => `${s.category ? `{\\bfseries ${tex(s.category)}}\\par\\vspace{2pt}` : ''}${s.items.map(i => `\\cvtag{${tex(i)}}`).join('')}\\par\\vspace{4pt}`).join('\n')
      : ''
    return [
      preamble(cv, o, { macros }),
      band,
      body(cv, o, complete(['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'publications', 'languages', 'interests']), t => `\\cvsection{${t}}`, {}, { skills: tags }),
      END,
    ].join('\n')
  },
}

// ── 8. Academic Research ──────────────────────────────────────
const academic: CvTemplate = {
  id: 'academic-research',
  name: 'Academic Research',
  category: 'Recherche et enseignement',
  description: 'CV universitaire : formation, thèmes de recherche, publications, recherche et enseignement, sur plusieurs pages.',
  defaults: { accent: '1F3A5F', font: 'charter', size: 11, margins: 'large', compact: false, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  render(cv, o) {
    const L = labels(o)
    const macros = sectionMacro(o, '{\\color{accent}\\large\\textls[40]{\\MakeUppercase{#1}}}', '{\\color{rulegray}\\hrule height 0.5pt}', { before: o.compact ? 7 : 11 })
    const center = !o.photo
    const head = [
      center ? '\\begin{center}' : '',
      `\\cvname{\\fontsize{22}{26}\\selectfont ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{4pt}{\\itshape ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{4pt}{\\small ${contacts(cv, ' \\textbullet{} ')}}${center ? '' : '\\par'}`,
      center ? '\\end{center}' : '',
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros }),
      headerWithPhoto(head, o),
      body(cv, o, complete(['summary', 'education', 'publications', 'experience', 'projects', 'certifications', 'skills', 'languages', 'interests']), t => `\\cvsection{${t}}`, { summary: L.researchInterests, experience: L.research }),
      END,
    ].join('\n')
  },
}

export const TEMPLATE_LIBRARY: CvTemplate[] = [siliconValley, executive, dataScientist, architect, healthcare, ats, creative, academic]

export const templateById = (id: string) => TEMPLATE_LIBRARY.find(t => t.id === id)

/** Code LaTeX d'un CV pour un modèle et des réglages donnés (réglages hors du modèle ignorés) */
export function renderCv(templateId: string, cv: CvData, options?: Partial<TemplateOptions>): string {
  const template = templateById(templateId) ?? TEMPLATE_LIBRARY[0]
  const o: TemplateOptions = { ...template.defaults, ...options }
  if (!template.supports.photo) o.photo = false
  if (!template.supports.twoColumns) o.twoColumns = false
  // Saisie nettoyée : espaces superflus, lignes et éléments vides écartés
  return template.render(normalizeCv(cv), o)
}


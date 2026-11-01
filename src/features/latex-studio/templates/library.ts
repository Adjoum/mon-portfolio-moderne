// src/features/latex-studio/templates/library.ts
// Huit modèles de CV, inspirés des usages professionnels internationaux, sans reproduire de modèle
// existant. Chaque modèle affiche TOUTES les sections renseignées (aucune donnée perdue) ; seuls
// l'ordre, la typographie et la mise en page changent. Paquets : liste autorisée de latex-runner.
import { normalizeCv, type CvData } from '../lib/cvData'
import type { CvTemplate, TemplateOptions } from './types'
import {
  END, bullets, certificationsList, contacts, educationEntry, experienceEntry, gap, headerWithPhoto, interestsLine, keep,
  labels, languagesLine, preamble, projectEntry, publicationsList, section, sectionMacro, skillsList, themeOf, type Labels,
} from './common'
import { email, link, tex } from './escape'
import type { TemplateDesign } from './theme'
import { sanitizeLayout, visibleSections, type CustomSection } from '../lib/layout'

/** Corps commun : sections dans l'ordre demandé, chacune seulement si elle est renseignée */
type SectionId = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'publications' | 'certifications' | 'languages' | 'interests'

/** Section personnalisée : un paragraphe, ou une liste à puces s'il y a plusieurs lignes */
function customBody(c: CustomSection): string {
  const items = c.items.map(i => i.trim()).filter(Boolean)
  return items.length === 1 ? `${tex(items[0])}\\par` : bullets(items)
}

/**
 * Corps commun : sections dans l'ordre du modèle, ou dans celui choisi par l'utilisateur (P6),
 * chacune seulement si elle est renseignée et visible ; titres renommés échappés.
 */
function body(cv: CvData, o: TemplateOptions, order: SectionId[], heading: (t: string) => string, titles: Partial<Labels> = {}, overrides: Partial<Record<SectionId, string>> = {}): string {
  const L = { ...labels(o), ...titles }
  const layout = sanitizeLayout(o.layout)
  const blocks: Record<SectionId, [string, string]> = {
    summary: [L.summary, tex(cv.summary)],
    experience: [L.experience, cv.experiences.map(e => experienceEntry(e, o)).join(`\n\\vspace{${gap(o)}}\n`)],
    education: [L.education, cv.education.map(d => educationEntry(d, o)).join(`\n\\vspace{${gap(o)}}\n`)],
    skills: [L.skills, skillsList(cv, o)],
    projects: [L.projects, cv.projects.map(p => projectEntry(p, o)).join(`\n\\vspace{${gap(o)}}\n`)],
    publications: [L.publications, publicationsList(cv)],
    certifications: [L.certifications, certificationsList(cv)],
    languages: [L.languages, languagesLine(cv)],
    interests: [L.interests, interestsLine(cv)],
  }
  return visibleSections(layout, order).map(id => {
    const custom = layout.custom.find(c => c.id === id)
    const [title, content] = custom
      ? [tex(custom.title.trim()), customBody(custom)]
      : [layout.titles[id] ? tex(layout.titles[id].trim()) : blocks[id as SectionId][0], overrides[id as SectionId] ?? blocks[id as SectionId][1]]
    // Saut de page demandé : seulement devant une section qui sera réellement affichée
    const pageBreak = layout.breakBefore.includes(id) && content.trim() ? '\\clearpage\n' : ''
    return pageBreak + section(heading, title, content)
  }).join('\n')
}

const ALL: SectionId[] = ['summary', 'experience', 'education', 'skills', 'projects', 'publications', 'certifications', 'languages', 'interests']
/** Garantit que chaque section figure dans l'ordre, même si un modèle l'oublie */
const complete = (order: readonly SectionId[]): SectionId[] => [...order, ...ALL.filter(s => !order.includes(s))]

// ── 1. Silicon Valley Engineer ────────────────────────────────
const siliconValley: CvTemplate = {
  id: 'silicon-valley',
  name: 'Silicon Valley Engineer',
  category: 'Ingénierie logicielle',
  description: 'Sobre et très lisible, une colonne, centré sur les réalisations techniques mesurables.',
  defaults: { accent: '0B57D0', font: 'helvet', size: 10, margins: 'compact', compact: true, photo: false, twoColumns: false, lang: 'fr' },
  supports: { photo: true, twoColumns: false },
  sections: ['summary', 'experience', 'projects', 'skills', 'education', 'publications', 'certifications', 'languages', 'interests'],
  design: { nameSize: 24, tracking: 60, ruleWidth: 0.6, ruleColor: 'gray' },
  render(cv, o) {
    const design = siliconValley.design
    const macros = sectionMacro(o, design)
    const head = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{4pt}{\\cvdetailfont ${contacts(cv, ' \\enspace\\textbar\\enspace ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros, design }),
      headerWithPhoto(head, o),
      body(cv, o, complete(siliconValley.sections), t => `\\cvsection{${t}}`),
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
  sections: ['summary', 'skills', 'experience', 'education', 'certifications', 'projects', 'publications', 'languages', 'interests'],
  design: { nameSize: 25, sectionBold: false, tracking: 110, ruleWidth: 0.4, ruleColor: 'accent', headlineItalic: true },
  render(cv, o) {
    const L = labels(o)
    const design: Partial<TemplateDesign> = { ...executive.design, sectionBefore: o.compact ? 6 : 10 }
    const macros = sectionMacro(o, design)
    const name = `\\cvname{\\cvnamefont\\textls[90]{\\MakeUppercase{${tex(cv.identity.fullName)}}}}`
    const head = o.photo
      ? headerWithPhoto([`${name}\\par`, cv.identity.headline ? `\\vspace{3pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '', `\\vspace{5pt}{\\cvdetailfont ${contacts(cv, ' \\textbullet{} ')}}\\par`].join('\n'), o)
      : [
          '\\begin{center}',
          `${name}\\par`,
          cv.identity.headline ? `\\vspace{3pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
          `\\vspace{5pt}{\\cvdetailfont ${contacts(cv, ' \\textbullet{} ')}}`,
          '\\end{center}',
        ].join('\n')
    const rules = '\\vspace{2pt}{\\color{accent}\\rule{\\linewidth}{1.2pt}}\\par\\vspace{-8.5pt}{\\color{accent}\\rule{\\linewidth}{0.4pt}}\\par\\vspace{4pt}'
    const layout = sanitizeLayout(o.layout)
    // Profil mis en valeur sous l'en-tête ; il redevient une section ordinaire si l'ordre est personnalisé
    const featured = !layout.order.length && !layout.hidden.includes('summary')
    const profile = cv.summary && featured ? `\\begin{center}\\begin{minipage}{0.9\\linewidth}\\centering\\itshape ${tex(cv.summary)}\\end{minipage}\\end{center}` : ''
    const keySkills = cv.skills.length
      // Chaque catégorie reste d'un seul tenant (jamais son titre dans une colonne et ses éléments dans l'autre)
      ? `\\begin{multicols}{2}\\raggedcolumns\n${cv.skills.map(s => `\\begin{minipage}[t]{\\linewidth}\\raggedright ${s.category ? `\\textbf{${tex(s.category)}}\\\\` : ''}${s.items.map(tex).join(', ')}\\end{minipage}\\par\\vspace{5pt}`).join('\n')}\n\\end{multicols}`
      : ''
    return [
      preamble(cv, o, { packages: ['multicol'], macros, design }),
      head,
      rules,
      profile,
      body(cv, o, complete(executive.sections), t => `\\cvsection{${t}}`, { skills: L.keySkills }, { skills: keySkills, ...(featured ? { summary: '' } : {}) }),
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
  sections: ['summary', 'skills', 'experience', 'projects', 'publications', 'education', 'certifications', 'languages', 'interests'],
  design: {
    nameSize: 23, sectionSize: 'large', sectionUpper: false, tracking: 0, sectionColor: 'text', ruleWidth: 0.5, ruleColor: 'gray',
    headlineSize: 'normalsize', headlineBold: true,
  },
  render(cv, o) {
    const L = labels(o)
    const design = dataScientist.design
    const macros = sectionMacro(o, design, '{\\color{accent}\\rule[-0.5pt]{7pt}{7pt}}\\hspace{6pt}')
    const head = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      '\\vspace{3pt}{\\color{accent}\\rule{2.2cm}{2pt}}\\par\\vspace{3pt}',
      cv.identity.headline ? `{\\cvheadline ${tex(cv.identity.headline)}}\\par\\vspace{2pt}` : '',
      `{\\cvdetailfont ${contacts(cv, ' \\enspace\\textperiodcentered\\enspace ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros, design }),
      headerWithPhoto(head, o),
      body(cv, o, complete(dataScientist.sections), t => `\\cvsection{${t}}`, { skills: L.technical }),
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
  sections: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'publications', 'languages', 'interests'],
  design: { nameSize: 24, tracking: 50, ruleWidth: 1, ruleColor: 'accent', columnRatio: 0.3 },
  render(cv, o) {
    const L = labels(o)
    const design = architect.design
    const macros = [
      sectionMacro(o, design),
      '\\newcommand{\\sidesection}[1]{\\par\\vspace{7pt}{\\color{heading}\\bfseries\\small\\cvtitletext{#1}}\\par\\vspace{2pt}}',
    ].join('\n')
    const head = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
    ].filter(Boolean).join('\n')
    if (!o.twoColumns) {
      return [
        preamble(cv, o, { macros, design }),
        headerWithPhoto(`${head}\n\\vspace{4pt}{\\cvdetailfont ${contacts(cv)}}\\par`, o),
        body(cv, o, complete(architect.sections), t => `\\cvsection{${t}}`),
        END,
      ].join('\n')
    }
    const id = cv.identity
    const contactLines = [id.location && tex(id.location), id.email && email(id.email), id.phone && tex(id.phone), ...id.links.map(l => link(l.label, l.url))].filter(Boolean).join('\\\\\n')
    const layout = sanitizeLayout(o.layout)
    const sideTitle = (id: 'skills' | 'languages' | 'certifications' | 'interests') => (layout.titles[id] ? tex(layout.titles[id].trim()) : L[id])
    const sideBlocks: Record<string, string | 0 | false> = {
      skills: cv.skills.length && `\\sidesection{${sideTitle('skills')}}\n${cv.skills.map(s => `{\\cvdetailfont${s.category ? `\\textbf{${tex(s.category)}}\\\\` : ''}\\raggedright ${s.items.map(tex).join(', ')}\\par}\\vspace{3pt}`).join('\n')}`,
      languages: cv.languages.length && `\\sidesection{${sideTitle('languages')}}\n{\\cvdetailfont\\raggedright ${languagesLine(cv, '\\\\ ')}\\par}`,
      certifications: cv.certifications.length && `\\sidesection{${sideTitle('certifications')}}\n{\\cvdetailfont\\raggedright ${cv.certifications.map(c => [c.name, c.issuer, c.date].filter(Boolean).map(tex).join(', ')).join('\\\\[2pt] ')}\\par}`,
      interests: cv.interests.length && `\\sidesection{${sideTitle('interests')}}\n{\\cvdetailfont\\raggedright ${interestsLine(cv)}\\par}`,
    }
    // Colonne latérale : coordonnées d'abord, puis les sections latérales dans l'ordre choisi
    const sideOrder = visibleSections(layout, ['skills', 'languages', 'certifications', 'interests']).filter(id => id in sideBlocks)
    const side = [
      contactLines && `\\sidesection{${L.contact}}\n{\\cvdetailfont\\raggedright ${contactLines}\\par}`,
      ...sideOrder.map(id => sideBlocks[id]),
    ].filter(Boolean).join('\n')
    // Pas de saut de page forcé dans les colonnes parallèles (paracol) : il désaligne les deux colonnes
    const main = body(cv, { ...o, layout: { ...layout, breakBefore: [] } }, ['summary', 'experience', 'projects', 'education', 'publications'], t => `\\cvsection{${t}}`)
    return [
      preamble(cv, o, { packages: ['paracol'], macros: `${macros}\n\\columnratio{${themeOf(o, design).columnRatio}}\n\\setlength{\\columnsep}{1.4em}`, design }),
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
  sections: ['summary', 'experience', 'education', 'publications', 'certifications', 'skills', 'projects', 'languages', 'interests'],
  design: { nameSize: 24, sectionSize: 'large', sectionUpper: false, tracking: 0, ruleWidth: 0.8, ruleColor: 'accent' },
  render(cv, o) {
    const design = healthcare.design
    const macros = sectionMacro(o, design)
    const head = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{3pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{6pt}{\\cvdetailfont ${contacts(cv, '\\\\ ')}}\\par`,
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros, design }),
      headerWithPhoto(head, o),
      body(cv, o, complete(healthcare.sections), t => `\\cvsection{${t}}`),
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
  sections: ALL,
  design: {
    nameSize: 22, tracking: 0, sectionColor: 'text', ruleWidth: 0.5, ruleColor: 'black', headlineSize: 'normalsize', headlineColor: 'text',
  },
  render(cv, o) {
    const opts = { ...o, photo: false }
    const L = labels(opts)
    const design = ats.design
    const macros = sectionMacro(opts, design)
    // Aucune table : titre, puis organisation et dates sur une ligne de texte
    const exp = cv.experiences.map(e => [
      keep(o, 3),
      `\\textbf{${tex(e.role) || tex(e.organization)}}\\par`,
      [tex(e.organization), tex(e.location)].filter(Boolean).join(', ') + ([e.start, e.end].some(Boolean) ? ` \\hfill ${[tex(e.start), tex(e.end)].filter(Boolean).join(' -- ')}` : '') + '\\par',
      bullets(e.bullets),
    ].filter(Boolean).join('\n')).join(`\n\\vspace{${gap(o)}}\n`)
    const edu = cv.education.map(d => `${keep(o, 2)}\\textbf{${tex(d.degree) || tex(d.institution)}}\\par ${[tex(d.institution), tex(d.location)].filter(Boolean).join(', ')}${[d.start, d.end].some(Boolean) ? ` \\hfill ${[tex(d.start), tex(d.end)].filter(Boolean).join(' -- ')}` : ''}\\par${d.details ? ` ${tex(d.details)}\\par` : ''}`).join(`\n\\vspace{${gap(o)}}\n`)
    const skills = cv.skills.map(s => `${s.category ? `\\textbf{${tex(s.category)} :} ` : ''}${s.items.map(tex).join(', ')}\\par`).join('\n')
    const head = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{2pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{3pt}${contacts(cv, ' \\textbar{} ')}\\par`,
    ].filter(Boolean).join('\n')
    return [
      // Sobre par principe (lecture par les logiciels de recrutement) : graphite, sauf couleurs choisies dans « Design »
      preamble(cv, { ...opts, accent: '111827' }, { macros, design }),
      head,
      body(cv, opts, complete(ats.sections), t => `\\cvsection{${t}}`, { summary: L.summary }, { experience: exp, education: edu, skills }),
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
  sections: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'publications', 'languages', 'interests'],
  design: {
    nameSize: 24, sectionSize: 'large', sectionUpper: false, tracking: 0, sectionColor: 'text', ruleWidth: 0, headlineColor: 'text',
  },
  render(cv, o) {
    const design: Partial<TemplateDesign> = { ...creative.design, sectionBefore: o.compact ? 6 : 9 }
    const macros = [
      sectionMacro(o, design, '{\\color{accent}\\rule[-1.5pt]{3pt}{12pt}}\\hspace{7pt}'),
      '\\newcommand{\\cvtag}[1]{{\\setlength{\\fboxsep}{2.5pt}\\fcolorbox{accent!35}{accent!7}{\\small\\strut #1}}\\hspace{4pt plus 2pt}\\allowbreak}',
    ].join('\n')
    const inner = [
      `\\cvname{\\cvnamefont\\bfseries ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{3pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{6pt}{\\cvdetailfont ${contacts(cv, ' \\enspace\\textbar\\enspace ')}}\\par`,
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
      preamble(cv, o, { macros, design }),
      band,
      body(cv, o, complete(creative.sections), t => `\\cvsection{${t}}`, {}, { skills: tags }),
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
  sections: ['summary', 'education', 'publications', 'experience', 'projects', 'certifications', 'skills', 'languages', 'interests'],
  design: {
    nameSize: 22, sectionSize: 'large', sectionBold: false, tracking: 40, ruleWidth: 0.5, ruleColor: 'gray',
    headlineSize: 'normalsize', headlineItalic: true, headlineColor: 'text',
  },
  render(cv, o) {
    const L = labels(o)
    const design: Partial<TemplateDesign> = { ...academic.design, sectionBefore: o.compact ? 7 : 11 }
    const macros = sectionMacro(o, design)
    const center = !o.photo
    const head = [
      center ? '\\begin{center}' : '',
      `\\cvname{\\cvnamefont ${tex(cv.identity.fullName)}}\\par`,
      cv.identity.headline ? `\\vspace{4pt}{\\cvheadline ${tex(cv.identity.headline)}}\\par` : '',
      `\\vspace{4pt}{\\cvdetailfont ${contacts(cv, ' \\textbullet{} ')}}${center ? '' : '\\par'}`,
      center ? '\\end{center}' : '',
    ].filter(Boolean).join('\n')
    return [
      preamble(cv, o, { macros }),
      headerWithPhoto(head, o),
      body(cv, o, complete(academic.sections), t => `\\cvsection{${t}}`, { summary: L.researchInterests, experience: L.research }),
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


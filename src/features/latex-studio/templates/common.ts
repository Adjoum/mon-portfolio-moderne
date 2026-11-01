// src/features/latex-studio/templates/common.ts
// Briques communes des modèles : préambule paramétrable (police, taille, marges, couleur), nom
// toujours sur une ligne, coordonnées, sections et entrées qui ne laissent jamais un titre seul en
// bas de page. N'utilise que des paquets autorisés par latex-runner.
import type { CvData, CvExperience, CvEducation } from '../lib/cvData'
import type { TemplateOptions } from './types'
import { email, link, period, tex } from './escape'

export const LABELS = {
  fr: {
    summary: 'Profil', experience: 'Expérience professionnelle', education: 'Formation', skills: 'Compétences',
    projects: 'Projets', languages: 'Langues', certifications: 'Certifications', publications: 'Publications',
    interests: 'Centres d’intérêt', keySkills: 'Compétences clés', research: 'Recherche et enseignement',
    researchInterests: 'Thèmes de recherche', contact: 'Contact', technical: 'Compétences techniques',
    achievements: 'Réalisations',
  },
  en: {
    summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills',
    projects: 'Projects', languages: 'Languages', certifications: 'Certifications', publications: 'Publications',
    interests: 'Interests', keySkills: 'Core competencies', research: 'Research and teaching',
    researchInterests: 'Research interests', contact: 'Contact', technical: 'Technical skills',
    achievements: 'Achievements',
  },
} as const

export type Labels = { [K in keyof typeof LABELS.fr]: string }
export const labels = (o: TemplateOptions): Labels => LABELS[o.lang]

const MARGINS = { compact: '1.4cm', normal: '1.9cm', large: '2.4cm' } as const

const FONT_LINES: Record<TemplateOptions['font'], string> = {
  lmodern: '\\usepackage{lmodern}',
  helvet: '\\usepackage[scaled=0.92]{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}',
  charter: '\\usepackage{charter}',
  times: '\\usepackage{mathptmx}',
}

/** Préambule commun ; `extra` : paquets et macros propres au modèle */
export function preamble(cv: CvData, o: TemplateOptions, extra: { packages?: string[]; macros?: string } = {}): string {
  const margin = MARGINS[o.margins]
  const packages = ['microtype', 'xcolor', 'graphicx', 'enumitem', 'tabularx', 'array', 'needspace', 'csquotes', ...(extra.packages ?? [])]
  return [
    `\\documentclass[${o.size}pt,a4paper]{article}`,
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    `\\usepackage[${o.lang === 'en' ? 'english' : 'french'}]{babel}`,
    FONT_LINES[o.font],
    `\\usepackage[a4paper,top=${margin},bottom=${margin},left=${margin},right=${margin}]{geometry}`,
    ...[...new Set(packages)].map(p => `\\usepackage{${p}}`),
    '\\usepackage{hyperref}',
    `\\definecolor{accent}{HTML}{${/^[0-9A-Fa-f]{6}$/.test(o.accent) ? o.accent : '0B57D0'}}`,
    '\\definecolor{muted}{HTML}{5B6573}',
    '\\definecolor{rulegray}{HTML}{C9CFD8}',
    `\\hypersetup{colorlinks=true,urlcolor=accent,linkcolor=accent,pdftitle={${tex(cv.identity.fullName) || 'CV'}},pdfauthor={${tex(cv.identity.fullName)}}}`,
    '\\pagestyle{empty}',
    '\\setlength{\\parindent}{0pt}',
    `\\setlength{\\parskip}{${o.compact ? '2pt' : '4pt'}}`,
    // Lignes jamais trop pleines : de l'espace est ajouté plutôt que de déborder dans la marge
    '\\setlength{\\emergencystretch}{3em}',
    '\\setlength{\\tabcolsep}{0pt}',
    `\\setlist[itemize]{leftmargin=1.1em,label=\\textbullet,itemsep=${o.compact ? '0pt' : '1.5pt'},topsep=${o.compact ? '1pt' : '2pt'},parsep=0pt}`,
    // Nom réduit si nécessaire pour tenir sur une ligne, jamais coupé
    '\\newcommand{\\cvname}[1]{\\resizebox{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}{#1}}',
    extra.macros ?? '',
    '',
    '\\begin{document}',
  ].filter(line => line !== '').join('\n')
}

export const END = '\\end{document}\n'

/** Coordonnées sur une ligne, séparées par `sep` ; rien de fictif n'est ajouté */
export function contacts(cv: CvData, sep = ' \\enspace\\textbar\\enspace '): string {
  const id = cv.identity
  return [
    id.location && tex(id.location),
    id.email && email(id.email),
    id.phone && tex(id.phone),
    ...id.links.map(l => link(l.label, l.url)),
  ].filter(Boolean).join(sep)
}

export function bullets(items: string[]): string {
  const list = items.filter(Boolean)
  if (!list.length) return ''
  return `\\begin{itemize}\n${list.map(b => `  \\item ${tex(b)}`).join('\n')}\n\\end{itemize}`
}

/** Bloc d'en-tête avec photo à droite : les deux colonnes sont alignées par le haut */
export function headerWithPhoto(left: string, o: TemplateOptions): string {
  if (!o.photo) return left
  return [
    '\\begin{minipage}[t]{\\dimexpr\\linewidth-4.4cm\\relax}\\vspace{0pt}',
    left,
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{4cm}\\vspace{0pt}\\raggedleft',
    '%%PHOTO%%',
    '\\end{minipage}',
  ].join('\n')
}

/** Ligne d'entrée : titre à gauche (qui passe à la ligne si besoin), dates alignées à droite */
export function entryRow(left: string, right: string): string {
  return `\\begin{tabularx}{\\linewidth}{@{}X@{\\hspace{1em}}r@{}}${left} & ${right}\\end{tabularx}`
}

export function experienceEntry(e: CvExperience, o: TemplateOptions, style: { titleFirst?: boolean } = {}): string {
  const titleFirst = style.titleFirst ?? true
  const main = titleFirst ? tex(e.role) : tex(e.organization)
  const second = titleFirst ? tex(e.organization) : tex(e.role)
  const meta = [second, tex(e.location)].filter(Boolean).join(', ')
  return [
    '\\needspace{3\\baselineskip}',
    entryRow(`\\textbf{${main || second}}`, `\\textcolor{muted}{${period(e.start, e.end, o.lang)}}`),
    main && meta ? `\\\\[-1pt]{\\color{muted}${meta}}` : '',
    bullets(e.bullets),
  ].filter(Boolean).join('\n')
}

export function educationEntry(d: CvEducation, o: TemplateOptions): string {
  const meta = [tex(d.institution), tex(d.location)].filter(Boolean).join(', ')
  return [
    '\\needspace{2\\baselineskip}',
    entryRow(`\\textbf{${tex(d.degree) || tex(d.institution)}}`, `\\textcolor{muted}{${period(d.start, d.end, o.lang)}}`),
    d.degree && meta ? `\\\\[-1pt]{\\color{muted}${meta}}` : '',
    d.details ? `\\\\[1pt]${tex(d.details)}` : '',
  ].filter(Boolean).join('\n')
}

/** Compétences : « Catégorie : a, b, c », retrait suspendu, coupure de page possible */
export function skillsList(cv: CvData, o: TemplateOptions, labelWidth = '3.4cm'): string {
  if (!cv.skills.length) return ''
  const rows = cv.skills.map(s => s.category
    ? `\\item[{${tex(s.category)}}] ${s.items.map(tex).join(', ')}`
    : `\\item[] ${s.items.map(tex).join(', ')}`)
  return `\\begin{description}[leftmargin=${labelWidth},labelwidth=\\dimexpr${labelWidth}-0.6em\\relax,labelsep=0.6em,font=\\bfseries\\color{accent},itemsep=${o.compact ? '0pt' : '1pt'},topsep=1pt,parsep=0pt]\n${rows.join('\n')}\n\\end{description}`
}

export function projectEntry(p: CvData['projects'][number]): string {
  const title = p.link ? link(p.name || p.link, p.link) : tex(p.name)
  const tech = p.technologies.length ? ` \\textcolor{muted}{\\small(${p.technologies.map(tex).join(', ')})}` : ''
  return `\\needspace{2\\baselineskip}\\textbf{${title}}${tech}${p.description ? `\\\\\n${tex(p.description)}` : ''}\\par`
}

export function languagesLine(cv: CvData, sep = ' \\textbullet{} '): string {
  return cv.languages.map(l => (l.level ? `${tex(l.name)} (${tex(l.level)})` : tex(l.name))).join(sep)
}

export function certificationsList(cv: CvData): string {
  return bullets(cv.certifications.map(c => [c.name, c.issuer, c.date].filter(Boolean).join(' — ')))
}

/** Publications numérotées : auteurs, « titre », support, année */
export function publicationsList(cv: CvData): string {
  if (!cv.publications.length) return ''
  const items = cv.publications.map(p => `  \\item ${[p.authors && tex(p.authors), `\\enquote{${tex(p.title)}}`, p.venue && `\\textit{${tex(p.venue)}}`, tex(p.year)].filter(Boolean).join(', ')}.`)
  return `\\begin{enumerate}[label={[\\arabic*]},leftmargin=2.2em,itemsep=1pt,topsep=2pt]\n${items.join('\n')}\n\\end{enumerate}`
}

export const interestsLine = (cv: CvData) => cv.interests.map(tex).join(', ')

/**
 * Macro \cvsection : titre puis filet vertical (\hrule), qui n'occupe pas une ligne entière ;
 * \needspace garde le titre avec au moins trois lignes de contenu.
 */
export function sectionMacro(o: TemplateOptions, title: string, rule: string | null, space: { before?: number; after?: number } = {}): string {
  const before = space.before ?? (o.compact ? 5 : 8)
  const after = space.after ?? (o.compact ? 3 : 5)
  const ruleTex = rule ? `\\par\\nointerlineskip\\vspace{2.5pt}${rule}\\vspace{${after}pt}` : `\\par\\vspace{${after}pt}`
  return `\\newcommand{\\cvsection}[1]{\\par\\needspace{4\\baselineskip}\\vspace{${before}pt}${title}${ruleTex}}`
}

/** Section non vide seulement ; `heading` produit le titre */
export function section(heading: (title: string) => string, title: string, body: string): string {
  return body.trim() ? `${heading(title)}\n${body}\n` : ''
}

// src/features/latex-studio/templates/common.ts
// Briques communes des modèles : préambule paramétrable (police, taille, marges, couleur), nom
// toujours sur une ligne, coordonnées, sections et entrées qui ne laissent jamais un titre seul en
// bas de page. N'utilise que des paquets autorisés par latex-runner.
import type { CvData, CvExperience, CvEducation } from '../lib/cvData'
import type { TemplateOptions } from './types'
import { email, link, period, tex } from './escape'
import { DEFAULT_DESIGN, DENSITY, FONT_LINES, resolveTheme, sanitizeTheme, type ResolvedTheme, type TemplateDesign } from './theme'

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

/** Thème effectif d'un document : style du modèle, densité, réglages de l'utilisateur */
export const themeOf = (o: TemplateOptions, design: Partial<TemplateDesign> = {}): ResolvedTheme =>
  resolveTheme({ ...DEFAULT_DESIGN, ...design }, o.compact, o.theme)

/** Espace entre deux entrées d'une section */
export function gap(o: TemplateOptions): string {
  const t = sanitizeTheme(o.theme)
  return `${t.entryGap ?? DENSITY[t.density ?? (o.compact ? 'compact' : 'standard')].gap}pt`
}

/**
 * Entrées gardées d'un seul tenant sur une page (réglable). Sans cette option, l'entrée commence
 * tout de même un nouveau paragraphe, comme \needspace : elle ne s'accole jamais à la précédente.
 */
export const keep = (o: TemplateOptions, lines: number) => (sanitizeTheme(o.theme).keepEntries === false ? '\\par' : `\\needspace{${lines}\\baselineskip}`)

const hex = (value: string | null | undefined, fallback: string) => (value && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback)
const pt = (n: number) => `${Math.round(n * 100) / 100}pt`

/**
 * Variables de thème, en macros et longueurs LaTeX : les modèles n'emploient que ces noms.
 *   couleurs   accent, accent2 (secondaire), heading (titres), bodytext, muted, rulegray, cvrule (filets)
 *   polices    \cvnamefont, \cvheadline, \cvsectionfont, \cvtitletext{…}, \cvdetailfont
 *   espaces    \cvsectionbefore, \cvsectionafter, \cvrulewidth
 */
function themeMacros(o: TemplateOptions, r: ResolvedTheme): string[] {
  const d = r.design
  const c = r.colors
  const size = d.nameSize
  const titleText = d.sectionUpper
    ? d.tracking > 0 ? `\\textls[${d.tracking}]{\\MakeUppercase{#1}}` : '\\MakeUppercase{#1}'
    : d.tracking > 0 ? `\\textls[${d.tracking}]{#1}` : '#1'
  return [
    `\\definecolor{accent}{HTML}{${hex(o.accent, '0B57D0')}}`,
    c.secondary ? `\\definecolor{accent2}{HTML}{${c.secondary}}` : '\\colorlet{accent2}{accent}',
    `\\definecolor{bodytext}{HTML}{${hex(c.text, '000000')}}`,
    '\\definecolor{muted}{HTML}{5B6573}',
    '\\definecolor{rulegray}{HTML}{C9CFD8}',
    c.heading ? `\\definecolor{heading}{HTML}{${c.heading}}` : `\\colorlet{heading}{${d.sectionColor === 'text' ? 'bodytext' : 'accent'}}`,
    c.rule ? `\\definecolor{cvrule}{HTML}{${c.rule}}` : `\\colorlet{cvrule}{${d.ruleColor === 'accent' ? 'accent' : d.ruleColor === 'black' ? 'black' : 'rulegray'}}`,
    `\\newcommand{\\cvnamefont}{\\fontsize{${size}}{${Math.round(size * 1.17)}}\\selectfont}`,
    `\\newcommand{\\cvheadline}{${d.headlineColor === 'accent' ? '\\color{accent2}' : ''}\\${d.headlineSize}${d.headlineItalic ? '\\itshape' : ''}${d.headlineBold ? '\\bfseries' : ''}}`,
    `\\newcommand{\\cvsectionfont}{\\${d.sectionSize}${d.sectionBold ? '\\bfseries' : '\\mdseries'}}`,
    `\\newcommand{\\cvtitletext}[1]{${titleText}}`,
    `\\newcommand{\\cvdetailfont}{\\${r.detailSize}}`,
    `\\newlength{\\cvsectionbefore}\\setlength{\\cvsectionbefore}{${pt(r.sectionBefore)}}`,
    `\\newlength{\\cvsectionafter}\\setlength{\\cvsectionafter}{${pt(r.sectionAfter)}}`,
    `\\newlength{\\cvrulewidth}\\setlength{\\cvrulewidth}{${pt(d.ruleWidth)}}`,
  ]
}

/** Préambule commun ; `extra` : paquets, macros et style d'origine propres au modèle */
export function preamble(cv: CvData, o: TemplateOptions, extra: { packages?: string[]; macros?: string; design?: Partial<TemplateDesign> } = {}): string {
  const r = themeOf(o, extra.design)
  const paper = r.paper === 'letter' ? 'letterpaper' : 'a4paper'
  const mx = r.marginX ?? MARGINS[o.margins]
  const my = r.marginY ?? MARGINS[o.margins]
  const packages = ['microtype', 'xcolor', 'graphicx', 'enumitem', 'tabularx', 'array', 'needspace', 'csquotes', ...(extra.packages ?? [])]
  return [
    `\\documentclass[${o.size}pt,${paper}]{article}`,
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    `\\usepackage[${o.lang === 'en' ? 'english' : 'french'}]{babel}`,
    FONT_LINES[o.font] ?? FONT_LINES.lmodern,
    `\\usepackage[${paper},top=${my},bottom=${my},left=${mx},right=${mx}]{geometry}`,
    ...[...new Set(packages)].map(p => `\\usepackage{${p}}`),
    '\\usepackage{hyperref}',
    ...themeMacros(o, r),
    `\\hypersetup{colorlinks=true,urlcolor=accent,linkcolor=accent,pdftitle={${tex(cv.identity.fullName) || 'CV'}},pdfauthor={${tex(cv.identity.fullName)}}}`,
    '\\pagestyle{empty}',
    '\\setlength{\\parindent}{0pt}',
    `\\setlength{\\parskip}{${pt(r.parskip)}}`,
    r.lineSpread !== 1 ? `\\linespread{${r.lineSpread}}` : '',
    // Lignes jamais trop pleines : de l'espace est ajouté plutôt que de déborder dans la marge
    '\\setlength{\\emergencystretch}{3em}',
    '\\setlength{\\tabcolsep}{0pt}',
    `\\setlist[itemize]{leftmargin=1.1em,label=\\textbullet,itemsep=${pt(r.itemsep)},topsep=${pt(r.topsep)},parsep=0pt}`,
    // Nom réduit si nécessaire pour tenir sur une ligne, jamais coupé
    '\\newcommand{\\cvname}[1]{\\resizebox{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}{#1}}',
    extra.macros ?? '',
    '',
    '\\begin{document}',
    r.colors.text ? '\\color{bodytext}' : '',
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
    keep(o, 3),
    entryRow(`\\textbf{${main || second}}`, `\\textcolor{muted}{${period(e.start, e.end, o.lang)}}`),
    main && meta ? `\\\\[-1pt]{\\color{muted}${meta}}` : '',
    bullets(e.bullets),
  ].filter(Boolean).join('\n')
}

export function educationEntry(d: CvEducation, o: TemplateOptions): string {
  const meta = [tex(d.institution), tex(d.location)].filter(Boolean).join(', ')
  return [
    keep(o, 2),
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

export function projectEntry(p: CvData['projects'][number], o: TemplateOptions): string {
  const title = p.link ? link(p.name || p.link, p.link) : tex(p.name)
  const tech = p.technologies.length ? ` \\textcolor{muted}{\\small(${p.technologies.map(tex).join(', ')})}` : ''
  return `${keep(o, 2)}\\textbf{${title}}${tech}${p.description ? `\\\\\n${tex(p.description)}` : ''}\\par`
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
 * Macro \cvsection : titre (variables de thème) puis filet (\hrule), qui n'occupe pas une ligne
 * entière ; \needspace garde le titre avec au moins trois lignes de contenu.
 * `prefix` : ornement propre au modèle avant le titre (carré, barre…).
 */
export function sectionMacro(o: TemplateOptions, design: Partial<TemplateDesign>, prefix = ''): string {
  const r = themeOf(o, design)
  const title = `${prefix}{\\color{heading}\\cvsectionfont\\cvtitletext{#1}}`
  const aligned = r.sectionAlign === 'center' ? `{\\centering ${title}\\par}` : `${title}\\par`
  const rule = r.design.ruleWidth > 0 ? '\\nointerlineskip\\vspace{2.5pt}{\\color{cvrule}\\hrule height \\cvrulewidth}' : ''
  return `\\newcommand{\\cvsection}[1]{\\par\\needspace{4\\baselineskip}\\vspace{\\cvsectionbefore}${aligned}${rule}\\vspace{\\cvsectionafter}}`
}

/** Section non vide seulement ; `heading` produit le titre */
export function section(heading: (title: string) => string, title: string, body: string): string {
  return body.trim() ? `${heading(title)}\n${body}\n` : ''
}

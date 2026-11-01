// src/pages/CVBuilder/cvDesign.ts
// Couche de design commune aux 8 modèles du CV Generator, appliquée au HTML produit par chaque
// modèle : l'aperçu ET l'export PDF (impression du même HTML) reçoivent exactement les mêmes réglages.
//
// Principe (repris du studio LaTeX) : chaque réglage absent ou « du modèle » conserve le style
// d'origine du modèle ; un CV déjà créé s'affiche donc exactement comme avant.
// Les modèles exposent des repères sémantiques (classes cv-*) : nom, intitulé, section, titre de
// section, séparateur, entrée, en-tête, colonne, photo. Aucune valeur n'est insérée sans validation.

import type { DesignConfig, TemplateId } from './CVGeneratorPro_part1'
import { PALETTES as STUDIO_PALETTES } from '../../features/latex-studio/templates/theme'

// ── Réglages ────────────────────────────────────────────────────
export type PhotoShapeChoice = 'template' | 'circle' | 'square' | 'portrait' | 'rectangle'
export type SeparatorStyle = 'template' | 'none' | 'solid' | 'dashed' | 'dotted' | 'double'
export type TitleAlign = 'template' | 'left' | 'center' | 'right'

export const DESIGN_VERSION = 2

/** Valeurs par défaut : toutes « du modèle » */
export const DESIGN_DEFAULTS = {
  designVersion: DESIGN_VERSION,
  primaryColor: '#1e3a5f',
  accentColor: '#6fa3d0',
  fontFamily: 'Calibri,Segoe UI,Arial,sans-serif',
  spacing: 'normal',
  headerStyle: 'solid',
  showPhoto: true,
  showBars: true,
  photoShape: 'template',
  photoX: 50,
  photoY: 25,
  secondaryColor: null,
  titleColor: null,
  textColor: null,
  separatorColor: null,
  separatorStyle: 'template',
  separatorWidth: null,
  nameScale: 1,
  titleScale: 1,
  textScale: 1,
  lineHeight: 1,
  headingWeight: null,
  letterSpacing: null,
  titleAlign: 'template',
  marginMm: 0,
  sectionGap: 1,
  entryGap: 1,
  sidebarWidth: null,
  avoidBreaks: true,
  photoSize: null,
  photoBorder: null,
  photoBorderColor: null,
  photoRadius: null,
  photoZoom: 1,
} satisfies DesignConfig

/** Bornes de chaque réglage numérique (curseurs et validation) */
export const BOUNDS = {
  nameScale:     { min: 0.6, max: 1.6, step: 0.05 },
  titleScale:    { min: 0.7, max: 1.5, step: 0.05 },
  textScale:     { min: 0.8, max: 1.3, step: 0.025 },
  lineHeight:    { min: 0.8, max: 1.5, step: 0.05 },
  letterSpacing: { min: -0.05, max: 0.3, step: 0.01 },
  marginMm:      { min: 0, max: 25, step: 1 },
  sectionGap:    { min: 0.3, max: 2.5, step: 0.05 },
  entryGap:      { min: 0.2, max: 2.5, step: 0.05 },
  sidebarWidth:  { min: 150, max: 320, step: 5 },
  separatorWidth:{ min: 1, max: 6, step: 0.5 },
  photoSize:     { min: 50, max: 170, step: 2 },
  photoBorder:   { min: 0, max: 8, step: 1 },
  photoRadius:   { min: 0, max: 40, step: 1 },
  photoZoom:     { min: 1, max: 3, step: 0.05 },
  photoX:        { min: 0, max: 100, step: 1 },
  photoY:        { min: 0, max: 100, step: 1 },
} as const
type BoundKey = keyof typeof BOUNDS

export const HEADING_WEIGHTS = [400, 500, 600, 700, 800, 900] as const

/** Polices disponibles sur tous les systèmes courants (l'export imprime le même HTML) */
export const FONT_CHOICES = [
  { value: DESIGN_DEFAULTS.fontFamily,                                 label: 'Police du modèle' },
  { value: "Arial,'Helvetica Neue',Helvetica,sans-serif",              label: 'Arial / Helvetica (sobre)' },
  { value: "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",      label: 'Segoe UI / Roboto (moderne)' },
  { value: "Verdana,Geneva,sans-serif",                                label: 'Verdana (très lisible)' },
  { value: "'Trebuchet MS','Lucida Grande',sans-serif",                label: 'Trebuchet (dynamique)' },
  { value: "Georgia,'Times New Roman',serif",                          label: 'Georgia (élégante)' },
  { value: "'Palatino Linotype',Palatino,'Book Antiqua',serif",        label: 'Palatino (classique)' },
  { value: "Garamond,'EB Garamond','Times New Roman',serif",           label: 'Garamond (académique)' },
  { value: "'Times New Roman',Times,serif",                            label: 'Times (traditionnelle)' },
  { value: "'Courier New',Courier,monospace",                          label: 'Courier (technique)' },
] as const

/** Capacités de chaque modèle : un réglage sans objet est signalé, jamais inopérant en silence */
export interface TemplateCaps {
  header: boolean         // bandeau d'en-tête coloré (style d'en-tête)
  sidebar: number | null  // largeur d'origine de la colonne latérale (px)
  bars: boolean           // barres de niveau des compétences
  dark: boolean           // fond sombre : couleurs de texte conservées par défaut
  textColors: string[]    // couleurs du texte courant du modèle (remplacées par « Couleur du texte »)
  roleOn: 'primary' | 'white' | 'dark' // fond sous l'intitulé du poste (contraste de la couleur secondaire)
  styles: StyleTag[]
}
export type StyleTag = 'moderne' | 'classique' | 'academique' | 'creatif' | 'professionnel'
export const STYLE_TAGS: { id: StyleTag; label: string }[] = [
  { id: 'moderne', label: 'Moderne' },
  { id: 'classique', label: 'Classique' },
  { id: 'academique', label: 'Académique' },
  { id: 'creatif', label: 'Créatif' },
  { id: 'professionnel', label: 'Professionnel' },
]

export const TEMPLATE_CAPS: Record<TemplateId, TemplateCaps> = {
  'cascade':       { header: false, sidebar: 220, bars: true,  dark: false, textColors: ['#333', '#333333'], roleOn: 'primary', styles: ['professionnel', 'classique'] },
  'moderne':       { header: true,  sidebar: 200, bars: false, dark: false, textColors: ['#333', '#444'],    roleOn: 'primary', styles: ['moderne', 'professionnel'] },
  'classique':     { header: true,  sidebar: null, bars: false, dark: false, textColors: ['#333', '#444'],   roleOn: 'primary', styles: ['classique', 'professionnel'] },
  'stanford':      { header: false, sidebar: null, bars: false, dark: false, textColors: ['#222', '#333'],   roleOn: 'white', styles: ['academique', 'classique'] },
  'openai-dark':   { header: false, sidebar: 230, bars: false, dark: true,  textColors: ['#c9d1d9'],         roleOn: 'dark', styles: ['moderne', 'creatif'] },
  'amazon-bold':   { header: true,  sidebar: null, bars: false, dark: false, textColors: ['#333', '#444'],   roleOn: 'primary', styles: ['professionnel', 'creatif'] },
  'google-chip':   { header: true,  sidebar: 220, bars: false, dark: false, textColors: ['#333', '#444'],    roleOn: 'primary', styles: ['moderne', 'creatif'] },
  'faang-minimal': { header: false, sidebar: null, bars: false, dark: false, textColors: ['#222', '#333'],   roleOn: 'white', styles: ['classique', 'professionnel'] },
}

// ── Palettes ────────────────────────────────────────────────────
export interface DesignPalette { id: string; label: string; colors: Partial<DesignConfig> }

/**
 * Palettes complètes du studio LaTeX (mêmes teintes dans les deux outils). La couleur secondaire
 * (intitulé du poste) n'en fait pas partie : dans 6 modèles l'intitulé est posé sur un bandeau ou une
 * colonne colorée, dont le modèle a choisi la teinte lisible ; elle reste réglable à la main.
 */
export const DESIGN_PALETTES: DesignPalette[] = [
  { id: 'modele', label: 'Couleurs du modèle', colors: { primaryColor: DESIGN_DEFAULTS.primaryColor, accentColor: DESIGN_DEFAULTS.accentColor, secondaryColor: null, titleColor: null, textColor: null, separatorColor: null } },
  ...STUDIO_PALETTES.map(p => ({
    id: p.id,
    label: p.label,
    colors: {
      primaryColor: `#${p.accent}`.toLowerCase(),
      accentColor: `#${p.secondary}`.toLowerCase(),
      titleColor: `#${p.heading}`.toLowerCase(),
      textColor: `#${p.text}`.toLowerCase(),
      separatorColor: `#${p.rule}`.toLowerCase(),
    },
  })),
]

/** Couleurs par défaut : les modèles à palette propre (OpenAI Dark, Amazon) gardent la leur */
export const isTemplatePalette = (d: Pick<DesignConfig, 'primaryColor' | 'accentColor'>) =>
  d.primaryColor.toLowerCase() === DESIGN_DEFAULTS.primaryColor && d.accentColor.toLowerCase() === DESIGN_DEFAULTS.accentColor

// ── Validation ──────────────────────────────────────────────────
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** Saisie hexadécimale sécurisée : #abc ou #aabbcc, sinon null */
export function parseHex(raw: unknown): string | null {
  const value = String(raw ?? '').trim().toLowerCase()
  const withHash = value.startsWith('#') ? value : `#${value}`
  return HEX.test(withHash) ? withHash : null
}
const color = (raw: unknown): string | null => (raw === null || raw === undefined || raw === '' ? null : parseHex(raw))
const num = (key: BoundKey, raw: unknown, fallback: number): number => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(BOUNDS[key].max, Math.max(BOUNDS[key].min, n))
}
const optNum = (key: BoundKey, raw: unknown): number | null => (raw === null || raw === undefined || raw === '' ? null : num(key, raw, BOUNDS[key].min))
const oneOf = <T extends string>(raw: unknown, values: readonly T[], fallback: T): T => (values.includes(raw as T) ? (raw as T) : fallback)
const FONT_VALUES = new Set<string>(FONT_CHOICES.map(f => f.value))

/**
 * Design complet et valide à partir de n'importe quelle valeur (état enregistré, preset importé).
 * Designs enregistrés avant la version 2 : la forme de la photo n'avait aucun effet, elle reprend
 * donc la forme du modèle au lieu de changer brusquement le rendu.
 */
export function normalizeDesign(raw: unknown): DesignConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const legacy = r.designVersion !== DESIGN_VERSION
  const d = DESIGN_DEFAULTS
  return {
    designVersion: DESIGN_VERSION,
    primaryColor: color(r.primaryColor) ?? d.primaryColor,
    accentColor: color(r.accentColor) ?? d.accentColor,
    // Anciennes polices du panneau : conservées si elles existent encore, sinon police du modèle
    fontFamily: FONT_VALUES.has(String(r.fontFamily)) ? String(r.fontFamily) : legacyFont(r.fontFamily),
    spacing: oneOf(r.spacing, ['compact', 'normal', 'spacious'] as const, 'normal'),
    headerStyle: oneOf(r.headerStyle, ['solid', 'gradient', 'minimal'] as const, 'solid'),
    showPhoto: r.showPhoto !== false,
    showBars: r.showBars !== false,
    photoShape: legacy ? 'template' : oneOf(r.photoShape, ['template', 'circle', 'square', 'portrait', 'rectangle'] as const, 'template'),
    photoX: num('photoX', r.photoX, d.photoX),
    photoY: num('photoY', r.photoY, d.photoY),
    secondaryColor: color(r.secondaryColor),
    titleColor: color(r.titleColor),
    textColor: color(r.textColor),
    separatorColor: color(r.separatorColor),
    separatorStyle: oneOf(r.separatorStyle, ['template', 'none', 'solid', 'dashed', 'dotted', 'double'] as const, 'template'),
    separatorWidth: optNum('separatorWidth', r.separatorWidth),
    nameScale: num('nameScale', r.nameScale, 1),
    titleScale: num('titleScale', r.titleScale, 1),
    textScale: num('textScale', r.textScale, 1),
    lineHeight: num('lineHeight', r.lineHeight, 1),
    headingWeight: HEADING_WEIGHTS.includes(Number(r.headingWeight) as never) ? Number(r.headingWeight) : null,
    letterSpacing: optNum('letterSpacing', r.letterSpacing),
    titleAlign: oneOf(r.titleAlign, ['template', 'left', 'center', 'right'] as const, 'template'),
    marginMm: num('marginMm', r.marginMm, 0),
    sectionGap: num('sectionGap', r.sectionGap, 1),
    entryGap: num('entryGap', r.entryGap, 1),
    sidebarWidth: optNum('sidebarWidth', r.sidebarWidth),
    avoidBreaks: r.avoidBreaks !== false,
    photoSize: optNum('photoSize', r.photoSize),
    photoBorder: optNum('photoBorder', r.photoBorder),
    photoBorderColor: color(r.photoBorderColor),
    photoRadius: optNum('photoRadius', r.photoRadius),
    photoZoom: num('photoZoom', r.photoZoom, 1),
  }
}

function legacyFont(raw: unknown): string {
  const v = String(raw ?? '').toLowerCase()
  if (v.includes('georgia')) return "Georgia,'Times New Roman',serif"
  if (v.includes('palatino')) return "'Palatino Linotype',Palatino,'Book Antiqua',serif"
  if (v.includes('garamond')) return "Garamond,'EB Garamond','Times New Roman',serif"
  if (v.includes('courier')) return "'Courier New',Courier,monospace"
  if (v.includes('inter') || v.includes('helvetica')) return "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
  return DESIGN_DEFAULTS.fontFamily
}

// ── Contraste (avertissement d'accessibilité dans le panneau) ───
function luminance(hex: string): number {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
export const templateBackground = (id: TemplateId) => (TEMPLATE_CAPS[id].dark ? '#0d1117' : '#ffffff')
/** Fond réel sous l'intitulé du poste (bandeau, colonne ou page) */
export function roleBackground(d: DesignConfig, id: TemplateId): string {
  const on = TEMPLATE_CAPS[id].roleOn
  if (on === 'dark') return '#0d1117'
  if (on === 'white' || (TEMPLATE_CAPS[id].header && d.headerStyle === 'minimal')) return '#ffffff'
  if (id === 'amazon-bold' && isTemplatePalette(d)) return '#232f3e'
  return d.primaryColor
}

// ── Application au HTML d'un modèle ─────────────────────────────
const DENSITY_GAP = { compact: 0.8, normal: 1, spacious: 1.25 } as const
const PHOTO_RATIO: Record<Exclude<PhotoShapeChoice, 'template'>, number> = { circle: 1, square: 1, portrait: 4 / 3, rectangle: 3 / 4 }

/** Remplace dans chaque attribut style (jamais dans le texte du CV, échappé par les modèles) */
const mapStyles = (html: string, fn: (style: string) => string) =>
  html.replace(/ style="([^"]*)"/g, (_m, style: string) => ` style="${fn(style)}"`)

const scalePt = (css: string) => css.replace(/font-size:\s*([\d.]+)pt/g, 'font-size:calc($1pt * var(--cv-fs, 1))')
const scaleLineHeight = (css: string) => css.replace(/line-height:\s*([\d.]+)(?=\s*[;"}]|\s*$)/g, 'line-height:calc($1 * var(--cv-lh, 1))')

/** Marges verticales des balises portant une classe donnée, multipliées par une variable CSS */
function scaleTagMargins(html: string, cls: string, variable: string): string {
  const tag = new RegExp(`<([a-z0-9]+)([^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*)>`, 'g')
  return html.replace(tag, (whole: string) => whole.replace(/ style="([^"]*)"/, (_m, style: string) => {
    const scaled = style.replace(/(margin(?:-top|-bottom)?):\s*([^;]+)/g, (_d, prop: string, value: string) =>
      `${prop}:${value.replace(/(\d+(?:\.\d+)?)px/g, `calc($1px * var(${variable}, 1))`)}`)
    return ` style="${scaled}"`
  }))
}

/** Photo encadrée : forme, taille, bordure, arrondi, cadrage et zoom (ratio conservé) */
function framePhoto(html: string, d: DesignConfig): string {
  return html.replace(/<img src="(data:image\/[^"]+|https:\/\/[^"]+)" style="([^"]*)">/, (_m, src: string, style: string) => {
    const get = (prop: string) => new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(style)?.[1]?.trim()
    const width = parseFloat(get('width') ?? '100') || 100
    const height = parseFloat(get('height') ?? String(width)) || width
    const shape = d.photoShape as PhotoShapeChoice
    const w = shape === 'template' ? (d.photoSize ?? width) : (d.photoSize ?? width)
    const h = shape === 'template' ? (d.photoSize ? (d.photoSize * height) / width : height) : w * PHOTO_RATIO[shape]
    const radius = shape === 'circle' ? '50%'
      : d.photoRadius !== null && d.photoRadius !== undefined ? `${d.photoRadius}px`
      : shape === 'template' ? (get('border-radius') ?? '0') : '4px'
    const border = d.photoBorder !== null && d.photoBorder !== undefined
      ? (d.photoBorder > 0 ? `${d.photoBorder}px solid ${d.photoBorderColor ?? d.primaryColor}` : 'none')
      : (get('border') ?? 'none')
    const keep = ['display', 'margin', 'flex-shrink'].map(p => (get(p) ? `${p}:${get(p)};` : '')).join('')
    const frame = `${keep}${get('display') ? '' : 'display:inline-block;'}position:relative;overflow:hidden;box-sizing:border-box;width:${round(w)}px;height:${round(h)}px;border-radius:${radius};border:${border};flex-shrink:0;`
    const pos = `${d.photoX}% ${d.photoY}%`
    const img = `display:block;width:100%;height:100%;object-fit:cover;object-position:${pos};transform:scale(${d.photoZoom});transform-origin:${pos};`
    return `<span class="cv-photo-frame" style="${frame}"><img class="cv-photo" alt="" src="${src}" style="${img}"></span>`
  })
}
const round = (n: number) => Math.round(n * 10) / 10

/** CSS des réglages : seulement ceux qui s'écartent du modèle */
export function designCss(d: DesignConfig, id: TemplateId): string {
  const caps = TEMPLATE_CAPS[id]
  const density = DENSITY_GAP[d.spacing] ?? 1
  const rules: string[] = [
    `:root{--cv-fs:${d.textScale};--cv-lh:${d.lineHeight};--cv-sec:${round(d.sectionGap! * density * 100) / 100};--cv-entry:${round(d.entryGap! * density * 100) / 100};${d.sidebarWidth ? `--cv-side:${d.sidebarWidth}px;` : ''}}`,
    `.cv-name{--cv-fs:${d.nameScale}}`,
    `.cv-section-title{--cv-fs:${d.titleScale}}`,
  ]
  if (d.fontFamily !== DESIGN_DEFAULTS.fontFamily) rules.push(`body{font-family:${d.fontFamily} !important}`)
  if (d.headingWeight) rules.push(`.cv-name,.cv-section-title{font-weight:${d.headingWeight} !important}`)
  if (d.letterSpacing !== null && d.letterSpacing !== undefined) rules.push(`.cv-name,.cv-section-title{letter-spacing:${d.letterSpacing}em !important}`)
  if (d.titleAlign !== 'template') {
    const justify = d.titleAlign === 'left' ? 'flex-start' : d.titleAlign === 'right' ? 'flex-end' : 'center'
    rules.push(`.cv-section,.cv-section-title{text-align:${d.titleAlign} !important;justify-content:${justify} !important}`)
    if (d.titleAlign === 'left') rules.push('.cv-sep[data-sep="side"]:first-child{display:none !important}')
    if (d.titleAlign === 'right') rules.push('.cv-sep[data-sep="side"]:last-child{display:none !important}')
  }
  if (d.titleColor) rules.push(`.cv-section-title{color:${d.titleColor} !important}`)
  if (d.secondaryColor) rules.push(`.cv-role{color:${d.secondaryColor} !important;opacity:1 !important}`)

  // Séparateurs : filets sous les titres (border) ou traits (line / side)
  const sepColor = d.separatorColor
  const sepWidth = d.separatorWidth
  const sepStyle = d.separatorStyle as SeparatorStyle
  if (sepStyle === 'none') {
    rules.push('.cv-sep[data-sep="border"]{border-bottom:none !important}', '.cv-sep[data-sep="line"],.cv-sep[data-sep="side"]{display:none !important}')
  } else if (sepStyle !== 'template' || sepColor || sepWidth) {
    const w = sepWidth ?? (sepStyle === 'double' ? 3 : null)
    const border = [
      sepStyle !== 'template' ? `border-bottom-style:${sepStyle} !important;` : '',
      w ? `border-bottom-width:${w}px !important;` : '',
      sepColor ? `border-bottom-color:${sepColor} !important;` : '',
    ].join('')
    rules.push(`.cv-sep[data-sep="border"]{${border}}`)
    const lineColor = sepColor ? sepColor : 'currentColor'
    if (sepStyle !== 'template' && sepStyle !== 'solid') {
      rules.push(`.cv-sep[data-sep="line"],.cv-sep[data-sep="side"]{height:0 !important;background:none !important;border-top:${w ?? 1}px ${sepStyle} ${sepColor ?? lineColor} !important}`)
    } else {
      rules.push(`.cv-sep[data-sep="line"],.cv-sep[data-sep="side"]{${w ? `height:${w}px !important;` : ''}${sepColor ? `background:${sepColor} !important;` : ''}}`)
    }
    // Modèles sans séparateur : un filet est ajouté sous les titres dès qu'un style est choisi
    if (!SEPARATOR_TEMPLATES.has(id) && sepStyle !== 'template') {
      rules.push(`.cv-section-title{border-bottom:${w ?? 1.5}px ${sepStyle} ${sepColor ?? d.primaryColor} !important;padding-bottom:2px !important}`)
    }
  }

  // En-tête (modèles à bandeau)
  if (caps.header && d.headerStyle === 'gradient') rules.push(`.cv-header{background:linear-gradient(135deg,${d.primaryColor},${d.accentColor}) !important}`)
  if (caps.header && d.headerStyle === 'minimal') {
    rules.push(`.cv-header{background:transparent !important;border-bottom:2px solid ${d.primaryColor}}`,
      `.cv-header,.cv-header *:not(img){color:${d.primaryColor} !important}`,
      `.cv-header .cv-role{color:${d.secondaryColor ?? d.accentColor} !important}`)
  }

  // Sauts de page
  if (d.avoidBreaks) rules.push('.cv-entry{break-inside:avoid;page-break-inside:avoid}', '.cv-section-title,.cv-section{break-after:avoid;page-break-after:avoid}')

  // Marges du document : celles de chaque page imprimée, reproduites dans l'aperçu
  if (d.marginMm > 0) {
    rules.push(`@page{margin:${d.marginMm}mm}`, `@media screen{html{padding:${d.marginMm}mm;background:#fff}}`)
  }
  return rules.join('\n')
}

const SEPARATOR_TEMPLATES = new Set<TemplateId>(['cascade', 'classique', 'stanford', 'amazon-bold', 'google-chip', 'faang-minimal'])

/** Applique le design au HTML complet d'un modèle (aperçu et export identiques) */
export function applyDesignLayer(html: string, d: DesignConfig, id: TemplateId): string {
  let out = html
  // Nom : l'unique h1 de chaque modèle
  out = out.replace(/<h1 style=/, '<h1 class="cv-name" style=')
  // Couleur du texte courant (remplacement dans les styles uniquement)
  if (d.textColor) {
    // « color: » seul, jamais « background-color: » ni « border-color: »
    const swap = new RegExp(`(?<![\\w-])color:\\s*(?:${TEMPLATE_CAPS[id].textColors.join('|')})(?![0-9a-f])`, 'gi')
    out = mapStyles(out, s => s.replace(swap, `color:${d.textColor}`))
    out = out.replace(/(body\{[^}]*?)color:#222/, `$1color:${d.textColor}`)
  }
  out = mapStyles(out, s => scaleLineHeight(scalePt(s)))
  out = out.replace(/<style>([\s\S]*?)<\/style>/, (_m, css: string) => `<style>${scaleLineHeight(scalePt(css))}</style>`)
  out = scaleTagMargins(out, 'cv-section', '--cv-sec')
  out = scaleTagMargins(out, 'cv-entry', '--cv-entry')
  out = framePhoto(out, d)
  return out.replace('</head>', `<style id="cv-design">\n${designCss(d, id)}\n</style>\n</head>`)
}

/** Réglages actifs sans effet sur un modèle (annoncés au changement de modèle, jamais perdus) */
export function inapplicableSettings(d: DesignConfig, id: TemplateId): string[] {
  const caps = TEMPLATE_CAPS[id]
  const out: string[] = []
  if (!caps.header && d.headerStyle !== 'solid') out.push('style de l’en-tête')
  if (!caps.sidebar && d.sidebarWidth) out.push('largeur de la colonne latérale')
  if (!caps.bars && !d.showBars) out.push('barres de compétences')
  return out
}

// ── Presets enregistrés dans ce navigateur ──────────────────────
export const PRESETS_KEY = 'cvgenpro:design-presets:v1'
export interface DesignPreset { id: string; name: string; design: DesignConfig; savedAt: number }

export function loadPresets(storage: Pick<Storage, 'getItem'> = localStorage): DesignPreset[] {
  try {
    const raw = JSON.parse(storage.getItem(PRESETS_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(p => p && typeof p.name === 'string' && typeof p.id === 'string')
      .slice(0, 30)
      .map(p => ({ id: p.id, name: String(p.name).slice(0, 60), savedAt: Number(p.savedAt) || 0, design: normalizeDesign(p.design) }))
  } catch {
    return []
  }
}

export function savePresets(presets: DesignPreset[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(PRESETS_KEY, JSON.stringify(presets.slice(0, 30)))
}

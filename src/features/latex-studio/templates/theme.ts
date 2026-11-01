// src/features/latex-studio/templates/theme.ts
// Thème du document (P5) : variables centralisées, traduites en macros LaTeX par le préambule.
// Chaque modèle déclare son style par défaut (TemplateDesign) ; l'utilisateur ne change que des
// valeurs (ThemeOverrides), jamais le texte LaTeX lui-même. Toute valeur est bornée et validée :
// rien de ce qui vient de la session ou de l'interface n'entre dans le code sans contrôle.

/** Polices réellement installées dans latex-runner (vérifié en compilant : polices intégrées au PDF) */
export const FONT_CHOICES = [
  { id: 'lmodern',  label: 'Latin Modern (classique)',          kind: 'serif' },
  { id: 'charter',  label: 'Charter (élégante)',                kind: 'serif' },
  { id: 'times',    label: 'Times (sobre)',                     kind: 'serif' },
  { id: 'palatino', label: 'Palatino (raffinée)',               kind: 'serif' },
  { id: 'utopia',   label: 'Utopia (moderne)',                  kind: 'serif' },
  { id: 'bookman',  label: 'Bookman (chaleureuse)',             kind: 'serif' },
  { id: 'century',  label: 'Century Schoolbook (lisible)',      kind: 'serif' },
  { id: 'helvet',   label: 'Helvetica (sans empattement)',      kind: 'sans' },
  { id: 'avant',    label: 'Avant Garde (géométrique)',         kind: 'sans' },
  { id: 'lmsans',   label: 'Latin Modern Sans (sans empattement)', kind: 'sans' },
] as const
export type FontId = (typeof FONT_CHOICES)[number]['id']

/** Ligne(s) de préambule par police : paquets autorisés par le runner, sinon famille installée */
export const FONT_LINES: Record<FontId, string> = {
  lmodern:  '\\usepackage{lmodern}',
  charter:  '\\usepackage{charter}',
  times:    '\\usepackage{mathptmx}',
  palatino: '\\renewcommand{\\rmdefault}{ppl}',
  utopia:   '\\renewcommand{\\rmdefault}{put}',
  bookman:  '\\renewcommand{\\rmdefault}{pbk}',
  century:  '\\renewcommand{\\rmdefault}{pnc}',
  helvet:   '\\usepackage[scaled=0.92]{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}',
  avant:    '\\renewcommand{\\sfdefault}{pag}\n\\renewcommand{\\familydefault}{\\sfdefault}',
  lmsans:   '\\usepackage{lmodern}\n\\renewcommand{\\familydefault}{\\sfdefault}',
}

export type SizeStep = 'small' | 'normalsize' | 'large' | 'Large'
export const SIZE_STEPS: { id: SizeStep; label: string }[] = [
  { id: 'small', label: 'Petite' }, { id: 'normalsize', label: 'Normale' }, { id: 'large', label: 'Grande' }, { id: 'Large', label: 'Très grande' },
]
export type DetailStep = 'footnotesize' | 'small' | 'normalsize'
export const DETAIL_STEPS: { id: DetailStep; label: string }[] = [
  { id: 'footnotesize', label: 'Très petite' }, { id: 'small', label: 'Petite' }, { id: 'normalsize', label: 'Normale' },
]

export type Density = 'compact' | 'standard' | 'airy'
export type Separator = 'template' | 'none' | 'thin' | 'medium' | 'thick'
export type Align = 'left' | 'center'

/** Style d'origine d'un modèle : la référence de « Réinitialiser » */
export interface TemplateDesign {
  nameSize: number
  headlineSize: SizeStep
  headlineItalic: boolean
  headlineBold: boolean
  sectionSize: SizeStep
  sectionBold: boolean
  sectionUpper: boolean
  /** Couleur des titres de section par défaut (ornement éventuel toujours en couleur principale) */
  sectionColor: 'accent' | 'text'
  /** Espacement des lettres des titres (microtype \textls), 0 : aucun */
  tracking: number
  /** Épaisseur du filet sous les titres en pt, 0 : aucun */
  ruleWidth: number
  /** Couleur du filet par défaut */
  ruleColor: 'accent' | 'gray' | 'black'
  /** Couleur du titre professionnel par défaut */
  headlineColor: 'accent' | 'text'
  sectionBefore?: number
  sectionAfter?: number
  /** Part de la colonne latérale (modèles à deux colonnes) */
  columnRatio?: number
}

/** Réglages de l'utilisateur : chaque valeur absente reprend le style du modèle */
export interface ThemeOverrides {
  // Typographie
  nameSize?: number
  headlineSize?: SizeStep
  headlineItalic?: boolean
  sectionSize?: SizeStep
  sectionBold?: boolean
  sectionUpper?: boolean
  tracking?: number
  detailSize?: DetailStep
  lineSpread?: number
  paragraphSkip?: number
  // Mise en page
  paper?: 'a4' | 'letter'
  marginX?: number
  marginY?: number
  columnRatio?: number
  sectionBefore?: number
  sectionAfter?: number
  entryGap?: number
  sectionAlign?: Align
  separator?: Separator
  density?: Density
  keepEntries?: boolean
  // Couleurs (hexadécimal sans « # »)
  secondary?: string
  heading?: string
  text?: string
  rule?: string
}

export const DEFAULT_DESIGN: TemplateDesign = {
  nameSize: 24, headlineSize: 'large', headlineItalic: false, headlineBold: false,
  sectionSize: 'normalsize', sectionBold: true, sectionUpper: true, sectionColor: 'accent', tracking: 60,
  ruleWidth: 0.6, ruleColor: 'gray', headlineColor: 'accent',
}

export const BOUNDS = {
  nameSize: [14, 40], tracking: [0, 150], lineSpread: [0.9, 1.5], paragraphSkip: [0, 12],
  marginX: [1, 3.5], marginY: [1, 3.5], columnRatio: [0.22, 0.42], sectionBefore: [0, 24], sectionAfter: [0, 16], entryGap: [0, 20],
} as const

const HEX = /^[0-9A-Fa-f]{6}$/
const inSet = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v)
/** Nombre borné, arrondi au pas, sans artefact flottant (2.5 et non 2.5000000000000004) */
const num = (v: unknown, [min, max]: readonly [number, number], step = 0.01) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  return Number((Math.round(Math.min(max, Math.max(min, v)) / step) * step).toFixed(decimals))
}

/** Réglages relus (session, interface) : valeurs inconnues écartées, nombres bornés et arrondis */
export function sanitizeTheme(raw: unknown): ThemeOverrides {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ThemeOverrides = {
    nameSize: num(o.nameSize, BOUNDS.nameSize, 1),
    headlineSize: inSet(SIZE_STEPS.map(s => s.id), o.headlineSize) ? o.headlineSize : undefined,
    headlineItalic: typeof o.headlineItalic === 'boolean' ? o.headlineItalic : undefined,
    sectionSize: inSet(SIZE_STEPS.map(s => s.id), o.sectionSize) ? o.sectionSize : undefined,
    sectionBold: typeof o.sectionBold === 'boolean' ? o.sectionBold : undefined,
    sectionUpper: typeof o.sectionUpper === 'boolean' ? o.sectionUpper : undefined,
    tracking: num(o.tracking, BOUNDS.tracking, 5),
    detailSize: inSet(DETAIL_STEPS.map(s => s.id), o.detailSize) ? o.detailSize : undefined,
    lineSpread: num(o.lineSpread, BOUNDS.lineSpread, 0.05),
    paragraphSkip: num(o.paragraphSkip, BOUNDS.paragraphSkip, 0.5),
    paper: inSet(['a4', 'letter'] as const, o.paper) ? o.paper : undefined,
    marginX: num(o.marginX, BOUNDS.marginX, 0.1),
    marginY: num(o.marginY, BOUNDS.marginY, 0.1),
    columnRatio: num(o.columnRatio, BOUNDS.columnRatio, 0.01),
    sectionBefore: num(o.sectionBefore, BOUNDS.sectionBefore, 0.5),
    sectionAfter: num(o.sectionAfter, BOUNDS.sectionAfter, 0.5),
    entryGap: num(o.entryGap, BOUNDS.entryGap, 0.5),
    sectionAlign: inSet(['left', 'center'] as const, o.sectionAlign) ? o.sectionAlign : undefined,
    separator: inSet(['template', 'none', 'thin', 'medium', 'thick'] as const, o.separator) ? o.separator : undefined,
    density: inSet(['compact', 'standard', 'airy'] as const, o.density) ? o.density : undefined,
    keepEntries: typeof o.keepEntries === 'boolean' ? o.keepEntries : undefined,
    secondary: typeof o.secondary === 'string' && HEX.test(o.secondary) ? o.secondary.toUpperCase() : undefined,
    heading: typeof o.heading === 'string' && HEX.test(o.heading) ? o.heading.toUpperCase() : undefined,
    text: typeof o.text === 'string' && HEX.test(o.text) ? o.text.toUpperCase() : undefined,
    rule: typeof o.rule === 'string' && HEX.test(o.rule) ? o.rule.toUpperCase() : undefined,
  }
  // Clés absentes plutôt qu'indéfinies : rendu et comparaison stables
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ThemeOverrides
}

/** Espacements de chaque densité ; `compact` reprend l'ancien mode « resserré » des modèles */
export const DENSITY: Record<Density, { parskip: number; itemsep: number; topsep: number; before: number; after: number; gap: number; spread: number }> = {
  compact:  { parskip: 2, itemsep: 0,   topsep: 1, before: 5,  after: 3, gap: 4,  spread: 1 },
  standard: { parskip: 4, itemsep: 1.5, topsep: 2, before: 8,  after: 5, gap: 7,  spread: 1 },
  airy:     { parskip: 6, itemsep: 3,   topsep: 3, before: 12, after: 7, gap: 11, spread: 1.08 },
}

const SEPARATORS: Record<Exclude<Separator, 'template'>, number> = { none: 0, thin: 0.4, medium: 0.8, thick: 1.4 }

/** Valeurs effectives : style du modèle, densité, puis réglages de l'utilisateur */
export interface ResolvedTheme {
  design: TemplateDesign
  density: Density
  paper: 'a4' | 'letter'
  marginX: string | null
  marginY: string | null
  parskip: number
  itemsep: number
  topsep: number
  sectionBefore: number
  sectionAfter: number
  entryGap: number
  lineSpread: number
  detailSize: DetailStep
  sectionAlign: Align
  keepEntries: boolean
  columnRatio: number
  colors: { secondary: string | null; heading: string | null; text: string | null; rule: string | null }
}

export function resolveTheme(design: TemplateDesign, compact: boolean, raw: ThemeOverrides | undefined): ResolvedTheme {
  const t = sanitizeTheme(raw)
  const density: Density = t.density ?? (compact ? 'compact' : 'standard')
  const d = DENSITY[density]
  const merged: TemplateDesign = {
    ...design,
    nameSize: t.nameSize ?? design.nameSize,
    headlineSize: t.headlineSize ?? design.headlineSize,
    headlineItalic: t.headlineItalic ?? design.headlineItalic,
    sectionSize: t.sectionSize ?? design.sectionSize,
    sectionBold: t.sectionBold ?? design.sectionBold,
    sectionUpper: t.sectionUpper ?? design.sectionUpper,
    tracking: t.tracking ?? design.tracking,
    ruleWidth: !t.separator || t.separator === 'template' ? design.ruleWidth : SEPARATORS[t.separator],
  }
  return {
    design: merged,
    density,
    paper: t.paper ?? 'a4',
    marginX: t.marginX !== undefined ? `${t.marginX}cm` : null,
    marginY: t.marginY !== undefined ? `${t.marginY}cm` : null,
    parskip: t.paragraphSkip ?? d.parskip,
    itemsep: d.itemsep,
    topsep: d.topsep,
    sectionBefore: t.sectionBefore ?? (t.density ? d.before : design.sectionBefore ?? d.before),
    sectionAfter: t.sectionAfter ?? (t.density ? d.after : design.sectionAfter ?? d.after),
    entryGap: t.entryGap ?? d.gap,
    lineSpread: t.lineSpread ?? d.spread,
    detailSize: t.detailSize ?? 'small',
    sectionAlign: t.sectionAlign ?? 'left',
    keepEntries: t.keepEntries ?? true,
    columnRatio: t.columnRatio ?? design.columnRatio ?? 0.3,
    colors: { secondary: t.secondary ?? null, heading: t.heading ?? null, text: t.text ?? null, rule: t.rule ?? null },
  }
}

/** Palettes prédéfinies : couleur principale, secondaire, titres, texte, filets */
export const PALETTES: { id: string; label: string; accent: string; secondary: string; heading: string; text: string; rule: string }[] = [
  { id: 'ocean',    label: 'Océan',       accent: '0B57D0', secondary: '0E7490', heading: '0B57D0', text: '1F2937', rule: 'C9CFD8' },
  { id: 'marine',   label: 'Marine',      accent: '1F3A5F', secondary: '7A6A4F', heading: '1F3A5F', text: '1E293B', rule: 'B9C2CF' },
  { id: 'foret',    label: 'Forêt',       accent: '0F766E', secondary: '15803D', heading: '0F766E', text: '1F2937', rule: 'BFD5CF' },
  { id: 'bordeaux', label: 'Bordeaux',    accent: '7A1E2C', secondary: 'B45309', heading: '7A1E2C', text: '292524', rule: 'D6C7C2' },
  { id: 'indigo',   label: 'Indigo',      accent: '3730A3', secondary: '7C3AED', heading: '3730A3', text: '1E1B4B', rule: 'C7C9E6' },
  { id: 'graphite', label: 'Graphite',    accent: '111827', secondary: '4B5563', heading: '111827', text: '111827', rule: '9CA3AF' },
  { id: 'ambre',    label: 'Ambre',       accent: 'B45309', secondary: '92400E', heading: '92400E', text: '292524', rule: 'E7D3B5' },
]

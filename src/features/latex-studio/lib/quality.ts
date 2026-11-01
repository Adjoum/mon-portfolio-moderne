// src/features/latex-studio/lib/quality.ts
// Contrôle qualité automatique du rendu : débordements et caractères manquants signalés par TeX,
// puis analyse du PDF (position du texte sur chaque page) : marges, pages blanches, dernière page
// presque vide, nom coupé sur deux lignes, coordonnées ou textes d'exemple restés en place.
// Fonction pure : la même analyse sert dans le navigateur et dans les tests (pdf.js en Node).
import type { LatexWarning } from '../../../lib/latexCompile'
import { PLACEHOLDER_PATTERNS } from '../templates/sample'

export interface TextItem { str: string; x: number; y: number; width: number; height: number }
export interface PageText { width: number; height: number; items: TextItem[] }

export interface QualityIssue {
  severity: 'error' | 'warning' | 'info'
  code: 'overflow' | 'missing-char' | 'margin' | 'blank-page' | 'last-page' | 'name-split' | 'placeholder' | 'too-long'
  message: string
  line?: number
  page?: number
}

/** 1 cm en points PDF */
const CM = 72 / 2.54
const MIN_MARGIN = 0.8 * CM

export function analyzeQuality(pages: PageText[], warnings: LatexWarning[], expectedName = ''): QualityIssue[] {
  const issues: QualityIssue[] = []

  for (const w of warnings) {
    issues.push(w.kind === 'missing-char'
      ? { severity: 'error', code: 'missing-char', message: w.message }
      : { severity: 'warning', code: 'overflow', message: w.message, line: w.line })
  }

  pages.forEach((page, i) => {
    const text = page.items.filter(t => t.str.trim())
    if (!text.length) {
      issues.push({ severity: 'error', code: 'blank-page', message: `La page ${i + 1} est blanche.`, page: i + 1 })
      return
    }
    // Texte hors des marges ou coupé au bord de la page
    const outside = text.filter(t => t.x < MIN_MARGIN || t.x + t.width > page.width - MIN_MARGIN + 1 || t.y < MIN_MARGIN - t.height || t.y + t.height > page.height - MIN_MARGIN / 2)
    if (outside.length) {
      issues.push({ severity: 'warning', code: 'margin', page: i + 1, message: `Page ${i + 1} : ${outside.length} élément(s) trop près du bord ou hors de la page (« ${outside[0].str.trim().slice(0, 40)} »).` })
    }
  })

  // Dernière page presque vide : moins de 12 % de la hauteur utilisée
  if (pages.length > 1) {
    const last = pages[pages.length - 1]
    const ys = last.items.filter(t => t.str.trim()).map(t => t.y)
    if (ys.length) {
      const used = (Math.max(...ys) - Math.min(...ys)) / last.height
      if (used < 0.12) issues.push({ severity: 'info', code: 'last-page', page: pages.length, message: `La dernière page ne contient que quelques lignes : resserrez la mise en page (réglage « compact », marges, taille du texte) pour tenir sur ${pages.length - 1} page(s).` })
    }
  }
  if (pages.length > 3) issues.push({ severity: 'info', code: 'too-long', message: `${pages.length} pages : au-delà de deux pages, seuls les CV académiques sont habituellement aussi longs.` })

  // Nom : le texte le plus grand de la première page doit tenir sur une seule ligne
  const first = pages[0]?.items.filter(t => t.str.trim()) ?? []
  if (first.length) {
    const biggest = Math.max(...first.map(t => t.height))
    const nameItems = first.filter(t => t.height >= biggest * 0.9)
    const lines = new Set(nameItems.map(t => Math.round(t.y / (biggest * 0.5))))
    const nameText = nameItems.map(t => t.str).join(' ')
    const hyphenated = /\w-\s*$/.test(nameItems[0]?.str ?? '') && nameItems.length > 1
    if (lines.size > 1 || hyphenated) issues.push({ severity: 'error', code: 'name-split', page: 1, message: `Le nom est coupé sur ${lines.size} lignes (« ${nameText.slice(0, 50)} ») : il doit tenir sur une seule ligne.` })
    // Comparaison sans casse ni espaces : un nom en capitales espacées (interlettrage) reste reconnu
    const squeeze = (v: string) => v.toLocaleLowerCase('fr').replace(/\s+/g, '')
    if (expectedName.trim() && !squeeze(first.map(t => t.str).join('')).includes(squeeze(expectedName))) {
      issues.push({ severity: 'info', code: 'name-split', page: 1, message: 'Le nom saisi n’apparaît pas d’un seul tenant en première page.' })
    }
  }

  const all = pages.flatMap(p => p.items.map(t => t.str)).join(' ')
  for (const { re, label } of PLACEHOLDER_PATTERNS) {
    if (re.test(all)) issues.push({ severity: 'warning', code: 'placeholder', message: `Contenu d’exemple ou fictif encore présent : ${label}. Remplacez-le par vos informations (ou supprimez-le).` })
  }
  return issues
}

/** Texte positionné de chaque page, à partir d'un document pdf.js déjà ouvert */
export async function extractPageText(doc: { numPages: number; getPage(n: number): Promise<PdfPageLike> }, maxPages = 10): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    pages.push({
      width: viewport.width,
      height: viewport.height,
      items: content.items.flatMap(item => ('str' in item && 'transform' in item)
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: Math.abs(item.transform[3]) || item.height }]
        : []),
    })
  }
  return pages
}

interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number }
  getTextContent(): Promise<{ items: ({ str: string; transform: number[]; width: number; height: number } | object)[] }>
}

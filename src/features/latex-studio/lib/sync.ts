// Synchronisation PDF ↔ code LaTeX (P4), sans modifier latex-runner.
// Chaque ligne du code donne son texte visible (commandes retirées) ; chaque ligne du PDF donne son
// texte et sa position (pdf.js). Une ligne du PDF est rattachée à la ligne du code qui contient son
// texte ; un même texte présent deux fois (titre « Data Analyst » et poste « Data Analyst ») est
// départagé par le voisinage. Les modèles du studio écrivent une entrée, une puce ou un titre par
// ligne : la correspondance est exacte à la ligne. Un code importé suit la même règle (repli).
// Lecture seule : aucun lien, aucune annotation ni aucun script du PDF n'est exécuté.
import type { PageText } from './quality'

/** Arguments de mise en forme (non affichés) de chaque commande ; les arguments suivants sont du texte */
const FORMAT_ARGS: Record<string, number> = {
  end: 1, hspace: 1, vspace: 1, setlength: 2, addtolength: 2, needspace: 1, includegraphics: 1, color: 1, definecolor: 3,
  colorlet: 2, usepackage: 1, documentclass: 1, hypersetup: 1, newcommand: 2, renewcommand: 2, providecommand: 2,
  newlength: 1, fontsize: 2, rule: 2, setlist: 1, titleformat: 5, titlespacing: 4, pagestyle: 1, thispagestyle: 1,
  geometry: 1, linespread: 1, label: 1, ref: 1, pageref: 1, columnratio: 1, setcolumnwidth: 1, newcounter: 1,
  setcounter: 2, stepcounter: 1, hyphenation: 1, urlstyle: 1, raisebox: 1, textcolor: 1, href: 1, colorbox: 1,
  fcolorbox: 2, hypertarget: 1, parbox: 1, resizebox: 2, scalebox: 1, url: 0, switchcolumn: 0,
}
/** Environnements dont les premiers arguments sont de la mise en forme */
const ENV_ARGS: Record<string, number> = { tabularx: 2, 'tabular*': 2, tabular: 1, minipage: 1, paracol: 1, multicols: 1, adjustwidth: 2, wrapfigure: 2 }

/** Texte visible approximatif d'une ligne de LaTeX */
export function latexToText(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  const skipGroup = (open: string, close: string) => {
    if (src[i] !== open) return false
    let depth = 0
    for (; i < n; i++) {
      if (src[i] === '\\') { i++; continue }
      if (src[i] === open) depth++
      else if (src[i] === close && --depth === 0) { i++; return true }
    }
    return true
  }
  const skipSpaces = () => { while (src[i] === ' ' || src[i] === '\t') i++ }
  while (i < n) {
    const c = src[i]
    if (c === '%') break
    if (c === '\\') {
      const next = src[i + 1] ?? ''
      if (next === '\\') { out += ' '; i += 2; skipSpaces(); skipGroup('[', ']'); continue }
      if (/[&%$#_{}]/.test(next)) { out += next; i += 2; continue }
      if (!/[A-Za-z@]/.test(next)) { out += ' '; i += 2; continue }
      let j = i + 1
      while (j < n && /[A-Za-z@]/.test(src[j])) j++
      const name = src.slice(i + 1, j)
      i = j
      if (src[i] === '*') i++
      const skipArgs = (count: number) => {
        for (let k = 0; k < count; k++) {
          skipSpaces()
          while (src[i] === '[') { skipGroup('[', ']'); skipSpaces() }
          if (!skipGroup('{', '}')) break
        }
        skipSpaces()
        while (src[i] === '[') { skipGroup('[', ']'); skipSpaces() }
      }
      if (name === 'begin') {
        // \begin{nom}[options]{arguments de mise en forme}
        skipSpaces()
        const close = src.indexOf('}', i)
        const env = src[i] === '{' && close > i ? src.slice(i + 1, close) : ''
        skipArgs(1)
        skipArgs(ENV_ARGS[env] ?? 0)
      } else {
        const count = FORMAT_ARGS[name] ?? 0
        // Options collées (\textls[60]{…}) ; les accolades suivantes sont du texte
        if (count) skipArgs(count)
        else while (src[i] === '[') skipGroup('[', ']')
      }
      out += ' '
      continue
    }
    if (c === '{' || c === '}' || c === '$') { i++; continue }
    if (c === '~' || c === '&') { out += ' '; i++; continue }
    out += c
    i++
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Forme comparable : sans accents, ligatures ni espaces, en minuscules, lettres et chiffres seulement */
export function norm(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface Segment { page: number; text: string; ns: string; x0: number; x1: number; top: number; bottom: number }

/** Lignes du PDF, coupées aux grands blancs (colonnes, dates alignées à droite) ; positions depuis le haut de la page */
export function pdfSegments(pages: PageText[]): Segment[] {
  const segments: Segment[] = []
  pages.forEach((p, index) => {
    const items = p.items.filter(it => it.str.length > 0).map(it => ({ ...it, h: it.height || 10 }))
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: (typeof items)[] = []
    for (const it of items) {
      const line = lines.find(l => Math.abs(l[0].y - it.y) < Math.max(1.5, 0.4 * Math.min(l[0].h, it.h)))
      if (line) line.push(it)
      else lines.push([it])
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x)
      let current: Segment | null = null
      let end = 0
      for (const it of line) {
        const gap = it.x - end
        // Blanc nettement plus large qu'une espace : autre colonne, ou date alignée à droite
        if (!current || gap > Math.max(7, 0.9 * it.h)) {
          if (current?.ns) segments.push(current)
          current = { page: index + 1, text: '', ns: '', x0: it.x, x1: it.x, top: p.height - (it.y + it.h), bottom: p.height - it.y + 0.25 * it.h }
        }
        current.text += (current.text && gap > 0.15 * it.h && !current.text.endsWith(' ') ? ' ' : '') + it.str
        current.ns = norm(current.text)
        current.x1 = Math.max(current.x1, it.x + it.width)
        current.top = Math.min(current.top, p.height - (it.y + it.h))
        current.bottom = Math.max(current.bottom, p.height - it.y + 0.25 * it.h)
        end = it.x + it.width
      }
      if (current?.ns) segments.push(current)
    }
  })
  // Ordre de lecture : page, puis de haut en bas, puis de gauche à droite
  return segments.sort((a, b) => a.page - b.page || a.top - b.top || a.x0 - b.x0)
}

export interface CodeText { line: number; text: string; ns: string }

/** Lignes du corps du document qui affichent du texte (le préambule n'affiche rien) */
export function codeTexts(code: string): CodeText[] {
  const lines = code.split('\n')
  const start = lines.findIndex(l => /\\begin\{document\}/.test(l))
  const out: CodeText[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*%/.test(lines[i])) continue
    const text = latexToText(lines[i])
    const ns = norm(text)
    if (ns.length >= 2) out.push({ line: i + 1, text, ns })
  }
  return out
}

export interface OutlineItem { line: number; title: string }

/** Plan du document : titres de section, dans l'ordre du code */
export function outline(code: string): OutlineItem[] {
  const items: OutlineItem[] = []
  code.split('\n').forEach((l, i) => {
    const m = /\\(?:cvsection|sidesection|section|subsection)\*?\s*\{(.*)\}\s*$/.exec(l) ?? /\\(?:cvsection|sidesection|section|subsection)\*?\s*\{([^}]*)\}/.exec(l)
    if (m && !/\\newcommand|\\renewcommand|\\titleformat/.test(l)) {
      const title = latexToText(m[1])
      if (title) items.push({ line: i + 1, title })
    }
  })
  return items
}

export interface SyncMap {
  segments: Segment[]
  /** Ligne du code principale de chaque zone (null : texte sans correspondance sûre) */
  lineOf: (number | null)[]
  /** Lignes du code présentes dans chaque zone, avec leur étendue horizontale (fractions de la zone) */
  parts: SyncPart[]
  pageSizes: { width: number; height: number }[]
}

export interface SyncPart { seg: number; line: number; from: number; to: number }

/** Zone rectangulaire du PDF, en points depuis le haut de la page */
export interface SyncRect { page: number; x0: number; x1: number; top: number; bottom: number }

/** Mots comparables, séparés par une espace (limites de mots conservées) */
const words = (text: string) => ` ${text.split(/[\s\u00a0\u202f]+/).map(norm).filter(Boolean).join(' ')} `

/**
 * Lien entre une zone du PDF et une ligne du code : 3 texte identique, 2 mots entiers contenus,
 * 1 simple fragment (mot coupé en fin de ligne), moins de 1 : ligne du code incluse dans la zone.
 */
function relation(s: Segment & { w: string }, c: CodeText & { w: string }): number {
  if (s.ns.length < 2) return 0
  if (c.ns === s.ns) return 3
  if (c.ns.includes(s.ns)) return c.w.includes(s.w) ? 2 : 1
  if (c.ns.length >= 3 && s.ns.includes(c.ns)) return 0.5 * (c.ns.length / s.ns.length)
  return 0
}

/** Correspondance des zones du PDF avec les lignes du code qui les produisent */
export function buildSync(code: string, pages: PageText[]): SyncMap {
  const segments = pdfSegments(pages)
  const texts = codeTexts(code).map(c => ({ ...c, w: words(c.text) }))
  const inside: { line: number; ns: string; rel: number }[][] = segments.map(() => [])
  const candidates = segments.map((seg, k) => {
    const s = { ...seg, w: words(seg.text) }
    const all = texts.map(c => ({ line: c.line, ns: c.ns, rel: relation(s, c) })).filter(x => x.rel > 0)
    // Une ligne qui contient toute la zone l'emporte sur les lignes seulement incluses dans la zone
    const containing = all.filter(x => x.rel >= 1)
    if (containing.length) return containing
    inside[k] = all
    const best = Math.max(0, ...all.map(x => x.rel))
    return all.filter(x => x.rel >= best - 0.05)
  })
  const lineOf: (number | null)[] = candidates.map(c => (c.length === 1 ? c[0].line : null))

  // Textes répétés, dans l'ordre de lecture : d'abord la ligne d'une zone voisine sur la même ligne du PDF
  // (poste et dates d'une même entrée), puis le lien le plus fort, puis la ligne la plus proche des voisines
  const sameRow = (a: Segment, b: Segment) => a.page === b.page && Math.abs(a.top - b.top) < 3
  const sameColumn = (a: Segment, b: Segment) => a.x0 < b.x1 && b.x0 < a.x1
  for (let k = 0; k < segments.length; k++) {
    if (lineOf[k] !== null || candidates[k].length === 0) continue
    const lines = candidates[k].map(c => c.line)
    const row = segments.flatMap((seg, j) => (j !== k && lineOf[j] !== null && lines.includes(lineOf[j]!) && sameRow(seg, segments[k]) ? [lineOf[j]!] : []))
    if (row.length) { lineOf[k] = row[0]; continue }
    const strongest = Math.max(...candidates[k].map(c => c.rel))
    const pool = candidates[k].filter(c => c.rel === strongest).map(c => c.line)
    if (pool.length === 1) { lineOf[k] = pool[0]; continue }
    let anchor: number | null = null
    let after = true
    // Voisine précédente dans la même colonne (deux colonnes : la lecture alterne entre elles), sinon la précédente
    for (let j = k - 1; j >= 0 && anchor === null; j--) if (lineOf[j] !== null && sameColumn(segments[j], segments[k])) anchor = lineOf[j]
    for (let j = k - 1; j >= 0 && anchor === null; j--) if (lineOf[j] !== null) anchor = lineOf[j]
    if (anchor === null) {
      after = false
      for (let j = k + 1; j < segments.length && anchor === null; j++) if (lineOf[j] !== null) anchor = lineOf[j]
    }
    lineOf[k] = anchor === null ? pool[0] : pool.reduce((best, line) => {
      const d = (l: number) => Math.abs(l - anchor!) + (after ? (l < anchor! ? 0.5 : 0) : (l > anchor! ? 0.5 : 0))
      return d(line) < d(best) ? line : best
    })
  }

  // Étendue de chaque ligne dans sa zone : toute la zone, ou la portion d'une zone partagée par plusieurs
  // lignes du code (liens de contact écrits sur plusieurs lignes, étiquettes de compétences)
  const parts: SyncPart[] = []
  segments.forEach((s, k) => {
    if (!inside[k].length) {
      if (lineOf[k] !== null) parts.push({ seg: k, line: lineOf[k]!, from: 0, to: 1 })
      return
    }
    let cursor = 0
    const placed: SyncPart[] = []
    for (const c of [...inside[k]].sort((a, b) => a.line - b.line)) {
      const next = s.ns.indexOf(c.ns, cursor)
      const at = next >= 0 ? next : s.ns.indexOf(c.ns)
      if (at < 0 || placed.some(p => p.line === c.line)) continue
      placed.push({ seg: k, line: c.line, from: at / s.ns.length, to: (at + c.ns.length) / s.ns.length })
      if (at >= cursor) cursor = at + c.ns.length
    }
    placed.sort((a, b) => a.from - b.from)
    if (placed.length) lineOf[k] = placed[0].line
    parts.push(...placed)
  })
  return { segments, lineOf, parts, pageSizes: pages.map(p => ({ width: p.width, height: p.height })) }
}

const rectOf = (map: SyncMap, p: SyncPart): SyncRect => {
  const s = map.segments[p.seg]
  const w = s.x1 - s.x0
  return { page: s.page, x0: s.x0 + p.from * w, x1: s.x0 + p.to * w, top: s.top, bottom: s.bottom }
}

/** Ligne du code sous un point du PDF (coordonnées en points, depuis le haut de la page) */
export function lineAt(map: SyncMap, page: number, x: number, y: number): number | null {
  let best: { line: number; d: number } | null = null
  for (const part of map.parts) {
    const r = rectOf(map, part)
    if (r.page !== page) continue
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0
    const d = dy * 3 + dx
    if (dy < 30 && (!best || d < best.d)) best = { line: part.line, d }
  }
  return best?.line ?? null
}

/** Zones du PDF produites par une ligne du code ; à défaut, par la ligne de texte la plus proche après elle */
export function rectsForLine(map: SyncMap, line: number): SyncRect[] {
  const at = (l: number) => map.parts.filter(p => p.line === l).map(p => rectOf(map, p))
  for (let d = 0; d <= 25; d++) {
    const found = at(line + d)
    if (found.length) return found
  }
  for (let d = 1; d <= 10; d++) {
    const found = at(line - d)
    if (found.length) return found
  }
  return []
}

/** Lignes du code qui produisent du texte dans le PDF */
export const syncedLines = (map: SyncMap) => new Set(map.parts.map(p => p.line))

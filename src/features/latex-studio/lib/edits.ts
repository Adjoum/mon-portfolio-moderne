// src/features/latex-studio/lib/edits.ts
// Modifications de lignes proposées par latex.fix : revalidées dans le navigateur contre le code
// EXACT envoyé (instantané), appliquées seulement après accord de l'utilisateur.

export interface LineEdit { start: number; end: number; replacement: string }

export interface FixProposal {
  /** Code envoyé à l'IA : la proposition ne s'applique qu'à lui */
  base: string
  edits: LineEdit[]
  explanation: string
}

export interface Hunk {
  /** Lignes de contexte avant / après (non modifiées), avec leur numéro */
  before: { n: number; text: string }[]
  removed: { n: number; text: string }[]
  added: string[]
  after: { n: number; text: string }[]
}

export class EditError extends Error {}

const splitLines = (code: string) => code.split('\n')

/** Vérifie les modifications : lignes existantes, ordre croissant, aucun chevauchement */
export function validateEdits(code: string, edits: unknown): LineEdit[] {
  if (!Array.isArray(edits) || edits.length > 20) throw new EditError('Proposition invalide.')
  const count = splitLines(code).length
  const list = edits.map(e => {
    const { start, end, replacement } = (e ?? {}) as Record<string, unknown>
    if (!Number.isInteger(start) || !Number.isInteger(end) || typeof replacement !== 'string') throw new EditError('Proposition invalide.')
    const s = start as number
    const en = end as number
    if (s < 1 || s > count + 1 || en < s - 1 || en > count) throw new EditError('La proposition vise des lignes absentes du document.')
    return { start: s, end: en, replacement }
  }).sort((a, b) => a.start - b.start || a.end - b.end)
  for (let i = 1; i < list.length; i++) {
    if (list[i].start <= list[i - 1].end) throw new EditError('Modifications qui se chevauchent.')
  }
  return list
}

/** Applique les modifications (de la fin vers le début, pour garder les numéros de ligne) */
export function applyEdits(code: string, edits: LineEdit[]): string {
  const lines = splitLines(code)
  for (const e of [...validateEdits(code, edits)].reverse()) {
    const replacement = e.replacement === '' ? [] : e.replacement.split('\n')
    lines.splice(e.start - 1, e.end - e.start + 1, ...replacement)
  }
  return lines.join('\n')
}

/** Blocs à afficher : lignes retirées, lignes ajoutées et deux lignes de contexte */
export function hunks(code: string, edits: LineEdit[], context = 2): Hunk[] {
  const lines = splitLines(code)
  const at = (n: number) => ({ n, text: lines[n - 1] ?? '' })
  return validateEdits(code, edits).map(e => {
    const before = []
    for (let n = Math.max(1, e.start - context); n < e.start; n++) before.push(at(n))
    const removed = []
    for (let n = e.start; n <= e.end; n++) removed.push(at(n))
    const after = []
    for (let n = e.end + 1; n <= Math.min(lines.length, e.end + context); n++) after.push(at(n))
    return { before, removed, added: e.replacement === '' ? [] : e.replacement.split('\n'), after }
  })
}

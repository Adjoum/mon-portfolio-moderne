// src/features/latex-studio/lib/fix.ts
// Correction des erreurs de compilation par l'IA (latex.fix) : deux tentatives au plus par série
// d'erreurs, déclenchées par l'utilisateur, jamais en boucle automatique.

import { runAiFeature } from '../../../lib/aiClient'
import type { LatexCompileDetail, LatexCompileError } from '../../../lib/latexCompile'
import { validateEdits, type FixProposal } from './edits'

export const MAX_FIX_ATTEMPTS = 2

export async function requestFix(code: string, errors: LatexCompileDetail[], attempt: 1 | 2): Promise<FixProposal> {
  const content = await runAiFeature('latex.fix', {
    code,
    errors: errors.slice(0, 5).map(e => ({ line: e.line, message: e.message, context: e.context })),
    attempt,
  })
  let parsed: { edits?: unknown; explanation?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Réponse de correction illisible.')
  }
  return {
    base: code,
    edits: validateEdits(code, parsed.edits),
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation.slice(0, 600) : '',
  }
}

/** Erreurs qu'une modification du code peut résoudre (pas les quotas ni les pannes) */
export function isFixable(error: LatexCompileError): boolean {
  return ['LATEX_COMPILE_ERROR', 'LATEX_FORBIDDEN_COMMAND', 'LATEX_PACKAGE_NOT_ALLOWED', 'LATEX_CLASS_NOT_ALLOWED', 'LATEX_INVALID_SOURCE'].includes(error.code)
}


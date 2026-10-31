// Erreurs de compilation : message, lignes cliquables, et « Corriger l'erreur avec l'IA »
// (deux tentatives au plus par série d'erreurs, chacune déclenchée par l'utilisateur).
import type { LatexCompileError } from '../../../lib/latexCompile'
import { btn, btnPrimary } from './ui'
import { isFixable } from '../lib/fix'

export interface FixState {
  /** latex.fix activée dans le centre IA */
  available: boolean
  attempts: number
  max: number
  busy: boolean
  message: string | null
  onFix: () => void
}

export function ErrorPanel({ error, hasPdf, onGoToLine, fix, onUndo, canUndo }: {
  error: LatexCompileError
  hasPdf: boolean
  onGoToLine: (line: number) => void
  fix: FixState
  onUndo: () => void
  canUndo: boolean
}) {
  const warning = error.throttled || error.code === 'LATEX_BUSY'
  const fixable = isFixable(error)
  const exhausted = fix.attempts >= fix.max
  return (
    <div
      role="alert"
      className={`m-3 max-h-[45%] shrink-0 overflow-auto rounded-lg border p-3 text-xs leading-relaxed ${warning ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-red-900 bg-[#1a0000] text-red-200'}`}
    >
      <p className="mb-2 font-bold">⚠️ {error.message}</p>
      {error.line && !error.details.length && (
        <button type="button" className="mb-2 rounded border border-red-900 bg-red-500/10 px-2 py-0.5 font-bold" onClick={() => onGoToLine(error.line!)}>
          Aller à la ligne {error.line}
        </button>
      )}
      {error.details.length > 0 && (
        <ul className="mb-2 space-y-1.5 font-mono">
          {error.details.map((d, i) => (
            <li key={i}>
              {d.line ? (
                <button type="button" className="mr-1 rounded border border-red-900 bg-red-500/10 px-1.5 py-0.5 font-bold text-red-100" onClick={() => onGoToLine(d.line!)}>
                  Ligne {d.line}
                </button>
              ) : null}
              {d.message}
              {d.context && <div className="break-all whitespace-pre-wrap text-gray-400">{d.context}</div>}
            </li>
          ))}
        </ul>
      )}

      {fixable && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-red-900/60 pt-2">
          {fix.available && !exhausted && (
            <button type="button" className={btnPrimary} onClick={fix.onFix} disabled={fix.busy} aria-busy={fix.busy}>
              {fix.busy ? '⏳ Analyse de l’erreur…' : fix.attempts ? '✨ Nouvelle tentative de correction (2/2)' : '✨ Corriger l’erreur avec l’IA'}
            </button>
          )}
          {canUndo && <button type="button" className={btn} onClick={onUndo}>↶ Version précédente</button>}
          {!fix.available && <span className="text-gray-400">Correction par l’IA momentanément indisponible.</span>}
          {fix.available && exhausted && <span className="text-gray-300">Deux corrections automatiques ont été tentées : corrigez la ligne indiquée ou revenez à la version précédente.</span>}
        </div>
      )}
      {fix.message && <p className="mt-2 text-amber-200">{fix.message}</p>}
      {hasPdf && <p className="mt-2 text-[11px] text-gray-400">Dernier PDF valide affiché ci-dessous.</p>}
    </div>
  )
}

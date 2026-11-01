// Contrôle qualité du dernier PDF : badge résumant le résultat, détail dépliable, lignes cliquables.
import type { QualityIssue } from '../lib/quality'

const TONE = { error: 'text-red-300', warning: 'text-amber-300', info: 'text-sky-300' } as const
const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' } as const

export function QualityReport({ issues, onGoToLine }: { issues: QualityIssue[] | null; onGoToLine: (line: number) => void }) {
  if (!issues) return null
  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const summary = !issues.length ? '✓ Contrôle qualité : aucun défaut détecté'
    : `Contrôle qualité : ${[errors && `${errors} défaut${errors > 1 ? 's' : ''}`, warnings && `${warnings} point${warnings > 1 ? 's' : ''} à vérifier`, issues.length - errors - warnings && `${issues.length - errors - warnings} conseil${issues.length - errors - warnings > 1 ? 's' : ''}`].filter(Boolean).join(', ')}`
  return (
    <details className="border-b border-[#21262d] bg-[#11151b] text-xs" open={errors > 0}>
      <summary className={`flex min-h-10 cursor-pointer list-none items-center px-3 font-semibold ${errors ? 'text-red-300' : warnings ? 'text-amber-300' : 'text-emerald-300'}`} aria-live="polite">
        {summary}
      </summary>
      {issues.length > 0 && (
        <ul className="max-h-44 space-y-1.5 overflow-auto px-3 pb-3">
          {issues.map((issue, i) => (
            <li key={i} className={TONE[issue.severity]}>
              <span aria-hidden="true">{ICON[issue.severity]} </span>
              {issue.line ? <button type="button" className="mr-1 underline" onClick={() => onGoToLine(issue.line!)}>Ligne {issue.line}</button> : null}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

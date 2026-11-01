// Réécriture professionnelle proposée par l'IA (latex.rewrite) : chaque champ modifié est présenté
// avant / après et s'accepte un par un. Employeurs, diplômes, dates et chiffres ne changent jamais :
// le serveur écarte tout texte contenant un chiffre absent du CV (signalé ici).
import { useState } from 'react'
import type { CvData } from '../lib/cvData'
import { applyRewrite, rewriteChanges, type RewriteResult } from '../lib/importCv'
import { Dialog } from './Dialog'
import { btn, btnPrimary } from './ui'

export function RewriteDialog({ base, result, onApply, onClose }: {
  base: CvData
  result: RewriteResult
  onApply: (cv: CvData) => void
  onClose: () => void
}) {
  const changes = rewriteChanges(base, result.cv)
  const [accepted, setAccepted] = useState(() => new Set(changes.map(c => c.key)))
  const toggle = (key: string) => setAccepted(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const rejectedNumbers = result.flags.filter(f => f.reason === 'number').length
  const rejectedSkills = result.flags.filter(f => f.reason === 'unknown_skill').length
  const rejectedTerms = result.flags.filter(f => f.reason === 'unknown_term').length

  return (
    <Dialog
      title="Réécriture proposée par l’IA"
      onClose={onClose}
      wide
      footer={<>
        <button type="button" className={btn} onClick={onClose}>Annuler</button>
        <button type="button" className={btnPrimary} onClick={() => onApply(applyRewrite(base, result.cv, accepted))} disabled={!accepted.size}>
          Appliquer {accepted.size} modification{accepted.size > 1 ? 's' : ''}
        </button>
      </>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-gray-400">Seuls les textes changent. Employeurs, diplômes, établissements et dates restent ceux de vos données.</p>
        {(rejectedNumbers > 0 || rejectedSkills > 0 || rejectedTerms > 0) && (
          <p role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            {rejectedNumbers > 0 && `${rejectedNumbers} proposition(s) écartée(s) : elles ajoutaient un chiffre absent de votre CV. `}
            {rejectedSkills > 0 && `${rejectedSkills} compétence(s) que vous n’aviez pas déclarée(s) n’ont pas été ajoutées. `}
            {rejectedTerms > 0 && `${rejectedTerms} proposition(s) écartée(s) : elles citaient un nom ou un sigle absent de votre CV.`}
          </p>
        )}
        {!changes.length && <p className="text-gray-300">Aucune modification proposée.</p>}
        {changes.map(c => (
          <label key={c.key} className="block cursor-pointer rounded-lg border border-[#2a313c] p-3 has-[:checked]:border-indigo-500/60">
            <span className="flex items-center gap-2 text-xs font-bold text-gray-100">
              <input type="checkbox" checked={accepted.has(c.key)} onChange={() => toggle(c.key)} /> {c.label}
            </span>
            <span className="mt-2 grid gap-2 sm:grid-cols-2">
              <span className="block whitespace-pre-wrap rounded bg-red-500/5 p-2 text-xs text-gray-400"><span className="sr-only">Avant : </span>{c.before || '—'}</span>
              <span className="block whitespace-pre-wrap rounded bg-emerald-500/10 p-2 text-xs text-gray-100"><span className="sr-only">Après : </span>{c.after}</span>
            </span>
          </label>
        ))}
        {result.suggestions.length > 0 && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100">
            <p className="mb-1 font-bold">Suggestions (non ajoutées au CV)</p>
            <ul className="list-disc space-y-1 pl-4">{result.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// Comparaisons avant / après (P7, P8).
//   CompareDataDialog : données du CV, champ par champ, avec une version précédente (CV importé
//                       d'origine, avant une réécriture…) ; « Rétablir cette version ».
//   CodeDiffDialog    : code LaTeX, ligne par ligne (génération par l'IA, versions de la session).
import { useMemo, useState } from 'react'
import type { CvData } from '../lib/cvData'
import { cvChanges, diffStats, lineDiff } from '../lib/diff'
import { Dialog } from './Dialog'
import { btn, btnPrimary, field, label } from './ui'

export interface CvSnapshot { id: string; label: string; at: number; cv: CvData }

export function CompareDataDialog({ snapshots, current, onRestore, onClose }: {
  snapshots: CvSnapshot[]
  current: CvData
  onRestore: (snapshot: CvSnapshot) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(snapshots.at(-1)?.id ?? '')
  const snapshot = snapshots.find(s => s.id === selected) ?? snapshots.at(-1)
  const changes = useMemo(() => (snapshot ? cvChanges(snapshot.cv, current) : []), [snapshot, current])
  return (
    <Dialog title="Comparer avec une version précédente" onClose={onClose} wide
      footer={<>
        <button type="button" className={btn} onClick={onClose}>Fermer</button>
        <button type="button" className={btnPrimary} onClick={() => snapshot && onRestore(snapshot)} disabled={!snapshot || !changes.length}>Rétablir cette version</button>
      </>}>
      <div className="space-y-3 text-xs text-gray-300">
        <div>
          <label className={label} htmlFor="compare-version">Version comparée aux données actuelles</label>
          <select id="compare-version" className={`${field} [color-scheme:dark]`} value={snapshot?.id ?? ''} onChange={e => setSelected(e.target.value)}>
            {[...snapshots].reverse().map(s => <option key={s.id} value={s.id}>{s.label} — {new Date(s.at).toLocaleTimeString('fr-FR')}</option>)}
          </select>
        </div>
        <p className="text-gray-400" role="status">{changes.length ? `${changes.length} champ(s) différent(s).` : 'Aucune différence : les données actuelles sont identiques à cette version.'}</p>
        <ol className="space-y-2" aria-label="Différences">
          {changes.map((c, i) => (
            <li key={i} className="rounded-lg border border-[#2a313c] p-2">
              <p className="font-bold text-gray-100">{c.section} — {c.label}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <p className="whitespace-pre-wrap rounded bg-red-500/5 p-2 text-gray-400"><span className="block text-[10px] uppercase text-gray-500">Avant</span>{c.before || '—'}</p>
                <p className="whitespace-pre-wrap rounded bg-emerald-500/10 p-2 text-gray-100"><span className="block text-[10px] uppercase text-gray-500">Maintenant</span>{c.after || '—'}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  )
}

/** Différence de code : lignes inchangées repliées, ajouts et retraits mis en évidence */
export function CodeDiff({ before, after }: { before: string; after: string }) {
  const ops = useMemo(() => lineDiff(before, after), [before, after])
  const { added, removed } = diffStats(ops)
  // Lignes inchangées : 2 de contexte autour de chaque changement
  const keep = ops.map((op, i) => op.type !== 'same' || ops.slice(Math.max(0, i - 2), i + 3).some(o => o.type !== 'same'))
  const rows: ({ kind: 'op'; i: number } | { kind: 'gap'; n: number })[] = []
  ops.forEach((_, i) => {
    if (keep[i]) rows.push({ kind: 'op', i })
    else if (rows.at(-1)?.kind === 'gap') (rows.at(-1) as { n: number }).n++
    else rows.push({ kind: 'gap', n: 1 })
  })
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400" role="status"><span className="text-emerald-300">+{added}</span> ligne(s) ajoutée(s), <span className="text-red-300">−{removed}</span> retirée(s)</p>
      <pre className="max-h-[50vh] overflow-auto rounded-lg border border-[#2a313c] bg-[#0d1117] p-2 font-mono text-[11px] leading-5" aria-label="Différences de code">
        {rows.map((r, k) => r.kind === 'gap'
          ? <div key={k} className="text-gray-600">⋯ {r.n} ligne(s) inchangée(s)</div>
          : <div key={k} className={ops[r.i].type === 'add' ? 'bg-emerald-500/15 text-emerald-200' : ops[r.i].type === 'del' ? 'bg-red-500/15 text-red-200 line-through decoration-red-400/50' : 'text-gray-500'}>
              <span aria-hidden="true">{ops[r.i].type === 'add' ? '+ ' : ops[r.i].type === 'del' ? '− ' : '  '}</span>
              <span className="sr-only">{ops[r.i].type === 'add' ? 'Ajouté : ' : ops[r.i].type === 'del' ? 'Retiré : ' : ''}</span>{ops[r.i].text || ' '}
            </div>)}
      </pre>
    </div>
  )
}

export function CodeDiffDialog({ title, intro, before, after, warnings = [], applyLabel, onApply, onClose }: {
  title: string
  intro?: string
  before: string
  after: string
  warnings?: string[]
  applyLabel?: string
  onApply?: () => void
  onClose: () => void
}) {
  return (
    <Dialog title={title} onClose={onClose} wide
      footer={<>
        <button type="button" className={btn} onClick={onClose}>{onApply ? 'Ignorer' : 'Fermer'}</button>
        {onApply && <button type="button" className={btnPrimary} onClick={onApply}>{applyLabel ?? 'Appliquer'}</button>}
      </>}>
      <div className="space-y-3 text-xs text-gray-300">
        {intro && <p className="text-gray-400">{intro}</p>}
        {warnings.length > 0 && (
          <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
            <p className="font-bold">À vérifier avant d’appliquer</p>
            <ul className="list-disc pl-4">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        <CodeDiff before={before} after={after} />
      </div>
    </Dialog>
  )
}

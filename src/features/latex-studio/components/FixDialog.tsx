// Proposition de correction IA : explication, lignes retirées et ajoutées, puis Accepter ou Refuser.
// Rien n'est modifié avant l'accord de l'utilisateur ; la version actuelle reste restaurable.
import { hunks, type FixProposal } from '../lib/edits'
import { Dialog } from './Dialog'
import { btn, btnPrimary } from './ui'

export function FixDialog({ proposal, attempt, onAccept, onReject }: {
  proposal: FixProposal
  attempt: number
  onAccept: () => void
  onReject: () => void
}) {
  const blocks = hunks(proposal.base, proposal.edits)
  return (
    <Dialog
      title={`Correction proposée par l’IA (tentative ${attempt}/2)`}
      onClose={onReject}
      wide
      footer={<>
        <button type="button" className={btn} onClick={onReject}>Refuser</button>
        <button type="button" className={btnPrimary} onClick={onAccept} disabled={!blocks.length}>Accepter et compiler</button>
      </>}
    >
      {proposal.explanation && <p className="mb-3 text-sm text-gray-300">{proposal.explanation}</p>}
      {!blocks.length && <p className="text-sm text-amber-300">Aucune modification proposée : corrigez l’erreur manuellement ou revenez à une version précédente.</p>}
      <p className="mb-3 text-xs text-gray-500">Seules les lignes ci-dessous changent. Votre version actuelle reste disponible avec « Version précédente ».</p>
      <div className="space-y-3">
        {blocks.map((h, i) => (
          <figure key={i} className="overflow-x-auto rounded-lg border border-[#21262d] bg-[#0d1117] font-mono text-xs leading-relaxed" aria-label={`Modification ${i + 1}`}>
            {h.before.map(l => <Line key={`b${l.n}`} n={l.n} text={l.text} />)}
            {h.removed.map(l => <Line key={`r${l.n}`} n={l.n} text={l.text} kind="removed" />)}
            {h.added.map((text, j) => <Line key={`a${j}`} text={text} kind="added" />)}
            {h.after.map(l => <Line key={`f${l.n}`} n={l.n} text={l.text} />)}
          </figure>
        ))}
      </div>
    </Dialog>
  )
}

function Line({ n, text, kind }: { n?: number; text: string; kind?: 'removed' | 'added' }) {
  const tone = kind === 'removed' ? 'bg-red-500/10 text-red-200' : kind === 'added' ? 'bg-emerald-500/10 text-emerald-200' : 'text-gray-500'
  const sign = kind === 'removed' ? '−' : kind === 'added' ? '+' : ' '
  return (
    <div className={`flex whitespace-pre ${tone}`}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-gray-600">{n ?? ''}</span>
      <span className="w-4 shrink-0 select-none" aria-hidden="true">{sign}</span>
      <span className="sr-only">{kind === 'removed' ? 'Ligne retirée : ' : kind === 'added' ? 'Ligne ajoutée : ' : ''}</span>
      <span className="pr-3">{text || ' '}</span>
    </div>
  )
}

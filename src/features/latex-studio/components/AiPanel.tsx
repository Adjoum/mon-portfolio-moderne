// Assistant IA du studio : génération et amélioration ciblées sur une candidature.
// L'organisme (ou l'institution) visé est obligatoire, le poste facultatif : le serveur refuse
// toute génération ou amélioration sans eux (latex.generate, latex.improve, latex.rewrite).
import { useId } from 'react'
import { btnPrimary, field, label } from './ui'
import { targetReady, type Target } from '../lib/target'
import { AiInstructions } from './AiInstructions'

export function TargetFields({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  const id = useId()
  return (
    <fieldset className="space-y-2 rounded-lg border border-[#2a313c] p-3">
      <legend className="px-1 text-xs font-bold text-gray-200">Candidature visée</legend>
      <div>
        <label className={label} htmlFor={`${id}-org`}>Organisme ou institution <span className="text-red-300" aria-hidden="true">*</span></label>
        <input
          id={`${id}-org`}
          className={field}
          value={target.organization}
          onChange={e => onChange({ ...target, organization: e.target.value })}
          maxLength={200}
          required
          aria-required="true"
          placeholder="Ex. : Hôpital, université, entreprise, ONG…"
          autoComplete="organization"
        />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-role`}>Poste visé <span className="font-normal text-gray-500">(facultatif)</span></label>
        <input id={`${id}-role`} className={field} value={target.role} onChange={e => onChange({ ...target, role: e.target.value })} maxLength={200} placeholder="Ex. : Data Analyst" autoComplete="organization-title" />
      </div>
      <p className="text-[11px] leading-snug text-gray-500">L’IA adapte le vocabulaire et l’ordre des informations à cette candidature, sans rien inventer.</p>
    </fieldset>
  )
}

export function AiPanel(props: {
  mode: 'generate' | 'improve'
  setMode: (m: 'generate' | 'improve') => void
  target: Target
  setTarget: (t: Target) => void
  info: string
  setInfo: (v: string) => void
  instruction: string
  setInstruction: (v: string) => void
  /** Instructions supplémentaires pour l'IA (P7), communes au studio */
  extra: string
  setExtra: (v: string) => void
  selectionLines: number
  available: (feature: 'latex.generate' | 'latex.improve') => boolean
  loading: boolean
  error: string
  onGenerate: () => void
  onImprove: () => void
}) {
  const id = useId()
  const { mode, target } = props
  const feature = mode === 'generate' ? 'latex.generate' : 'latex.improve'
  const ready = targetReady(target) && (mode === 'generate' ? !!props.info.trim() : props.selectionLines > 0 && !!props.instruction.trim())
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Action de l’assistant" className="grid grid-cols-2 gap-1">
        {(['generate', 'improve'] as const).map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => props.setMode(m)}
            className={`min-h-11 rounded-lg border text-xs font-bold sm:min-h-9 ${mode === m ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200' : 'border-[#21262d] text-gray-400 hover:text-white'}`}
          >
            {m === 'generate' ? '⚡ Générer' : '✨ Améliorer'}
          </button>
        ))}
      </div>

      <TargetFields target={target} onChange={props.setTarget} />

      {mode === 'generate' ? (
        <div>
          <label className={label} htmlFor={`${id}-info`}>Vos informations</label>
          <textarea
            id={`${id}-info`}
            className={`${field} min-h-40 resize-y text-xs`}
            value={props.info}
            onChange={e => props.setInfo(e.target.value)}
            placeholder={'Nom : …\nPoste actuel : …\nExpériences :\n- …\nFormation :\n- …\nCompétences : …'}
          />
          <p className="mt-1 text-[11px] text-gray-500">Le code proposé vous est montré avant de remplacer le code actuel, qui reste restaurable.</p>
          <div className="mt-2"><AiInstructions value={props.extra} onChange={props.setExtra} examples={'Ex. : CV sobre en une page, mettre en avant la santé publique.'} /></div>
        </div>
      ) : (
        <div>
          <p className={`mb-2 rounded-lg border p-2 text-xs ${props.selectionLines ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`} aria-live="polite">
            {props.selectionLines ? `✅ ${props.selectionLines} ligne(s) sélectionnée(s)` : '⚠️ Sélectionnez d’abord du code dans l’éditeur'}
          </p>
          <label className={label} htmlFor={`${id}-instr`}>Instruction</label>
          <textarea
            id={`${id}-instr`}
            className={`${field} min-h-28 resize-y text-xs`}
            value={props.instruction}
            onChange={e => props.setInstruction(e.target.value)}
            placeholder={'Ex. : rends cette section plus percutante pour ce poste'}
          />
        </div>
      )}

      <button type="button" className={`${btnPrimary} w-full`} onClick={mode === 'generate' ? props.onGenerate : props.onImprove} disabled={props.loading || !ready || !props.available(feature)} aria-busy={props.loading}>
        {props.loading ? '⏳ En cours…' : mode === 'generate' ? '⚡ Générer le code LaTeX' : '✨ Améliorer la sélection'}
      </button>
      {!targetReady(target) && <p className="text-[11px] text-amber-300">Renseignez l’organisme ou l’institution visé(e) pour activer l’assistant.</p>}
      {!props.available(feature) && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
          Cette fonction IA est momentanément indisponible. L’édition manuelle et les téléchargements restent disponibles.
        </p>
      )}
      {props.error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">⚠️ {props.error}</p>}
    </div>
  )
}

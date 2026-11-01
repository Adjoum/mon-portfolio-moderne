// Instructions supplémentaires pour l'IA (P7) : facultatives, communes à l'import, à la réécriture et
// à la génération. Le serveur les borne et les place après les règles : elles orientent le ton, le
// style ou la mise en valeur, et ne permettent jamais d'inventer une information.
import { useId } from 'react'
import { field } from './ui'

export const MAX_AI_INSTRUCTIONS = 600

export function AiInstructions({ value, onChange, examples }: {
  value: string
  onChange: (value: string) => void
  /** Exemples adaptés à l'action (import, réécriture, génération) */
  examples: string
}) {
  const id = useId()
  return (
    <details open={!!value} className="group rounded-lg border border-[#2a313c]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-gray-200 sm:min-h-9">
        Instructions supplémentaires pour l’IA <span className="font-normal text-gray-500">{value ? `${value.length}/${MAX_AI_INSTRUCTIONS}` : '(facultatif)'}</span>
      </summary>
      <div className="space-y-1 border-t border-[#2a313c] p-3">
        <label className="sr-only" htmlFor={id}>Instructions supplémentaires pour l’IA</label>
        <textarea id={id} className={`${field} min-h-20 resize-y text-xs`} value={value} maxLength={MAX_AI_INSTRUCTIONS}
          onChange={e => onChange(e.target.value)} placeholder={examples} aria-describedby={`${id}-help`} />
        <p id={`${id}-help`} className="text-[11px] leading-snug text-gray-500">
          Ton, longueur, points à mettre en avant. L’IA n’invente jamais d’information : une consigne qui le demanderait est ignorée, et le studio écarte tout chiffre, nom ou sigle absent de vos données.
        </p>
      </div>
    </details>
  )
}

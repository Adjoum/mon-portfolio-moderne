// Édition visuelle (P8) : le passage cliqué dans le PDF se modifie ici, sans LaTeX. La donnée change,
// le code est régénéré et le PDF recompilé ; « ↶ Précédente » annule.
import { useId, useState } from 'react'
import type { CvField } from '../lib/visualEdit'
import { Dialog } from './Dialog'
import { btn, btnPrimary, field, label } from './ui'

export function EditFieldDialog({ target, onSave, onClose }: {
  target: CvField
  onSave: (value: string) => void
  onClose: () => void
}) {
  const id = useId()
  const [value, setValue] = useState(target.value)
  const changed = value.trim() !== target.value.trim() && value.trim() !== ''
  return (
    <Dialog title="Modifier ce texte" onClose={onClose}
      footer={<>
        <button type="button" className={btn} onClick={onClose}>Annuler</button>
        <button type="button" className={btnPrimary} onClick={() => onSave(value.trim())} disabled={!changed}>Enregistrer</button>
      </>}>
      <div className="space-y-2 text-xs text-gray-300">
        <label className={label} htmlFor={id}>{target.label}</label>
        {target.multiline
          ? <textarea id={id} className={`${field} min-h-28 resize-y`} value={value} onChange={e => setValue(e.target.value)} maxLength={2000} />
          : <input id={id} className={field} value={value} onChange={e => setValue(e.target.value)} maxLength={300}
              onKeyDown={e => { if (e.key === 'Enter' && changed) onSave(value.trim()) }} />}
        <p className="text-[11px] text-gray-500">Le CV est mis à jour dans les données, le code LaTeX et l’aperçu. « ↶ Précédente » annule.</p>
      </div>
    </Dialog>
  )
}

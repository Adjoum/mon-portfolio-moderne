// Import d'un CV existant : PDF, DOCX, TXT, RTF ; images et PDF scannés si la lecture d'image par l'IA
// est activée et validée dans le centre IA. Le fichier n'est conservé nulle part.
import { useId, useRef, useState } from 'react'
import { ACCEPT, MAX_IMPORT_BYTES, classify, extractText, imagePages, readImages, structureText, ImportFailure } from '../lib/importCv'
import type { CvData } from '../lib/cvData'
import { btn, btnPrimary, field, label } from './ui'

type Step = { state: 'idle' } | { state: 'busy'; message: string } | { state: 'text'; text: string; truncated: boolean } | { state: 'error'; message: string }

export function ImportPanel({ ocrAvailable, structureAvailable, onImported }: {
  /** latex.import.ocr disponible (modèle à capacité visuelle validé) : certitude du serveur */
  ocrAvailable: boolean
  structureAvailable: boolean
  onImported: (cv: CvData) => void
}) {
  const id = useId()
  const [lang, setLang] = useState<'fr' | 'en'>('fr')
  const [step, setStep] = useState<Step>({ state: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  const run = async (file: File) => {
    const kind = classify(file)
    if (!kind) return setStep({ state: 'error', message: 'Format non pris en charge : PDF, DOCX, TXT, RTF, JPG ou PNG.' })
    if (file.size > MAX_IMPORT_BYTES) return setStep({ state: 'error', message: 'Fichier trop volumineux (10 Mo au maximum).' })
    try {
      let text = ''
      let truncated = false
      if (kind === 'image') {
        if (!ocrAvailable) throw new ImportFailure('OCR_UNAVAILABLE', 'La lecture d’images par l’IA n’est pas activée : importez un PDF texte, un DOCX, un TXT ou un RTF.')
        setStep({ state: 'busy', message: 'Lecture de l’image par l’IA…' })
        text = await readImages(await imagePages(file, 'image'))
      } else {
        setStep({ state: 'busy', message: 'Lecture du fichier dans l’environnement isolé…' })
        const extracted = await extractText(file, kind)
        text = extracted.text
        truncated = extracted.truncated
        if (extracted.needsOcr) {
          if (!ocrAvailable) throw new ImportFailure('OCR_UNAVAILABLE', 'Ce PDF ne contient pas de texte (document scanné) et la lecture d’images par l’IA n’est pas activée.')
          const pages = await imagePages(file, 'pdf')
          text = await readImages(pages, n => setStep({ state: 'busy', message: `Lecture de la page ${n}/${pages.length} par l’IA…` }))
        }
      }
      if (!text.trim()) throw new ImportFailure('IMPORT_EMPTY', 'Aucun texte n’a été trouvé dans ce fichier.')
      if (!structureAvailable) return setStep({ state: 'text', text, truncated })
      setStep({ state: 'busy', message: 'Structuration des informations par l’IA…' })
      onImported(await structureText(text, lang))
      setStep({ state: 'idle' })
    } catch (e) {
      setStep({ state: 'error', message: (e as Error).message || 'L’import a échoué.' })
    }
  }

  const busy = step.state === 'busy'
  return (
    <div className="space-y-3 text-xs text-gray-300">
      <p className="leading-relaxed text-gray-400">
        Importez votre CV actuel pour le reconstruire dans un modèle. Le fichier est lu dans un environnement isolé puis effacé :
        il n’est <strong className="text-gray-200">jamais conservé</strong>. Son texte est envoyé au fournisseur d’IA configuré pour être structuré.
      </p>
      <div>
        <label className={label} htmlFor={`${id}-lang`}>Langue du CV</label>
        <select id={`${id}-lang`} className={`${field} [color-scheme:dark]`} value={lang} onChange={e => setLang(e.target.value as 'fr' | 'en')} disabled={busy}>
          <option value="fr">Français</option><option value="en">Anglais</option>
        </select>
      </div>
      <label htmlFor={`${id}-file`} className={`${btnPrimary} w-full cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>📥 Importer un CV</label>
      <input id={`${id}-file`} ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f) }} />
      <p className="text-[11px] text-gray-500">
        PDF texte, DOCX, TXT ou RTF (10 Mo au maximum){ocrAvailable ? ' ; images JPG/PNG et PDF scannés lus par l’IA (trois pages au plus).' : '. Images et PDF scannés : lecture par l’IA non activée.'}
      </p>
      {busy && <p role="status" aria-live="polite" className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-2 text-indigo-200">⏳ {step.message}</p>}
      {step.state === 'error' && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300">⚠️ {step.message}</p>}
      {step.state === 'text' && (
        <div className="space-y-2">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
            La structuration par l’IA n’est pas activée : reportez les informations dans l’onglet « Données » à partir du texte extrait.
            {step.truncated && ' Le texte a été tronqué à 20 000 caractères.'}
          </p>
          <textarea readOnly className={`${field} min-h-48 font-mono text-[11px]`} value={step.text} aria-label="Texte extrait du CV" />
          <button type="button" className={`${btn} w-full`} onClick={() => setStep({ state: 'idle' })}>Effacer le texte extrait</button>
        </div>
      )}
    </div>
  )
}

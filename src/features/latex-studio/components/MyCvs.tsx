// « Enregistrer dans Mes CV » (avec accord explicite) et « Mes CV » : historique, aperçu,
// téléchargement, restauration dans l'éditeur, suppression.
import { useCallback, useEffect, useId, useState } from 'react'
import { history, type HistoryMode, type SavedCv } from '../lib/history'
import { downloadUrl } from '../useCompile'
import { Dialog } from './Dialog'
import { PdfPreview } from './PdfPreview'
import { btn, btnDanger, btnPrimary, field, label } from './ui'

const NOTICE: Record<HistoryMode, string> = {
  server: 'Ce CV (PDF et code source) sera conservé dans votre espace privé, visible de vous seul, pendant 12 mois au plus. Vous pouvez le supprimer à tout moment depuis « Mes CV ».',
  device: 'Ce CV sera conservé uniquement dans ce navigateur, sur cet appareil (jamais sur un serveur), pendant 12 mois au plus. Évitez cette option sur un ordinateur partagé.',
}

export function SaveDialog({ mode, defaultTitle, onSave, onClose }: {
  mode: HistoryMode
  defaultTitle: string
  onSave: (title: string) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [title, setTitle] = useState(defaultTitle)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(title)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="💾 Enregistrer dans Mes CV" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Annuler</button>
      <button type="button" className={btnPrimary} onClick={save} disabled={!consent || busy || !title.trim()} aria-busy={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      <div className="space-y-3 text-sm">
        <div>
          <label className={label} htmlFor={`${id}-title`}>Titre</label>
          <input id={`${id}-title`} className={field} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
        </div>
        <p className="rounded-lg border border-[#2a313c] bg-[#0f1318] p-3 text-xs leading-relaxed text-gray-300">{NOTICE[mode]}</p>
        <label className="flex items-start gap-2 text-xs text-gray-200">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} />
          J’accepte la conservation de ce CV dans les conditions ci-dessus.
        </label>
        {error && <p role="alert" className="text-xs text-red-300">⚠️ {error}</p>}
      </div>
    </Dialog>
  )
}

export function MyCvsDialog({ mode, onRestore, onClose }: {
  mode: HistoryMode
  onRestore: (tex: string, entry: SavedCv) => void
  onClose: () => void
}) {
  const store = history[mode]
  const [items, setItems] = useState<SavedCv[] | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ entry: SavedCv; pdf: Blob; url: string } | null>(null)

  const refresh = useCallback(() => store.list().then(setItems).catch(e => setError((e as Error).message)), [store])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  const act = async (fn: () => Promise<void>) => {
    setError('')
    try { await fn() } catch (e) { setError((e as Error).message) }
  }
  const download = (entry: SavedCv, kind: 'pdf' | 'tex') => act(async () => {
    const filename = `${entry.title.replace(/[^\w\-àâäéèêëîïôöùûüç ]+/gi, '').trim().replace(/\s+/g, '-') || 'cv'}.${kind}`
    const url = await store.link(entry.id, kind, filename)
    downloadUrl(url, filename)
    if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 10_000)
  })

  return (
    <>
      <Dialog title="🗂 Mes CV" onClose={onClose} wide>
        <p className="mb-3 text-xs text-gray-400">
          {mode === 'server' ? 'Espace privé : ces CV ne sont visibles que par vous.' : 'CV conservés dans ce navigateur, sur cet appareil uniquement.'} Conservation : 12 mois au plus.
        </p>
        {error && <p role="alert" className="mb-3 text-xs text-red-300">⚠️ {error}</p>}
        {!items && !error && <p className="text-sm text-gray-400">Chargement…</p>}
        {items?.length === 0 && <p className="text-sm text-gray-400">Aucun CV enregistré. Utilisez « 💾 Enregistrer » après avoir compilé votre CV.</p>}
        <ul className="space-y-2">
          {items?.map(entry => (
            <li key={entry.id} className="rounded-lg border border-[#2a313c] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm text-gray-100">{entry.title}</strong>
                <span className="text-[11px] text-gray-500">{new Date(entry.createdAt).toLocaleString('fr-FR')} · {Math.max(1, Math.round(entry.pdfBytes / 1024))} Ko</span>
              </div>
              {(entry.targetOrganization || entry.templateId) && (
                <p className="mt-0.5 text-[11px] text-gray-400">{[entry.targetOrganization && `Candidature : ${entry.targetOrganization}${entry.targetRole ? ` — ${entry.targetRole}` : ''}`, entry.templateId && `Modèle : ${entry.templateId}`].filter(Boolean).join(' · ')}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={btn} onClick={() => act(async () => { const pdf = await store.file(entry.id, 'pdf'); setPreview({ entry, pdf, url: URL.createObjectURL(pdf) }) })}>👁 Aperçu</button>
                <button type="button" className={btn} onClick={() => download(entry, 'pdf')}>⬇ PDF</button>
                <button type="button" className={btn} onClick={() => download(entry, 'tex')}>⬇ .tex</button>
                <button type="button" className={btn} onClick={() => act(async () => { onRestore(await (await store.file(entry.id, 'tex')).text(), entry); onClose() })}>↺ Restaurer dans l’éditeur</button>
                {confirming === entry.id
                  ? <button type="button" className={btnDanger} onClick={() => act(async () => { await store.remove(entry.id); setConfirming(null); await refresh() })}>Confirmer la suppression</button>
                  : <button type="button" className={btnDanger} onClick={() => setConfirming(entry.id)}>🗑 Supprimer</button>}
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
      {preview && (
        <Dialog title={`Aperçu — ${preview.entry.title}`} onClose={() => setPreview(null)} wide>
          <div className="flex h-[70vh] flex-col">
            <PdfPreview pdf={preview.pdf} url={preview.url} dimmed={false} onDownload={() => download(preview.entry, 'pdf')} />
          </div>
        </Dialog>
      )}
    </>
  )
}

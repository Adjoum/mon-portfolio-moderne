// src/components/admin/CvManager.tsx
// Onglet CV du dashboard : version active, remplacement, historique, restauration.
// Les écritures passent par blog-api (admin + MFA, validation du PDF) ; l'historique
// se lit dans cv_versions, protégée par la RLS.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Eye, Download, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { adminFetch, describeAdminApiError } from '../../lib/adminAuth'
import { cvVersionUrls, fetchActiveCv, type CvResolution } from '../../lib/cvDocument'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const MAX_PDF_BYTES = 10 * 1024 * 1024

interface CvVersionRow {
  id: string
  bucket: string
  storage_path: string
  original_filename: string | null
  size_bytes: number
  status: 'active' | 'archived'
  uploaded_at: string
  activated_at: string | null
}

type Message = { type: 'success' | 'error'; text: string }

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—')
const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(0)} Ko`

export default function CvManager() {
  const [cv, setCv] = useState<CvResolution | null>(null)
  const [history, setHistory] = useState<CvVersionRow[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const [active, versions] = await Promise.all([
      fetchActiveCv(),
      supabase.from('cv_versions').select('id, bucket, storage_path, original_filename, size_bytes, status, uploaded_at, activated_at').order('uploaded_at', { ascending: false }),
    ])
    setCv(active)
    setHistory((versions.data as CvVersionRow[] | null) ?? [])
  }, [])

  useEffect(() => { void reload() }, [reload])

  const activeId = cv?.kind === 'active' ? cv.version.id : ''

  const call = async (path: string, init: RequestInit) => {
    const res = await adminFetch(`${API_URL}/admin/cv${path}`, init)
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(describeAdminApiError(res.status, body))
    return body
  }

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setMessage(null)
    if (!/\.pdf$/i.test(file.name)) return setMessage({ type: 'error', text: 'Veuillez sélectionner un fichier PDF.' })
    if (file.size > MAX_PDF_BYTES) return setMessage({ type: 'error', text: 'PDF trop volumineux (10 Mo maximum).' })

    setBusy(true)
    try {
      const form = new FormData()
      form.append('expectedActive', activeId)
      form.append('file', file)
      await call('', { method: 'POST', body: form })
      // Ancienne copie locale, sans effet : la version active vit désormais en base
      localStorage.removeItem('cvFile')
      await reload()
      setMessage({ type: 'success', text: 'Nouveau CV publié : il est en ligne pour tous les visiteurs.' })
    } catch (err) {
      await reload()
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const restore = async (version: CvVersionRow) => {
    if (!confirm(`Restaurer la version du ${formatDate(version.uploaded_at)} ?`)) return
    setBusy(true)
    setMessage(null)
    try {
      await call(`/${version.id}/restore`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ expectedActive: activeId }),
      })
      await reload()
      setMessage({ type: 'success', text: 'Version restaurée : elle est en ligne pour tous les visiteurs.' })
    } catch (err) {
      await reload()
      setMessage({ type: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-effect-dark p-8 rounded-2xl space-y-8">
      <h3 className="text-2xl font-bold text-white">Gérer votre CV PDF</h3>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}
        >
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      <section aria-label="CV actuellement en ligne">
        <h4 className="text-lg font-semibold text-white mb-3">CV actuellement en ligne</h4>
        {!cv && <p className="text-gray-400">Chargement…</p>}
        {cv?.kind === 'error' && <p role="alert" className="text-red-300">Impossible de lire la version active. Rechargez la page.</p>}
        {cv?.kind === 'legacy' && (
          <p className="text-gray-400">Aucune version publiée : le site affiche encore le fichier d’origine du dépôt.</p>
        )}
        {cv?.kind === 'active' && (
          <div className="space-y-4">
            <p className="text-gray-300" data-testid="cv-active-date">
              Remplacé le {formatDate(cv.version.activated_at)} · {formatSize(cv.version.size_bytes)}
            </p>
            <div className="flex flex-wrap gap-4">
              <a href={cv.viewUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-primary/20 text-primary rounded-lg flex items-center gap-2 hover:bg-primary/30 transition-colors">
                <Eye size={20} /> Prévisualiser
              </a>
              <a href={cv.downloadUrl} className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg text-white flex items-center gap-2">
                <Download size={20} /> Télécharger
              </a>
            </div>
            <div className="glass-effect p-4 rounded-xl">
              <iframe key={cv.version.id} src={cv.viewUrl} className="w-full h-[600px] rounded-lg" title="Prévisualisation du CV actif" />
            </div>
          </div>
        )}
      </section>

      <section aria-label="Remplacer le CV">
        <h4 className="text-lg font-semibold text-white mb-3">Remplacer le CV</h4>
        <label className={`block px-6 py-4 glass-effect rounded-xl border-2 border-dashed border-gray-600 transition-colors ${busy ? 'opacity-60' : 'hover:border-primary cursor-pointer'}`}>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy || cv?.kind === 'error'}
            onChange={e => void handleFile(e.target.files?.[0])}
            className="hidden"
          />
          <span className="flex items-center justify-center gap-3 text-white font-semibold">
            <Upload size={24} className="text-primary" />
            {busy ? 'Traitement en cours…' : 'Choisir un fichier PDF (10 Mo maximum)'}
          </span>
        </label>
        <p className="text-sm text-gray-500 mt-2">L’ancienne version est conservée et peut être restaurée.</p>
      </section>

      <section aria-label="Historique des versions">
        <h4 className="text-lg font-semibold text-white mb-3">Historique des versions</h4>
        {history.length === 0 ? (
          <p className="text-gray-400">Aucune version enregistrée.</p>
        ) : (
          <ul className="space-y-2">
            {history.map(version => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 p-3 glass-effect rounded-lg">
                <div>
                  <p className="text-white text-sm">{version.original_filename || 'CV'} · {formatSize(version.size_bytes)}</p>
                  <p className="text-gray-400 text-xs">Ajouté le {formatDate(version.uploaded_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <a href={cvVersionUrls(version).viewUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm">Ouvrir</a>
                  {version.status === 'active' ? (
                    <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-300 text-xs">En ligne</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void restore(version)}
                      className="px-3 py-1 glass-effect rounded-lg text-gray-300 hover:text-white text-sm flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw size={14} /> Restaurer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

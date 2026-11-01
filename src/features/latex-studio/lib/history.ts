// src/features/latex-studio/lib/history.ts
// « Mes CV » : CV finaux enregistrés à l'export, après accord explicite de l'utilisateur.
//   - Serveur (Supabase, bucket privé cv-private) : seulement si public.cv_history_allowed() le
//     permet, c'est-à-dire aujourd'hui un administrateur connecté avec MFA ; RLS : propriétaire seul.
//   - Appareil (IndexedDB de ce navigateur) : pour tout autre visiteur ; rien ne quitte l'appareil.
// Les fichiers importés ne sont jamais enregistrés ici : seulement le PDF final et son code source.
// Conservation : 365 jours au plus, purge à l'ouverture de « Mes CV ».
import { supabase } from '../../../lib/supabase'

export type HistoryMode = 'server' | 'device'

export interface SavedCv {
  id: string
  title: string
  templateId: string | null
  targetOrganization: string
  targetRole: string
  createdAt: string
  pdfBytes: number
  texBytes: number
}

export interface SaveInput {
  title: string
  templateId: string | null
  target: { organization: string; role: string }
  pdf: Blob
  tex: string
}

export const MAX_DEVICE_ENTRIES = 20
const RETENTION_MS = 365 * 24 * 3600 * 1000
const BUCKET = 'cv-private'

export class HistoryError extends Error {}

/** Mode disponible : décidé par la base (cv_history_allowed), jamais par le navigateur seul */
export async function detectMode(): Promise<HistoryMode> {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return 'device'
    const { data: allowed, error } = await supabase.rpc('cv_history_allowed')
    return !error && allowed === true ? 'server' : 'device'
  } catch {
    return 'device'
  }
}

export const cleanTitle = (title: string) => title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'CV sans titre'

// ── Serveur ───────────────────────────────────────────────────
interface Row { id: string; title: string; template_id: string | null; target_organization: string; target_role: string; created_at: string; expires_at: string; pdf_bytes: number; tex_bytes: number; pdf_path: string; tex_path: string }

const fromRow = (r: Row): SavedCv => ({ id: r.id, title: r.title, templateId: r.template_id, targetOrganization: r.target_organization, targetRole: r.target_role, createdAt: r.created_at, pdfBytes: r.pdf_bytes, texBytes: r.tex_bytes })

async function serverRow(id: string): Promise<Row> {
  const { data, error } = await supabase.from('cv_documents').select('*').eq('id', id).single()
  if (error || !data) throw new HistoryError('Document introuvable.')
  return data as Row
}

async function serverDelete(row: Pick<Row, 'id' | 'pdf_path' | 'tex_path'>) {
  await supabase.storage.from(BUCKET).remove([row.pdf_path, row.tex_path])
  const { error } = await supabase.from('cv_documents').delete().eq('id', row.id)
  if (error) throw new HistoryError('La suppression a échoué.')
}

const server = {
  async list(): Promise<SavedCv[]> {
    const { data, error } = await supabase.from('cv_documents').select('*').order('created_at', { ascending: false })
    if (error) throw new HistoryError('Historique indisponible.')
    const rows = (data ?? []) as Row[]
    // Purge des CV arrivés à expiration
    const expired = rows.filter(r => Date.parse(r.expires_at) < Date.now())
    await Promise.all(expired.map(r => serverDelete(r).catch(() => {})))
    return rows.filter(r => !expired.includes(r)).map(fromRow)
  },

  async save(input: SaveInput): Promise<SavedCv> {
    const { data: session } = await supabase.auth.getSession()
    const owner = session.session?.user.id
    if (!owner) throw new HistoryError('Session expirée : reconnectez-vous.')
    const id = crypto.randomUUID()
    const tex = new Blob([input.tex], { type: 'application/x-tex' })
    const row = {
      id, owner_id: owner, title: cleanTitle(input.title), template_id: input.templateId,
      target_organization: input.target.organization.trim().slice(0, 200), target_role: input.target.role.trim().slice(0, 200),
      pdf_path: `${owner}/${id}.pdf`, tex_path: `${owner}/${id}.tex`, pdf_bytes: input.pdf.size, tex_bytes: tex.size,
    }
    const { error } = await supabase.from('cv_documents').insert(row)
    if (error) throw new HistoryError(/cv_history_quota/.test(error.message) ? 'Limite de 30 CV atteinte : supprimez-en un pour enregistrer celui-ci.' : 'Enregistrement refusé.')
    const pdfUp = await supabase.storage.from(BUCKET).upload(row.pdf_path, input.pdf, { contentType: 'application/pdf', upsert: false })
    const texUp = pdfUp.error ? pdfUp : await supabase.storage.from(BUCKET).upload(row.tex_path, tex, { contentType: 'application/x-tex', upsert: false })
    if (pdfUp.error || texUp.error) {
      await serverDelete(row).catch(() => {})
      throw new HistoryError('Envoi des fichiers impossible : rien n’a été conservé.')
    }
    return fromRow({ ...row, created_at: new Date().toISOString(), expires_at: '' })
  },

  async file(id: string, kind: 'pdf' | 'tex'): Promise<Blob> {
    const row = await serverRow(id)
    const { data, error } = await supabase.storage.from(BUCKET).download(kind === 'pdf' ? row.pdf_path : row.tex_path)
    if (error || !data) throw new HistoryError('Fichier indisponible.')
    return data
  },

  /** Lien de téléchargement signé, valable 60 secondes */
  async link(id: string, kind: 'pdf' | 'tex', filename: string): Promise<string> {
    const row = await serverRow(id)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(kind === 'pdf' ? row.pdf_path : row.tex_path, 60, { download: filename })
    if (error || !data) throw new HistoryError('Lien de téléchargement indisponible.')
    return data.signedUrl
  },

  async remove(id: string): Promise<void> {
    await serverDelete(await serverRow(id))
  },
}

// ── Appareil (IndexedDB) ──────────────────────────────────────
interface DeviceEntry extends SavedCv { pdf: Blob; tex: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('latex-studio-history', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('cvs', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new HistoryError('Stockage de ce navigateur indisponible.'))
  })
}

async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction('cvs', mode).objectStore('cvs'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new HistoryError('Opération impossible dans ce navigateur.'))
    })
  } finally {
    db.close()
  }
}

const meta = (e: DeviceEntry): SavedCv => ({
  id: e.id, title: e.title, templateId: e.templateId, targetOrganization: e.targetOrganization,
  targetRole: e.targetRole, createdAt: e.createdAt, pdfBytes: e.pdfBytes, texBytes: e.texBytes,
})

const device = {
  async list(): Promise<SavedCv[]> {
    const all = await store<DeviceEntry[]>('readonly', s => s.getAll() as IDBRequest<DeviceEntry[]>)
    const expired = all.filter(e => Date.parse(e.createdAt) + RETENTION_MS < Date.now())
    await Promise.all(expired.map(e => store('readwrite', s => s.delete(e.id))))
    return all.filter(e => !expired.includes(e)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(meta)
  },

  async save(input: SaveInput): Promise<SavedCv> {
    if ((await device.list()).length >= MAX_DEVICE_ENTRIES) throw new HistoryError(`Limite de ${MAX_DEVICE_ENTRIES} CV atteinte sur cet appareil : supprimez-en un.`)
    const entry: DeviceEntry = {
      id: crypto.randomUUID(), title: cleanTitle(input.title), templateId: input.templateId,
      targetOrganization: input.target.organization.trim(), targetRole: input.target.role.trim(),
      createdAt: new Date().toISOString(), pdfBytes: input.pdf.size, texBytes: new Blob([input.tex]).size,
      pdf: input.pdf, tex: input.tex,
    }
    await store('readwrite', s => s.put(entry))
    return meta(entry)
  },

  async file(id: string, kind: 'pdf' | 'tex'): Promise<Blob> {
    const entry = await store<DeviceEntry | undefined>('readonly', s => s.get(id) as IDBRequest<DeviceEntry | undefined>)
    if (!entry) throw new HistoryError('Document introuvable.')
    return kind === 'pdf' ? entry.pdf : new Blob([entry.tex], { type: 'application/x-tex' })
  },

  async link(id: string, kind: 'pdf' | 'tex'): Promise<string> {
    return URL.createObjectURL(await device.file(id, kind))
  },

  async remove(id: string): Promise<void> {
    await store('readwrite', s => s.delete(id))
  },
}

export const history = { server, device }

/**
 * Code restauré : la photo (absente de l'historique) redevient le marqueur %%PHOTO%%,
 * pour que le document se recompile sans photo.jpg.
 */
export function restorableCode(tex: string): string {
  return tex.replace(/\\includegraphics\[width=[\d.]+cm,keepaspectratio\]\{photo\.jpg\}/g, '%%PHOTO%%')
}

// src/features/latex-studio/lib/importCv.ts
// Import d'un CV : le fichier est lu en mémoire et envoyé à blog-api, qui le fait analyser par le
// service isolé cv-extractor ; rien n'est conservé (ni dans le navigateur, ni sur le serveur).
// Images et PDF scannés : pages réencodées en JPEG par le navigateur (métadonnées et contenu actif
// éliminés), puis lues par un modèle à capacité visuelle (latex.import.ocr), si le centre IA en
// a validé un. Le texte est ensuite structuré (latex.import.structure) et vérifié par l'utilisateur.
import { runAiFeature } from '../../../lib/aiClient'
import { openPdf } from './pdfjs'
import { normalizeCv, forServer, type CvData } from './cvData'
import type { Target } from './target'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const ACCEPT = '.pdf,.docx,.txt,.rtf,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/rtf,text/rtf,image/jpeg,image/png'
const MAX_OCR_PAGES = 3

export type ImportKind = 'pdf' | 'docx' | 'txt' | 'rtf' | 'image'

const MIME: Record<Exclude<ImportKind, 'image'>, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',
}

export class ImportFailure extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** Format d'après l'extension et le type annoncé ; l'API revérifie la signature du contenu */
export function classify(file: File): ImportKind | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt') return 'txt'
  if (ext === 'rtf') return 'rtf'
  if (['jpg', 'jpeg', 'png'].includes(ext) && /^image\/(jpeg|png)$/.test(file.type)) return 'image'
  return null
}

export interface Extracted { text: string; truncated: boolean; needsOcr: boolean }

export async function extractText(file: File, kind: Exclude<ImportKind, 'image'>, signal?: AbortSignal): Promise<Extracted> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/cv/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Type': MIME[kind] },
      body: file,
      signal,
    })
  } catch {
    throw new ImportFailure('IMPORT_NETWORK', 'Service d’import injoignable. Vérifiez votre connexion.')
  }
  const body = await res.json().catch(() => null) as { text?: unknown; truncated?: unknown; needsOcr?: unknown; error?: unknown; code?: unknown } | null
  if (!res.ok || typeof body?.text !== 'string') {
    throw new ImportFailure(typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`, typeof body?.error === 'string' ? body.error : 'Le fichier n’a pas pu être lu.')
  }
  return { text: body.text, truncated: body.truncated === true, needsOcr: body.needsOcr === true }
}

/** Image réencodée en JPEG (2 000 px au plus) : seuls les pixels sont conservés */
async function toJpeg(source: CanvasImageSource & { width: number; height: number }, maxSide = 2000): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.85)
  if (url.length > 5_400_000) throw new ImportFailure('IMPORT_TOO_LARGE', 'Image trop volumineuse après conversion.')
  return url
}

export async function imagePages(file: File, kind: 'pdf' | 'image'): Promise<string[]> {
  if (kind === 'image') {
    const bitmap = await createImageBitmap(file)
    try { return [await toJpeg(bitmap)] } finally { bitmap.close() }
  }
  const task = await openPdf(file)
  try {
    const doc = await task.promise
    const pages: string[] = []
    for (let n = 1; n <= Math.min(doc.numPages, MAX_OCR_PAGES); n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 1600 / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      pages.push(await toJpeg(canvas))
    }
    return pages
  } finally {
    await task.destroy().catch(() => {})
  }
}

/** Lecture des pages par un modèle à capacité visuelle validée (une requête par page) */
export async function readImages(images: string[], onPage?: (n: number) => void): Promise<string> {
  const texts: string[] = []
  for (const [i, image] of images.entries()) {
    onPage?.(i + 1)
    texts.push(await runAiFeature('latex.import.ocr', { image }))
  }
  return texts.join('\n\n')
}

export async function structureText(text: string, lang: 'fr' | 'en'): Promise<CvData> {
  const content = await runAiFeature('latex.import.structure', { text: text.slice(0, 20_000), lang })
  return normalizeCv(JSON.parse(content))
}

export interface RewriteFlag { path: string; reason: 'number' | 'unknown_skill' }
export interface RewriteResult { cv: CvData; flags: RewriteFlag[]; suggestions: string[] }

export async function rewriteCv(cv: CvData, target: Target, lang: 'fr' | 'en'): Promise<RewriteResult> {
  const content = await runAiFeature('latex.rewrite', { cv: forServer(cv), target: { organization: target.organization.trim(), role: target.role.trim() }, lang })
  const parsed = JSON.parse(content) as { cv?: unknown; flags?: unknown; suggestions?: unknown }
  return {
    cv: normalizeCv(parsed.cv),
    flags: (Array.isArray(parsed.flags) ? parsed.flags : []).filter((f): f is RewriteFlag => !!f && typeof f.path === 'string').slice(0, 50),
    suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).filter((s): s is string => typeof s === 'string').slice(0, 3),
  }
}

/** Champs rédactionnels modifiés par la réécriture, pour validation un par un */
export interface RewriteChange { key: string; label: string; before: string; after: string }

export function rewriteChanges(before: CvData, after: CvData): RewriteChange[] {
  const changes: RewriteChange[] = []
  const push = (key: string, label: string, a: string, b: string) => { if (a !== b) changes.push({ key, label, before: a, after: b }) }
  push('headline', 'Titre professionnel', before.identity.headline, after.identity.headline)
  push('summary', 'Profil', before.summary, after.summary)
  before.experiences.forEach((e, i) => push(`exp:${i}`, `Expérience — ${e.role || e.organization}`, e.bullets.filter(Boolean).join('\n'), (after.experiences[i]?.bullets ?? []).join('\n')))
  before.projects.forEach((p, i) => push(`proj:${i}`, `Projet — ${p.name}`, p.description, after.projects[i]?.description ?? p.description))
  before.skills.forEach((s, i) => push(`skills:${i}`, `Compétences — ${s.category || 'ordre'}`, s.items.filter(Boolean).join(', '), (after.skills[i]?.items ?? []).join(', ')))
  return changes
}

/** Applique seulement les changements acceptés ; tout le reste vient du CV d'origine */
export function applyRewrite(before: CvData, after: CvData, accepted: Set<string>): CvData {
  const cv: CvData = JSON.parse(JSON.stringify(before))
  if (accepted.has('headline')) cv.identity.headline = after.identity.headline
  if (accepted.has('summary')) cv.summary = after.summary
  cv.experiences.forEach((e, i) => { if (accepted.has(`exp:${i}`) && after.experiences[i]) e.bullets = [...after.experiences[i].bullets] })
  cv.projects.forEach((p, i) => { if (accepted.has(`proj:${i}`) && after.projects[i]) p.description = after.projects[i].description })
  cv.skills.forEach((s, i) => { if (accepted.has(`skills:${i}`) && after.skills[i]) s.items = [...after.skills[i].items] })
  return cv
}

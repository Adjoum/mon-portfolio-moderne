// src/lib/latexCompile.ts
// Aperçu PDF de l'éditeur LaTeX : POST /api/cv/compile (blog-api), qui délègue au service isolé
// latex-runner. Le navigateur n'envoie que le source et la photo recadrée (JPEG).
// Le PDF reçu est vérifié (%PDF-) et toujours typé application/pdf : un contenu HTML ne peut
// jamais être affiché dans l'origine du site sous couvert d'aperçu.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

/** Au-delà du délai du serveur (30 s) */
const CLIENT_TIMEOUT_MS = 45_000

export interface LatexCompileDetail { line?: number; message: string; context?: string }

/** Codes qui signifient « aperçu indisponible » (et non une erreur du document) */
const UNAVAILABLE = new Set(['LATEX_COMPILE_DISABLED', 'LATEX_RUNNER_UNAVAILABLE', 'LATEX_RUNNER_ERROR'])

const FALLBACK: Record<string, string> = {
  LATEX_NETWORK:           'Service de compilation injoignable. Vérifiez votre connexion.',
  LATEX_TIMEOUT:           'La compilation a dépassé la durée maximale.',
  LATEX_INVALID_RESPONSE:  'Réponse inattendue du service de compilation.',
  RATE_LIMIT_EXCEEDED:     'Trop de compilations rapprochées. Patientez quelques minutes.',
  LATEX_COMPILE_DISABLED:  'L’aperçu PDF est momentanément indisponible. Téléchargez le fichier .tex.',
}

export class LatexCompileError extends Error {
  readonly code: string
  readonly status: number
  readonly details: LatexCompileDetail[]
  readonly line?: number
  readonly retryAfterSec?: number

  constructor(code: string, status: number, message: string, details: LatexCompileDetail[] = [], line?: number, retryAfterSec?: number) {
    super(message)
    this.name = 'LatexCompileError'
    this.code = code
    this.status = status
    this.details = details
    this.line = line
    this.retryAfterSec = retryAfterSec
  }

  /** Le service est coupé ou en panne : proposer le .tex plutôt que de réessayer en boucle */
  get unavailable(): boolean {
    return UNAVAILABLE.has(this.code)
  }

  /** Limite atteinte : suspendre la compilation automatique */
  get throttled(): boolean {
    return this.status === 429
  }
}

function readDetails(raw: unknown): LatexCompileDetail[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).flatMap((d): LatexCompileDetail[] => {
    if (!d || typeof d !== 'object' || typeof (d as { message?: unknown }).message !== 'string') return []
    const { line, message, context } = d as { line?: unknown; message: string; context?: unknown }
    return [{
      message: message.slice(0, 240),
      ...(Number.isInteger(line) ? { line: line as number } : {}),
      ...(typeof context === 'string' ? { context: context.slice(0, 120) } : {}),
    }]
  })
}

/** Avertissement de mise en page relevé par TeX (débordement, caractère absent de la police…) */
export interface LatexWarning { kind: 'overfull' | 'missing-char' | 'other'; line?: number; message: string }

export interface LatexCompileResult { pdf: Blob; warnings: LatexWarning[] }

/** En-tête X-Latex-Warnings (JSON en base64, filtré par le serveur) : relu sans faire confiance à son contenu */
export function readWarnings(header: string | null): LatexWarning[] {
  if (!header || header.length > 8192) return []
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(header), c => c.charCodeAt(0)))
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 20).flatMap((w): LatexWarning[] => {
      if (!w || typeof w !== 'object' || typeof (w as { message?: unknown }).message !== 'string') return []
      const { kind, line, message } = w as { kind?: unknown; line?: unknown; message: string }
      return [{
        kind: kind === 'overfull' || kind === 'missing-char' ? kind : 'other',
        message: message.slice(0, 200),
        ...(Number.isInteger(line) ? { line: line as number } : {}),
      }]
    })
  } catch {
    return []
  }
}

/** Compile le source (photo optionnelle en data URL JPEG) et renvoie le PDF et ses avertissements */
export async function compileLatexPdf(code: string, photo: string | null, signal?: AbortSignal): Promise<LatexCompileResult> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/cv/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(photo ? { code, photo } : { code }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]) : AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' && signal?.aborted) throw err
    const timeout = (err as Error)?.name === 'TimeoutError'
    throw new LatexCompileError(timeout ? 'LATEX_TIMEOUT' : 'LATEX_NETWORK', 0, FALLBACK[timeout ? 'LATEX_TIMEOUT' : 'LATEX_NETWORK'])
  }

  if (res.ok) {
    const bytes = new Uint8Array(await res.arrayBuffer())
    const header = String.fromCharCode(...bytes.subarray(0, 5))
    if (!(res.headers.get('content-type') ?? '').startsWith('application/pdf') || header !== '%PDF-') {
      throw new LatexCompileError('LATEX_INVALID_RESPONSE', res.status, FALLBACK.LATEX_INVALID_RESPONSE)
    }
    return { pdf: new Blob([bytes], { type: 'application/pdf' }), warnings: readWarnings(res.headers.get('X-Latex-Warnings')) }
  }

  const body = await res.json().catch(() => null) as { code?: unknown; error?: unknown; details?: unknown; line?: unknown } | null
  const errorCode = typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`
  const message = typeof body?.error === 'string' ? body.error : (FALLBACK[errorCode] ?? 'La compilation a échoué.')
  const retry = Number(res.headers.get('Retry-After')) || undefined
  const line = Number.isInteger(body?.line) ? body?.line as number : undefined
  throw new LatexCompileError(errorCode, res.status, message, readDetails(body?.details), line, retry)
}

/** Retire les balises Markdown qu'un modèle ajoute parfois autour du code (```latex … ```) */
export function stripCodeFences(text: string): string {
  return text.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
}

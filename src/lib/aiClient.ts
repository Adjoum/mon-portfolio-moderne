// src/lib/aiClient.ts
// Client des fonctionnalités IA : tout passe par blog-api (POST /api/ai/run/:featureId).
// Le navigateur n'envoie qu'un identifiant de fonctionnalité et des données ; il ne connaît
// ni fournisseur, ni modèle, ni clé. Prompts, limites et quotas sont décidés par le serveur.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export type AiFeatureId =
  | 'cv.generate' | 'cv.review' | 'cv.import.structure' | 'cv.import.ocr'
  | 'latex.generate' | 'latex.improve' | 'latex.fix'
  | 'latex.import.structure' | 'latex.import.ocr' | 'latex.rewrite'

/** Délai côté navigateur : au-delà du plus long délai serveur (85 s) */
const CLIENT_TIMEOUT_MS = 100_000

const MESSAGES: Record<string, string> = {
  AI_FEATURE_DISABLED:    'Cette fonction IA est momentanément désactivée.',
  AI_FEATURE_UNAVAILABLE: 'Cette fonction IA est momentanément indisponible.',
  AI_QUOTA_EXCEEDED:      'Limite d’utilisation de l’IA atteinte pour aujourd’hui. Réessayez demain.',
  AI_BUDGET_EXCEEDED:     'Cette fonction IA a atteint sa limite d’utilisation. Réessayez plus tard.',
  AI_BUSY:                'Le service IA est très sollicité. Réessayez dans un instant.',
  RATE_LIMIT_EXCEEDED:    'Trop de requêtes. Patientez une minute avant de réessayer.',
  AI_TIMEOUT:             'Le service IA n’a pas répondu à temps. Réessayez.',
  AI_REQUEST_REJECTED:    'La demande n’a pas pu être traitée : contenu trop long ou non conforme.',
  AI_CONTENT_FILTERED:    'La demande a été refusée par le filtre de contenu.',
  AI_PROVIDER_ERROR:      'Le service IA a rencontré une erreur. Réessayez plus tard.',
  AI_NETWORK:             'Service IA injoignable. Vérifiez votre connexion.',
}

/** Codes signifiant « fonction indisponible » (et non une erreur de l'utilisateur) */
const UNAVAILABLE_CODES = new Set(['AI_FEATURE_DISABLED', 'AI_FEATURE_UNAVAILABLE'])

export class AiFeatureError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfterSec?: number

  constructor(code: string, status: number, message: string, retryAfterSec?: number) {
    super(message)
    this.name = 'AiFeatureError'
    this.code = code
    this.status = status
    this.retryAfterSec = retryAfterSec
  }

  /** La fonction est coupée côté serveur : proposer une alternative sans IA */
  get unavailable(): boolean {
    return UNAVAILABLE_CODES.has(this.code)
  }
}

/** Message utilisateur pour une réponse d'erreur de la passerelle */
export function describeAiError(status: number, body: { code?: unknown; field?: unknown } | null): string {
  const code = typeof body?.code === 'string' ? body.code : ''
  if (code === 'AI_INVALID_INPUT') {
    return typeof body?.field === 'string'
      ? `Données invalides (${body.field}) : vérifiez la longueur et le format.`
      : 'Données invalides : vérifiez la longueur et le format.'
  }
  if (MESSAGES[code]) return MESSAGES[code]
  if (status === 413) return 'Contenu trop volumineux pour être traité.'
  if (status === 429) return MESSAGES.RATE_LIMIT_EXCEEDED
  return MESSAGES.AI_PROVIDER_ERROR
}

/** Exécute une fonctionnalité IA côté serveur et renvoie le texte produit */
export async function runAiFeature(featureId: AiFeatureId, input: Record<string, unknown>): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/ai/run/${featureId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ input }),
      signal:  AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })
  } catch (err) {
    const timeout = (err as Error)?.name === 'TimeoutError'
    throw new AiFeatureError(timeout ? 'AI_TIMEOUT' : 'AI_NETWORK', 0, timeout ? MESSAGES.AI_TIMEOUT : MESSAGES.AI_NETWORK)
  }

  const body = await res.json().catch(() => null) as { content?: unknown; code?: string; field?: string } | null
  if (!res.ok) {
    const code = typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`
    const retry = Number(res.headers.get('Retry-After')) || undefined
    throw new AiFeatureError(code, res.status, describeAiError(res.status, body), retry)
  }
  if (typeof body?.content !== 'string') {
    throw new AiFeatureError('AI_PROVIDER_ERROR', res.status, MESSAGES.AI_PROVIDER_ERROR)
  }
  return body.content
}

export interface AiFeatureStatus { available: boolean; reason?: 'disabled' | 'not_configured' }

/** Disponibilité des fonctionnalités (aucun fournisseur ni modèle exposé). null si l'API est injoignable */
export async function fetchAiAvailability(): Promise<Record<string, AiFeatureStatus> | null> {
  try {
    const res = await fetch(`${API_URL}/ai/features`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const body = await res.json() as { features?: ({ id: string } & AiFeatureStatus)[] }
    return Object.fromEntries((body.features ?? []).map(({ id, ...status }) => [id, status]))
  } catch {
    return null
  }
}

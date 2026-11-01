// blog-api/src/ai/providers/http.ts
// Appels HTTP communs aux adaptateurs : fetch typé, délais et annulation, erreurs normalisées.
// Le corps d'une réponse d'erreur n'est jamais conservé : seul son code technique l'est.

import { ProviderError, type NormalizedErrorCode, type NormalizedRequest, type GenerationParam } from './types';

export interface JsonResponse<T> {
  status: number;
  ok: boolean;
  body: T | null;
}

export function networkError(err: unknown, signal: AbortSignal): ProviderError {
  const reason = (signal.reason as Error | undefined)?.name;
  if (reason === 'TimeoutError') return new ProviderError('timeout');
  if (signal.aborted) return new ProviderError('aborted');
  return new ProviderError('unavailable', undefined, (err as Error)?.name);
}

export async function requestJson<T>(url: string, init: RequestInit, signal: AbortSignal): Promise<JsonResponse<T>> {
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    throw networkError(err, signal);
  }
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, ok: res.ok, body };
}

/** Champs utiles d'un corps d'erreur ; `message` sert au classement puis est oublié */
export interface ErrorInfo {
  code?: string;
  type?: string;
  param?: string;
  message?: string;
}

const QUOTA_CODES = new Set([
  'insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'billing_hard_limit_reached',
]);

/** Motifs des messages d'erreur documentés ou observés ; le message n'est jamais conservé */
const MESSAGE_RULES: [RegExp, NormalizedErrorCode][] = [
  [/organization must be verified|do(es)? not have access to (the )?model|not available (on|for) your (plan|account|tier)|requires? (a )?(paid|higher) (plan|tier)/i, 'permission_denied'],
  [/only supported in v1\/responses|not a chat model|not supported in the v1\/chat\/completions|use the responses api/i, 'endpoint_incompatible'],
  [/image_url is only supported by certain models|does not support (image|vision)|image input is not supported|images? (inputs? )?(are|is) not supported|image inputs? (are|is) not supported|no endpoints found that support image|vision is not supported|multimodal.* not supported|model does not support image/i, 'vision_unsupported'],
  [/invalid image|image.*(could not|cannot|can't|failed to) be (decoded|processed|parsed)|(could not|unable to) process (input )?image|does not represent a valid image|not (appear to be )?a valid (png|jpe?g|gif|webp|image)|unsupported image|image_parse_error|invalid_image/i, 'invalid_image'],
  [/unsupported parameter|unsupported value|is not supported with this model|not supported (by|for) this model|unrecognized request argument|extra inputs are not permitted|unknown (parameter|field|name)/i, 'unsupported_parameter'],
  [/context length|context window|maximum context|too many tokens|prompt is too long|input is too long/i, 'context_too_long'],
  [/credit balance|exceeded your current quota|billing/i, 'quota_exceeded'],
];

/** Paramètre visé par le message (« 'temperature' does not support… », « Unsupported parameter: 'top_p' ») */
function paramFromMessage(message: string): string | undefined {
  const match = /(?:parameter|value|argument)s?:?\s*'([a-z_.[\]0-9]{1,60})'|'([a-z_.[\]0-9]{1,60})' (?:does not support|is not supported)|^([a-z_.]{1,60}): extra inputs/im.exec(message);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/** Nom de paramètre sûr à journaliser : identifiant technique uniquement */
const safeParam = (param: unknown) => (typeof param === 'string' && /^[A-Za-z0-9_.[\]-]{1,80}$/.test(param) ? param : undefined);

/** Classement commun des statuts HTTP ; `info` affine le cas selon le fournisseur */
export function classifyError(status: number, info: ErrorInfo = {}): ProviderError {
  const code = info.code ?? '';
  const type = info.type ?? '';
  const message = info.message ?? '';
  const param = safeParam(info.param) ?? safeParam(paramFromMessage(message));
  const detail = `HTTP ${status}${code ? ` ${code}` : ''}${type && type !== code ? ` ${type}` : ''}${param ? ` param=${param}` : ''}`;
  const error = (normalized: NormalizedErrorCode, withParam = false) => new ProviderError(normalized, status, detail, withParam ? param : undefined);

  if (status === 401) return error('auth');
  if (QUOTA_CODES.has(code) || QUOTA_CODES.has(type)) return error('quota_exceeded');
  if (status === 429) return error('rate_limited');
  if (status === 413) return error('payload_too_large');
  if (code === 'context_length_exceeded' || code === 'string_above_max_length') return error('context_too_long');
  if (code === 'content_filter' || code === 'content_policy_violation') return error('content_filtered');
  if (code === 'model_not_found' && !/only supported in v1\/responses|not a chat model/i.test(message)) return error('model_not_found');
  if (code === 'invalid_image_format' || code === 'image_parse_error' || code === 'invalid_image' || code === 'image_too_large') return error('invalid_image');
  if (code === 'unsupported_parameter' || code === 'unsupported_value') return error('unsupported_parameter', true);

  if (status >= 400 && status < 500) {
    for (const [pattern, normalized] of MESSAGE_RULES) {
      if (pattern.test(message)) return error(normalized, normalized === 'unsupported_parameter');
    }
    // Contenu image refusé sans message explicite : le champ fautif le dit
    if (param && /image/i.test(param)) return error('vision_unsupported');
    if (status === 403) return error('permission_denied');
    if (status === 404) return error('model_not_found');
    if (status === 400 && code === 'invalid_api_key') return error('auth');
    return error('bad_request', true);
  }
  return error('unavailable');
}

/** Compatibilité : classement à partir d'un seul code technique */
export function httpError(status: number, code: string): ProviderError {
  return classifyError(status, { code });
}

/** Corps d'erreur au format OpenAI ({ error: { message, type, param, code } }) et variantes */
export function errorInfo(body: unknown): ErrorInfo {
  const root = (body ?? {}) as Record<string, unknown>;
  const err = root.error;
  if (typeof err === 'string') return { message: err, code: typeof root.code === 'string' ? root.code : undefined };
  const e = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
  return {
    code:    str(e.code) ?? str(root.code),
    type:    str(e.type),
    param:   str(e.param),
    message: str(e.message) ?? str(root.message),
  };
}

export function allowedParams(req: NormalizedRequest, supported: ReadonlySet<GenerationParam>) {
  return Object.fromEntries(Object.entries(req.params).filter(([key]) => supported.has(key as GenerationParam))) as
    Partial<Record<GenerationParam, number | string>>;
}

/** Sépare une data URL validée en type et contenu base64 */
export function parseDataUrl(dataUrl: string): { mime: string; data: string } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new ProviderError('bad_request', undefined, 'image invalide');
  return { mime: match[1], data: match[2] };
}

const TRUNCATED = new Set(['length', 'max_tokens', 'MAX_TOKENS', 'max_output_tokens', 'incomplete']);

/** Réponse textuelle obligatoire : un modèle à raisonnement peut épuiser sa limite avant de répondre */
export function requireText(content: unknown, status: number, finish: string | undefined): string {
  if (typeof content !== 'string' || !content.trim()) {
    // Limite de sortie consommée par la réflexion avant toute réponse visible
    if (finish && TRUNCATED.has(finish)) throw new ProviderError('output_truncated', status, `réponse vide (${finish})`);
    throw new ProviderError('invalid_response', status, `réponse vide (${finish ?? 'inconnu'})`);
  }
  return content;
}

export const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
export const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** Limite le nombre de pages lues dans un catalogue */
export const MAX_CATALOG_PAGES = 20;

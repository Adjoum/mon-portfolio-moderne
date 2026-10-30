// blog-api/src/ai/providers/http.ts
// Appels HTTP communs aux adaptateurs : fetch typé, délais et annulation, erreurs normalisées.
// Le corps d'une réponse d'erreur n'est jamais conservé : seul son code technique l'est.

import { ProviderError, type NormalizedRequest, type GenerationParam } from './types';

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

/** Classement commun des statuts HTTP ; `code` affine le cas selon le fournisseur */
export function httpError(status: number, code: string): ProviderError {
  const detail = `HTTP ${status}${code ? ` ${code}` : ''}`;
  if (status === 401 || status === 403) return new ProviderError('auth', status, detail);
  if (status === 404 || code === 'model_not_found') return new ProviderError('model_not_found', status, detail);
  if (status === 429) return new ProviderError(code === 'insufficient_quota' ? 'quota_exceeded' : 'rate_limited', status, detail);
  if (code === 'context_length_exceeded') return new ProviderError('context_too_long', status, detail);
  if (code === 'content_filter' || code === 'content_policy_violation') return new ProviderError('content_filtered', status, detail);
  if (status >= 400 && status < 500) return new ProviderError('bad_request', status, detail);
  return new ProviderError('unavailable', status, detail);
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

/** Réponse textuelle obligatoire : un modèle à raisonnement peut épuiser sa limite avant de répondre */
export function requireText(content: unknown, status: number, finish: string | undefined): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new ProviderError('invalid_response', status, `réponse vide (${finish ?? 'inconnu'})`);
  }
  return content;
}

export const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
export const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** Limite le nombre de pages lues dans un catalogue */
export const MAX_CATALOG_PAGES = 20;

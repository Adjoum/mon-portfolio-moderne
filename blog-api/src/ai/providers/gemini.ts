// blog-api/src/ai/providers/gemini.ts
// Adaptateur Google Gemini (generateContent). La clé passe par l'en-tête x-goog-api-key,
// jamais par l'URL : elle apparaîtrait sinon dans les journaux. L'identifiant du modèle,
// lui, entre dans l'URL : il est validé par isValidModelId et encodé.

import { allowedParams, asNumber, asString, classifyError, MAX_CATALOG_PAGES, parseDataUrl, requestJson, requireText } from './http';
import {
  ProviderError,
  type CallContext,
  type ContentPart,
  type GenerationParam,
  type ModelInfo,
  type NormalizedRequest,
  type NormalizedResponse,
  type ProviderAdapter,
} from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set(['temperature', 'top_p', 'top_k', 'stop']);
const FILTERED_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);

interface GeminiError { status?: string; message?: string; details?: { reason?: string; fieldViolations?: { field?: string }[] }[] }

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: GeminiError;
}

interface ModelPage {
  models?: Record<string, unknown>[];
  nextPageToken?: string;
  error?: GeminiError;
}

function toError(status: number, error: GeminiError | undefined): ProviderError {
  // Une clé invalide répond HTTP 400 chez Google
  if (error?.details?.some(detail => detail.reason === 'API_KEY_INVALID')) return new ProviderError('auth', status, 'API_KEY_INVALID');
  const field = error?.details?.flatMap(detail => detail.fieldViolations ?? []).find(v => v.field)?.field;
  // Google répond PERMISSION_DENIED (403) pour un modèle non ouvert à ce projet, NOT_FOUND pour un modèle inconnu
  return classifyError(status, { code: error?.status === 'NOT_FOUND' ? 'model_not_found' : error?.status, param: field, message: error?.message });
}

function toPart(part: ContentPart) {
  if (part.type === 'text') return { text: part.text };
  const { mime, data } = parseDataUrl(part.dataUrl);
  return { inlineData: { mimeType: mime, data } };
}

function toModel(raw: Record<string, unknown>): ModelInfo[] {
  if (typeof raw.name !== 'string') return [];
  const methods = raw.supportedGenerationMethods;
  if (!Array.isArray(methods) || !methods.includes('generateContent')) return [];
  return [{
    id: raw.name.replace(/^models\//, ''),
    displayName:         asString(raw.displayName),
    contextWindow:       asNumber(raw.inputTokenLimit),
    maxCompletionTokens: asNumber(raw.outputTokenLimit),
  }];
}

export function createGeminiAdapter(baseUrl: string): ProviderAdapter {
  return {
    id: 'gemini',
    supportedParams: SUPPORTED_PARAMS,
    supportsImages: true,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const { temperature, top_p, top_k, stop } = allowedParams(req, SUPPORTED_PARAMS);
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(ctx.model)}:generateContent`;
      const { status, ok, body } = await requestJson<GenerateResponse>(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.content.map(toPart) })),
          generationConfig: {
            maxOutputTokens: req.maxOutputTokens,
            ...(temperature !== undefined ? { temperature } : {}),
            ...(top_p !== undefined ? { topP: top_p } : {}),
            ...(top_k !== undefined ? { topK: top_k } : {}),
            ...(stop ? { stopSequences: [stop] } : {}),
            ...(req.output === 'json' && !req.adapt?.omitJsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      }, ctx.signal);
      if (!ok) throw toError(status, body?.error);
      if (body?.promptFeedback?.blockReason) throw new ProviderError('content_filtered', status);

      const candidate = body?.candidates?.[0];
      const finish = candidate?.finishReason;
      if (finish && FILTERED_REASONS.has(finish)) throw new ProviderError('content_filtered', status);

      const text = (candidate?.content?.parts ?? []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
      const usage = body?.usageMetadata;
      return {
        content: requireText(text, status, finish),
        finishReason: finish,
        // Les jetons de réflexion sont facturés comme de la sortie
        usage: { inputTokens: usage?.promptTokenCount, outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) },
      };
    },

    async listModels(ctx): Promise<ModelInfo[]> {
      const models: ModelInfo[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
        const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
        const { status, ok, body } = await requestJson<ModelPage>(`${baseUrl}/v1beta/models?${query}`, {
          headers: { 'x-goog-api-key': ctx.apiKey },
        }, ctx.signal);
        if (!ok) throw toError(status, body?.error);
        models.push(...(body?.models ?? []).flatMap(toModel));
        if (!body?.nextPageToken) break;
        pageToken = body.nextPageToken;
      }
      return models;
    },
  };
}

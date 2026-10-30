// blog-api/src/ai/providers/openaiCompatible.ts
// Base partagée des fournisseurs au format Chat Completions (OpenAI, Groq, OpenRouter).
// Fetch typé : aucun SDK, aucune liste de modèles. Le modèle vient de l'affectation résolue côté serveur.

import { allowedParams, httpError, requestJson, requireText } from './http';
import {
  ProviderError,
  type ProviderAdapter,
  type ProviderId,
  type NormalizedRequest,
  type NormalizedResponse,
  type CallContext,
  type GenerationParam,
  type ModelInfo,
} from './types';

export interface ChatCompletionsOptions {
  id: ProviderId;
  supportsImages: boolean;
  supportedParams: ReadonlySet<GenerationParam>;
  /** Les modèles à raisonnement d'OpenAI refusent max_tokens */
  outputLimitField?: 'max_completion_tokens' | 'max_tokens';
  /** Champs imposés à chaque requête (par exemple le routage d'OpenRouter) */
  fixedBody?: Record<string, unknown>;
  /** Traduction des paramètres normalisés lorsque le fournisseur les nomme autrement */
  mapParams?: (params: Partial<Record<GenerationParam, number | string>>) => Record<string, unknown>;
  /** Métadonnées propres au catalogue du fournisseur */
  mapModel?: (raw: Record<string, unknown>) => Partial<ModelInfo>;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: string; type?: string };
}

interface ModelListResponse {
  data?: Record<string, unknown>[];
  error?: { code?: string; type?: string };
}

function toMessages(req: NormalizedRequest) {
  return req.messages.map(m => ({
    role: m.role,
    content: m.content.map(part => part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image_url', image_url: { url: part.dataUrl, detail: part.detail } }),
  }));
}

export function createChatCompletionsAdapter(baseUrl: string, options: ChatCompletionsOptions): ProviderAdapter {
  const { id, supportsImages, supportedParams, outputLimitField = 'max_completion_tokens', fixedBody = {}, mapParams = p => p, mapModel } = options;

  return {
    id,
    supportedParams,
    supportsImages,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const { status, ok, body } = await requestJson<ChatCompletionResponse>(`${baseUrl}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
        body: JSON.stringify({
          model: ctx.model,
          [outputLimitField]: req.maxOutputTokens,
          ...fixedBody,
          ...mapParams(allowedParams(req, supportedParams)),
          ...(req.output === 'json' ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: req.system }, ...toMessages(req)],
        }),
      }, ctx.signal);
      if (!ok) throw httpError(status, body?.error?.code ?? body?.error?.type ?? '');

      const choice = body?.choices?.[0];
      const finish = choice?.finish_reason;
      if (finish === 'content_filter') throw new ProviderError('content_filtered', status);

      return {
        content: requireText(choice?.message?.content, status, finish),
        finishReason: finish,
        usage: { inputTokens: body?.usage?.prompt_tokens, outputTokens: body?.usage?.completion_tokens },
      };
    },

    // Métadonnées uniquement : aucune génération, aucune facturation
    async listModels(ctx): Promise<ModelInfo[]> {
      const { status, ok, body } = await requestJson<ModelListResponse>(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${ctx.apiKey}` },
      }, ctx.signal);
      if (!ok) throw httpError(status, body?.error?.code ?? body?.error?.type ?? '');

      return (body?.data ?? []).flatMap(raw => typeof raw.id === 'string' ? [{ id: raw.id, ...mapModel?.(raw) }] : []);
    },
  };
}

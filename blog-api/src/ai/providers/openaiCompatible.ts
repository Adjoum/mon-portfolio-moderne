// blog-api/src/ai/providers/openaiCompatible.ts
// Base partagée des fournisseurs au format Chat Completions (OpenAI, Groq, OpenRouter).
// Fetch typé : aucun SDK, aucune liste de modèles. Le modèle vient de l'affectation résolue côté serveur.
// La forme de la requête dépend du modèle (capabilities.ts) et des corrections d'adaptive.ts :
// champ de limite de sortie, champ `detail` des images, mode JSON, repli sur l'API Responses.

import { allowedParams, classifyError, errorInfo, requestJson, requireText } from './http';
import { modelProfile } from './capabilities';
import { callResponses } from './responses';
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
  /** Champs imposés à chaque requête (par exemple le routage d'OpenRouter) */
  fixedBody?: Record<string, unknown>;
  /** Traduction des paramètres normalisés lorsque le fournisseur les nomme autrement */
  mapParams?: (params: Partial<Record<GenerationParam, number | string>>) => Record<string, unknown>;
  /** Métadonnées propres au catalogue du fournisseur */
  mapModel?: (raw: Record<string, unknown>) => Partial<ModelInfo>;
  /** Le fournisseur sert aussi l'API Responses (modèles qui n'existent que là) */
  responsesEndpoint?: boolean;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ModelListResponse {
  data?: Record<string, unknown>[];
}

function toMessages(req: NormalizedRequest, detail: boolean) {
  return req.messages.map(m => ({
    role: m.role,
    content: m.content.map(part => part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image_url', image_url: { url: part.dataUrl, ...(detail ? { detail: part.detail } : {}) } }),
  }));
}

export function createChatCompletionsAdapter(baseUrl: string, options: ChatCompletionsOptions): ProviderAdapter {
  const { id, supportsImages, supportedParams, fixedBody = {}, mapParams = p => p, mapModel, responsesEndpoint = false } = options;

  return {
    id,
    supportedParams,
    supportsImages,
    supportsResponsesEndpoint: responsesEndpoint,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const profile = modelProfile(id, ctx.model);
      const adapt = req.adapt ?? {};
      if (responsesEndpoint && adapt.endpoint === 'responses') {
        return callResponses(baseUrl, req, ctx, { supportedParams, jsonMode: true, imageDetail: profile.imageDetail });
      }

      const outputLimitField = adapt.outputLimitField ?? profile.outputLimitField ?? 'max_completion_tokens';
      const { status, ok, body } = await requestJson<ChatCompletionResponse>(`${baseUrl}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
        body: JSON.stringify({
          model: ctx.model,
          [outputLimitField]: req.maxOutputTokens,
          ...fixedBody,
          ...mapParams(allowedParams(req, supportedParams)),
          ...(req.output === 'json' && !adapt.omitJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: req.system }, ...toMessages(req, profile.imageDetail && !adapt.omitImageDetail)],
        }),
      }, ctx.signal);
      if (!ok) throw classifyError(status, errorInfo(body));

      const choice = body?.choices?.[0];
      const finish = choice?.finish_reason;
      if (finish === 'content_filter') throw new ProviderError('content_filtered', status);
      if (typeof choice?.message?.refusal === 'string' && choice.message.refusal) throw new ProviderError('content_filtered', status, 'refusal');

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
      if (!ok) throw classifyError(status, errorInfo(body));

      return (body?.data ?? []).flatMap(raw => typeof raw.id === 'string' ? [{ id: raw.id, ...mapModel?.(raw) }] : []);
    },
  };
}

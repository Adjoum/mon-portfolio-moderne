// blog-api/src/ai/providers/anthropic.ts
// Adaptateur Anthropic (Messages API). max_tokens est obligatoire et couvre aussi la réflexion.
// temperature, top_p et top_k ne sont pas proposés : les modèles récents les refusent (HTTP 400).
// Le catalogue indique les limites et l'entrée image, pas les tarifs.

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

const API_VERSION = '2023-06-01';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set(['stop', 'reasoning_effort']);

interface MessageResponse {
  content?: { type?: string; text?: unknown }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

interface ModelPage {
  data?: Record<string, unknown>[];
  has_more?: boolean;
  last_id?: string;
  error?: { type?: string; message?: string };
}

const headersFor = (apiKey: string) => ({ 'x-api-key': apiKey, 'anthropic-version': API_VERSION });

function toError(status: number, error: { type?: string; message?: string } | undefined): ProviderError {
  if (status === 529 || error?.type === 'overloaded_error') return new ProviderError('unavailable', status, 'overloaded_error');
  if (/credit balance/i.test(error?.message ?? '')) return new ProviderError('quota_exceeded', status, 'credit_balance');
  if (error?.type === 'permission_error') return new ProviderError('permission_denied', status, 'permission_error');
  return classifyError(status, { code: error?.type === 'not_found_error' ? 'model_not_found' : undefined, type: error?.type, message: error?.message });
}

function toBlock(part: ContentPart) {
  if (part.type === 'text') return { type: 'text', text: part.text };
  const { mime, data } = parseDataUrl(part.dataUrl);
  return { type: 'image', source: { type: 'base64', media_type: mime, data } };
}

function toModel(raw: Record<string, unknown>): ModelInfo[] {
  if (typeof raw.id !== 'string') return [];
  const capabilities = raw.capabilities as { image_input?: { supported?: unknown } } | undefined;
  const vision = capabilities?.image_input?.supported;
  return [{
    id: raw.id,
    displayName:         asString(raw.display_name),
    contextWindow:       asNumber(raw.max_input_tokens),
    maxCompletionTokens: asNumber(raw.max_tokens),
    vision:              typeof vision === 'boolean' ? vision : undefined,
  }];
}

export function createAnthropicAdapter(baseUrl: string): ProviderAdapter {
  return {
    id: 'anthropic',
    supportedParams: SUPPORTED_PARAMS,
    supportsImages: true,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const { stop, reasoning_effort } = allowedParams(req, SUPPORTED_PARAMS);
      const { status, ok, body } = await requestJson<MessageResponse>(`${baseUrl}/v1/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...headersFor(ctx.apiKey) },
        body: JSON.stringify({
          model: ctx.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          ...(stop ? { stop_sequences: [stop] } : {}),
          ...(reasoning_effort ? { output_config: { effort: reasoning_effort } } : {}),
          messages: req.messages.map(m => ({ role: m.role, content: m.content.map(toBlock) })),
        }),
      }, ctx.signal);
      if (!ok) throw toError(status, body?.error);
      if (body?.stop_reason === 'refusal') throw new ProviderError('content_filtered', status);

      // Les blocs de réflexion sont ignorés : seul le texte final est transmis
      const text = (body?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('');
      return {
        content: requireText(text, status, body?.stop_reason),
        finishReason: body?.stop_reason,
        usage: { inputTokens: body?.usage?.input_tokens, outputTokens: body?.usage?.output_tokens },
      };
    },

    async listModels(ctx): Promise<ModelInfo[]> {
      const models: ModelInfo[] = [];
      let after: string | undefined;
      for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
        const query = new URLSearchParams({ limit: '1000', ...(after ? { after_id: after } : {}) });
        const { status, ok, body } = await requestJson<ModelPage>(`${baseUrl}/v1/models?${query}`, {
          headers: headersFor(ctx.apiKey),
        }, ctx.signal);
        if (!ok) throw toError(status, body?.error);
        models.push(...(body?.data ?? []).flatMap(toModel));
        if (!body?.has_more || !body.last_id) break;
        after = body.last_id;
      }
      return models;
    },
  };
}

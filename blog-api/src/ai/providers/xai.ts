// blog-api/src/ai/providers/xai.ts
// Adaptateur xAI (Grok), sur l'API Responses : Chat Completions y est dépréciée.
// Aucun stockage côté fournisseur (store: false). Le catalogue /v1/language-models
// indique les modalités et les tarifs. Les modèles à raisonnement refusent stop et les pénalités.

import { allowedParams, asNumber, httpError, requestJson, requireText } from './http';
import type { CallContext, GenerationParam, ModelInfo, NormalizedRequest, NormalizedResponse, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set(['temperature', 'top_p', 'reasoning_effort']);

/** Prix publié en cents USD pour 100 millions de tokens → micro-USD par million */
const CENTS_PER_100M_TO_MICRO_PER_MTOK = 100;

interface ResponsesBody {
  output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
  status?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { code?: string; type?: string } | string;
  code?: string;
}

interface LanguageModelsBody {
  models?: Record<string, unknown>[];
  error?: { code?: string } | string;
}

const errorCode = (body: { error?: { code?: string; type?: string } | string; code?: string } | null) =>
  (typeof body?.error === 'object' ? body.error?.code ?? body.error?.type : undefined) ?? body?.code ?? '';

function toInput(req: NormalizedRequest) {
  return [
    { role: 'system', content: req.system },
    ...req.messages.map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? m.content.map(part => (part.type === 'text' ? part.text : '')).join('')
        : m.content.map(part => part.type === 'text'
          ? { type: 'input_text', text: part.text }
          : { type: 'input_image', image_url: part.dataUrl, detail: part.detail }),
    })),
  ];
}

const textOf = (body: ResponsesBody | null) => (body?.output ?? [])
  .filter(item => item.type === 'message')
  .flatMap(item => item.content ?? [])
  .filter(part => part.type === 'output_text' && typeof part.text === 'string')
  .map(part => part.text)
  .join('');

function toModel(raw: Record<string, unknown>): ModelInfo[] {
  if (typeof raw.id !== 'string') return [];
  const input  = asNumber(raw.prompt_text_token_price);
  const output = asNumber(raw.completion_text_token_price);
  const modalities = raw.input_modalities;
  return [{
    id: raw.id,
    vision: Array.isArray(modalities) ? modalities.includes('image') : undefined,
    pricing: input !== undefined && output !== undefined
      ? { inputPerMTok: input * CENTS_PER_100M_TO_MICRO_PER_MTOK, outputPerMTok: output * CENTS_PER_100M_TO_MICRO_PER_MTOK }
      : undefined,
  }];
}

export function createXaiAdapter(baseUrl: string): ProviderAdapter {
  return {
    id: 'xai',
    supportedParams: SUPPORTED_PARAMS,
    supportsImages: true,

    async generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> {
      const { reasoning_effort, ...params } = allowedParams(req, SUPPORTED_PARAMS);
      const { status, ok, body } = await requestJson<ResponsesBody>(`${baseUrl}/v1/responses`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.apiKey}` },
        body: JSON.stringify({
          model: ctx.model,
          store: false,
          max_output_tokens: req.maxOutputTokens,
          ...params,
          ...(reasoning_effort ? { reasoning: { effort: reasoning_effort } } : {}),
          input: toInput(req),
        }),
      }, ctx.signal);
      if (!ok) throw httpError(status, errorCode(body));

      return {
        content: requireText(textOf(body), status, body?.status),
        finishReason: body?.status,
        usage: { inputTokens: body?.usage?.input_tokens, outputTokens: body?.usage?.output_tokens },
      };
    },

    async listModels(ctx): Promise<ModelInfo[]> {
      const { status, ok, body } = await requestJson<LanguageModelsBody>(`${baseUrl}/v1/language-models`, {
        headers: { Authorization: `Bearer ${ctx.apiKey}` },
      }, ctx.signal);
      if (!ok) throw httpError(status, errorCode(body));
      return (body?.models ?? []).flatMap(toModel);
    },
  };
}

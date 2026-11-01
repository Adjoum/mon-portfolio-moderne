// blog-api/src/ai/providers/xai.ts
// Adaptateur xAI (Grok), sur l'API Responses : Chat Completions y est dépréciée.
// Aucun stockage côté fournisseur (store: false). Le catalogue /v1/language-models
// indique les modalités et les tarifs. Les modèles à raisonnement refusent stop et les pénalités.

import { asNumber, classifyError, errorInfo, requestJson } from './http';
import { callResponses } from './responses';
import type { CallContext, GenerationParam, ModelInfo, NormalizedRequest, NormalizedResponse, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set(['temperature', 'top_p', 'reasoning_effort']);

/** Prix publié en cents USD pour 100 millions de tokens → micro-USD par million */
const CENTS_PER_100M_TO_MICRO_PER_MTOK = 100;

interface LanguageModelsBody {
  models?: Record<string, unknown>[];
}

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

    // Mode JSON non transmis : la sortie est validée côté serveur
    generate: (req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse> =>
      callResponses(baseUrl, req, ctx, { supportedParams: SUPPORTED_PARAMS, jsonMode: false, imageDetail: true }),

    async listModels(ctx): Promise<ModelInfo[]> {
      const { status, ok, body } = await requestJson<LanguageModelsBody>(`${baseUrl}/v1/language-models`, {
        headers: { Authorization: `Bearer ${ctx.apiKey}` },
      }, ctx.signal);
      if (!ok) throw classifyError(status, errorInfo(body));
      return (body?.models ?? []).flatMap(toModel);
    },
  };
}

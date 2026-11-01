// blog-api/src/ai/providers/openrouter.ts
// Adaptateur OpenRouter (agrégateur au format Chat Completions).
// Routage verrouillé : aucun repli vers un autre fournisseur amont (coût imprévu), uniquement
// des fournisseurs qui acceptent tous les paramètres et ne collectent pas les données.

import { createChatCompletionsAdapter } from './openaiCompatible';
import { asNumber, asString } from './http';
import type { GenerationParam, ModelInfo, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set([
  'temperature', 'top_p', 'top_k', 'stop', 'presence_penalty', 'frequency_penalty', 'seed', 'reasoning_effort',
]);

const USD_TO_MICRO_PER_MTOK = 1e12; // prix publié en USD par token

function pricing(raw: unknown): ModelInfo['pricing'] {
  const prices = raw as { prompt?: unknown; completion?: unknown } | undefined;
  const input  = Number(prices?.prompt);
  const output = Number(prices?.completion);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return undefined;
  return { inputPerMTok: Math.round(input * USD_TO_MICRO_PER_MTOK), outputPerMTok: Math.round(output * USD_TO_MICRO_PER_MTOK) };
}

export function createOpenRouterAdapter(baseUrl: string): ProviderAdapter {
  return createChatCompletionsAdapter(baseUrl, {
    id: 'openrouter',
    supportsImages: true,
    supportedParams: SUPPORTED_PARAMS,
    fixedBody: { provider: { allow_fallbacks: false, require_parameters: true, data_collection: 'deny' } },
    mapParams: ({ reasoning_effort, ...params }) => ({
      ...params,
      ...(reasoning_effort ? { reasoning: { effort: reasoning_effort } } : {}),
    }),
    mapModel: raw => {
      const modalities = (raw.architecture as { input_modalities?: unknown } | undefined)?.input_modalities;
      return {
        displayName:         asString(raw.name),
        contextWindow:       asNumber(raw.context_length),
        maxCompletionTokens: asNumber((raw.top_provider as { max_completion_tokens?: unknown } | undefined)?.max_completion_tokens),
        vision:              Array.isArray(modalities) ? modalities.includes('image') : undefined,
        pricing:             pricing(raw.pricing),
      };
    },
  });
}

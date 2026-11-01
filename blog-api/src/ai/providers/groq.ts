// blog-api/src/ai/providers/groq.ts
// Adaptateur Groq (format compatible Chat Completions, sous-ensemble de paramètres).
// Entrée image documentée (console.groq.com/docs/vision, relue le 01/11/2026) pour certains
// modèles seulement, en data URL `image_url`, sans champ `detail` : la sonde vision tranche.

import { createChatCompletionsAdapter } from './openaiCompatible';
import { asNumber } from './http';
import type { GenerationParam, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set([
  'temperature', 'top_p', 'stop', 'seed', 'reasoning_effort',
]);

export function createGroqAdapter(baseUrl: string): ProviderAdapter {
  return createChatCompletionsAdapter(baseUrl, {
    id: 'groq',
    supportsImages: true,
    supportedParams: SUPPORTED_PARAMS,
    mapModel: raw => ({
      contextWindow:       asNumber(raw.context_window),
      maxCompletionTokens: asNumber(raw.max_completion_tokens),
      active:              typeof raw.active === 'boolean' ? raw.active : undefined,
    }),
  });
}

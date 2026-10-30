// blog-api/src/ai/providers/groq.ts
// Adaptateur Groq (format compatible Chat Completions, sous-ensemble de paramètres).
// Pas d'entrée image dans cette version : aucune fonctionnalité vision ne peut lui être affectée.

import { createChatCompletionsAdapter } from './openaiCompatible';
import type { GenerationParam, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set([
  'temperature', 'top_p', 'stop', 'seed', 'reasoning_effort',
]);

export function createGroqAdapter(baseUrl: string): ProviderAdapter {
  return createChatCompletionsAdapter(baseUrl, { id: 'groq', supportsImages: false, supportedParams: SUPPORTED_PARAMS });
}

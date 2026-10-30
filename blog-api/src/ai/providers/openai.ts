// blog-api/src/ai/providers/openai.ts
// Adaptateur OpenAI. Vision déclarée : le modèle affecté doit aussi la supporter
// (vérifiée par fonctionnalité avant validation de l'affectation).

import { createChatCompletionsAdapter } from './openaiCompatible';
import { asString } from './http';
import type { GenerationParam, ProviderAdapter } from './types';

const SUPPORTED_PARAMS: ReadonlySet<GenerationParam> = new Set([
  'temperature', 'top_p', 'stop', 'presence_penalty', 'frequency_penalty', 'seed', 'reasoning_effort',
]);

export function createOpenAIAdapter(baseUrl: string): ProviderAdapter {
  return createChatCompletionsAdapter(baseUrl, {
    id: 'openai',
    supportsImages: true,
    supportedParams: SUPPORTED_PARAMS,
    // Le catalogue d'OpenAI n'indique que le retrait : capacités, limites et tarifs restent inconnus
    mapModel: raw => ({ shutdownDate: asString(raw.shutdown_date) }),
  });
}

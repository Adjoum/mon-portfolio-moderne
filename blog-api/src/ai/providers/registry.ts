// blog-api/src/ai/providers/registry.ts
// Les six fournisseurs retenus. URL de base fixées dans le code (anti-SSRF / exfiltration de clé).
// Seul OpenAI dispose d'un adaptateur dans cette tranche (P0.A2) ; les autres sont
// déclarés pour que l'architecture et le futur dashboard les connaissent déjà, et
// restent « non configurés » tant que leur adaptateur n'existe pas (P1.A).

import { createOpenAIAdapter } from './openai';
import type { ProviderDescriptor, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  openai:     { id: 'openai',     displayName: 'OpenAI',        baseUrl: 'https://api.openai.com',                     apiKeyEnv: 'OPENAI_API_KEY',     createAdapter: createOpenAIAdapter },
  groq:       { id: 'groq',       displayName: 'Groq',          baseUrl: 'https://api.groq.com/openai',                apiKeyEnv: 'GROQ_API_KEY' },
  xai:        { id: 'xai',        displayName: 'xAI (Grok)',    baseUrl: 'https://api.x.ai',                           apiKeyEnv: 'XAI_API_KEY' },
  gemini:     { id: 'gemini',     displayName: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com',  apiKeyEnv: 'GEMINI_API_KEY' },
  openrouter: { id: 'openrouter', displayName: 'OpenRouter',    baseUrl: 'https://openrouter.ai/api',                  apiKeyEnv: 'OPENROUTER_API_KEY' },
  anthropic:  { id: 'anthropic',  displayName: 'Anthropic',     baseUrl: 'https://api.anthropic.com',                  apiKeyEnv: 'ANTHROPIC_API_KEY' },
};

export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

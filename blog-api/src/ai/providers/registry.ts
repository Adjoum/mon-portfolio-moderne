// blog-api/src/ai/providers/registry.ts
// Les six fournisseurs retenus. URL de base fixées dans le code (anti-SSRF / exfiltration de clé).
// Un fournisseur sans clé valide reste inutilisable, sans aucun appel réseau.

import { createOpenAIAdapter } from './openai';
import { createGroqAdapter } from './groq';
import { createXaiAdapter } from './xai';
import { createGeminiAdapter } from './gemini';
import { createOpenRouterAdapter } from './openrouter';
import { createAnthropicAdapter } from './anthropic';
import type { ProviderDescriptor, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  openai:     { id: 'openai',     displayName: 'OpenAI',        baseUrl: 'https://api.openai.com',                     apiKeyEnv: 'OPENAI_API_KEY',     createAdapter: createOpenAIAdapter },
  groq:       { id: 'groq',       displayName: 'Groq',          baseUrl: 'https://api.groq.com/openai',                apiKeyEnv: 'GROQ_API_KEY',       createAdapter: createGroqAdapter },
  xai:        { id: 'xai',        displayName: 'xAI (Grok)',    baseUrl: 'https://api.x.ai',                           apiKeyEnv: 'XAI_API_KEY',        createAdapter: createXaiAdapter },
  gemini:     { id: 'gemini',     displayName: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com',  apiKeyEnv: 'GEMINI_API_KEY',     createAdapter: createGeminiAdapter },
  openrouter: { id: 'openrouter', displayName: 'OpenRouter',    baseUrl: 'https://openrouter.ai/api',                  apiKeyEnv: 'OPENROUTER_API_KEY', createAdapter: createOpenRouterAdapter },
  anthropic:  { id: 'anthropic',  displayName: 'Anthropic',     baseUrl: 'https://api.anthropic.com',                  apiKeyEnv: 'ANTHROPIC_API_KEY',  createAdapter: createAnthropicAdapter },
};

export function isProviderId(value: string): value is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

// blog-api/src/ai/services/cost.ts
// Estimation des coûts, en micro-USD : une ESTIMATION fondée sur les tarifs enregistrés,
// jamais une facture. Elle ne remplace pas les plafonds des consoles des fournisseurs.

import type { FeatureDefinition } from '../features/registry';
import type { FeaturePricing } from './store';

const CHARS_PER_TOKEN = 3;              // volontairement prudent : le coût est surestimé
const PROMPT_ALLOWANCE_CHARS = 8000;    // consigne système et contexte de recherche
const IMAGE_ALLOWANCE_CHARS = 20_000;   // une image n'est pas facturée selon sa taille en base64

/** Montant réservé avant l'appel : entrée estimée + sortie maximale */
export function estimateMaxCost(feature: Pick<FeatureDefinition, 'bodyLimit'>, input: unknown, maxOutputTokens: number, pricing: FeaturePricing): number {
  const inputChars = JSON.stringify(input ?? '').length;
  const chars = (feature.bodyLimit === 'large' ? Math.min(inputChars, IMAGE_ALLOWANCE_CHARS) : inputChars) + PROMPT_ALLOWANCE_CHARS;
  return usageCost(Math.ceil(chars / CHARS_PER_TOKEN), maxOutputTokens, pricing);
}

export function usageCost(inputTokens: number, outputTokens: number, pricing: FeaturePricing): number {
  return Math.ceil((inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000);
}

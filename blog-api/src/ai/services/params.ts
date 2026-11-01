// blog-api/src/ai/services/params.ts
// Paramètres de génération saisis dans le dashboard : uniquement ceux que l'adaptateur
// sait transmettre, dans leurs bornes. Rien n'est ignoré en silence.

import { modelProfile, rejectedByProfile } from '../providers/capabilities';
import type { GenerationParam, ProviderAdapter } from '../providers/types';

type Rule = (value: unknown) => boolean;

const between = (min: number, max: number): Rule => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (min: number, max: number): Rule => value => Number.isInteger(value) && between(min, max)(value);

const RULES: Record<GenerationParam, Rule> = {
  temperature:       between(0, 2),
  top_p:             between(0, 1),
  top_k:             integer(1, 500),
  stop:              value => typeof value === 'string' && value.length >= 1 && value.length <= 64,
  presence_penalty:  between(-2, 2),
  frequency_penalty: between(-2, 2),
  seed:              integer(0, 2_147_483_647),
  reasoning_effort:  value => typeof value === 'string' && ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value),
};

export const MAX_OUTPUT_TOKENS = 200_000;
export const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 120_000;   // inférieur au délai de nginx et du navigateur

/** Renvoie le nom du premier paramètre refusé, ou null */
export function invalidParam(adapter: ProviderAdapter, params: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(params)) {
    if (!adapter.supportedParams.has(key as GenerationParam)) return key;
    if (!RULES[key as GenerationParam](value)) return key;
  }
  return null;
}

export type ParamRefusal = { param: string; reason: 'provider' | 'range' | 'model' | 'reasoning' | 'effort' };

/**
 * Premier paramètre refusé pour CE modèle : fournisseur, bornes, puis matrice de capacités
 * (paramètre refusé par le modèle, échantillonnage réservé à l'effort « none », effort inconnu).
 */
export function paramRefusal(adapter: ProviderAdapter, model: string | null, params: Record<string, unknown>): ParamRefusal | null {
  for (const [key, value] of Object.entries(params)) {
    if (!adapter.supportedParams.has(key as GenerationParam)) return { param: key, reason: 'provider' };
    if (!RULES[key as GenerationParam](value)) return { param: key, reason: 'range' };
  }
  return model ? rejectedByProfile(modelProfile(adapter.id, model), params) : null;
}

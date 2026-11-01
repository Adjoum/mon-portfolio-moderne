// blog-api/src/ai/providers/adaptive.ts
// Construction adaptative des requêtes (P1) : la forme de la requête suit d'abord la matrice
// de capacités (capabilities.ts), puis s'ajuste aux refus explicites du fournisseur.
//
//   - paramètre refusé par la matrice      → retiré avant l'envoi
//   - « Unsupported parameter: X »         → X retiré, nouvel essai
//   - max_tokens / max_completion_tokens    → l'autre champ, nouvel essai
//   - modèle réservé à l'API Responses      → API Responses, nouvel essai
//   - champ `detail` ou mode JSON refusés   → retirés (la sortie reste validée côté serveur)
//
// Au plus MAX_ADJUSTMENTS corrections par appel. Jamais un autre modèle, jamais un autre
// contenu. Un refus HTTP 400 n'est pas facturé : les nouveaux essais ne coûtent rien de plus.
// Chaque correction est rapportée (adjustments) : la sonde les montre à l'administrateur.

import { modelProfile, rejectedByProfile } from './capabilities';
import {
  ProviderError,
  type CallContext,
  type GenerationParam,
  type NormalizedRequest,
  type NormalizedResponse,
  type ProviderAdapter,
} from './types';

export const MAX_ADJUSTMENTS = 3;

type ParamTarget = GenerationParam | 'output_limit' | 'image_detail' | 'json_mode';

/** Noms des champs propres à chaque API → paramètre normalisé */
const ALIASES: Record<string, ParamTarget> = {
  temperature: 'temperature', top_p: 'top_p', topP: 'top_p', top_k: 'top_k', topK: 'top_k',
  stop: 'stop', stop_sequences: 'stop', stopSequences: 'stop',
  presence_penalty: 'presence_penalty', frequency_penalty: 'frequency_penalty', seed: 'seed',
  reasoning_effort: 'reasoning_effort', reasoning: 'reasoning_effort', 'reasoning.effort': 'reasoning_effort',
  output_config: 'reasoning_effort', 'output_config.effort': 'reasoning_effort',
  max_tokens: 'output_limit', max_completion_tokens: 'output_limit',
  response_format: 'json_mode', 'text.format': 'json_mode', responseMimeType: 'json_mode',
};

export function paramTarget(raw: string | undefined): ParamTarget | undefined {
  if (!raw) return undefined;
  const name = raw.replace(/^(generationConfig|generation_config)\./, '');
  if (ALIASES[name]) return ALIASES[name];
  if (/(^|\.)detail$/.test(name) || /image_url\.detail/.test(name)) return 'image_detail';
  return undefined;
}

const without = <T extends object>(obj: T, key: string): T => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;

/** Correction applicable à ce refus, ou null */
function correction(adapter: ProviderAdapter, req: NormalizedRequest, err: ProviderError): { label: string; request: NormalizedRequest } | null {
  const adapt = req.adapt ?? {};
  if (err.code === 'endpoint_incompatible' && adapter.supportsResponsesEndpoint && adapt.endpoint !== 'responses') {
    return { label: 'endpoint:responses', request: { ...req, adapt: { ...adapt, endpoint: 'responses' } } };
  }
  if (err.code !== 'unsupported_parameter' && err.code !== 'bad_request') return null;

  const target = paramTarget(err.param);
  if (target === 'output_limit' && adapt.endpoint !== 'responses' && (err.param === 'max_tokens' || err.param === 'max_completion_tokens')) {
    const field = err.param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    if (adapt.outputLimitField === field) return null;
    return { label: `output_limit_field:${field}`, request: { ...req, adapt: { ...adapt, outputLimitField: field } } };
  }
  if (target === 'image_detail' && !adapt.omitImageDetail && hasImage(req)) {
    return { label: 'image_detail_removed', request: { ...req, adapt: { ...adapt, omitImageDetail: true } } };
  }
  if (target === 'json_mode' && req.output === 'json' && !adapt.omitJsonMode) {
    return { label: 'json_mode_removed', request: { ...req, adapt: { ...adapt, omitJsonMode: true } } };
  }
  if (target && target !== 'output_limit' && target !== 'image_detail' && target !== 'json_mode' && req.params[target] !== undefined) {
    return { label: `param_removed:${target}`, request: { ...req, params: without(req.params, target) } };
  }
  return null;
}

const hasImage = (req: NormalizedRequest) => req.messages.some(m => m.content.some(part => part.type === 'image'));

/** Retire les paramètres que la matrice déclare refusés par ce modèle */
export function prefilter(adapter: ProviderAdapter, req: NormalizedRequest, model: string): { request: NormalizedRequest; adjustments: string[] } {
  const profile = modelProfile(adapter.id, model);
  const adjustments: string[] = [];
  let params = { ...req.params };
  for (let refused = rejectedByProfile(profile, params); refused; refused = rejectedByProfile(profile, params)) {
    params = without(params, refused.param);
    adjustments.push(`param_removed:${refused.param}`);
  }
  const adapt = { ...(profile.endpoint === 'responses' && adapter.supportsResponsesEndpoint ? { endpoint: 'responses' as const } : {}), ...req.adapt };
  return { request: { ...req, params, adapt }, adjustments };
}

export async function generateAdaptive(adapter: ProviderAdapter, req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse & { adjustments: string[] }> {
  const start = prefilter(adapter, req, ctx.model);
  const adjustments = [...start.adjustments];
  let request = start.request;
  for (;;) {
    try {
      const result = await adapter.generate(request, ctx);
      return { ...result, adjustments };
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      const fix = adjustments.length < MAX_ADJUSTMENTS + start.adjustments.length ? correction(adapter, request, err) : null;
      if (!fix || ctx.signal.aborted) {
        err.adjustments = adjustments;
        throw err;
      }
      adjustments.push(fix.label);
      request = fix.request;
    }
  }
}

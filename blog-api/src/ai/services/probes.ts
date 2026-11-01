// blog-api/src/ai/services/probes.ts
// Sondes de compatibilité : petites générations RÉELLES, donc potentiellement facturées.
// Déclenchées uniquement par l'administrateur, avec confirmation du coût maximal. Elles prouvent
// les capacités dont une fonctionnalité a besoin : ni le catalogue, ni la matrice (documentation),
// ni la famille du modèle ne le prouvent. Aucune donnée de visiteur : textes fixes et image
// synthétique (probeImage.ts).
//
// Trois issues, enregistrées comme telles :
//   compatible     toutes les capacités requises ont été démontrées
//   incompatible   le modèle lui-même ne convient pas (vision refusée ou image mal lue, JSON invalide…)
//   config_error   la requête ou la configuration est en cause (paramètre refusé, image ou requête
//                  rejetée, modèle absent ou inaccessible, point d'accès, limite de sortie) : rien
//                  n'est conclu sur le modèle
// Clé refusée, délai, réseau, quota ou limite de débit du fournisseur : sans conclusion, rien
// n'est enregistré (ProbeInconclusive).

import type { Capability, FeatureDefinition } from '../features/registry';
import { generateAdaptive } from '../providers/adaptive';
import { CAPABILITY_MATRIX_VERSION, modelProfile } from '../providers/capabilities';
import { ProviderError, type NormalizedErrorCode, type NormalizedRequest, type ProviderAdapter } from '../providers/types';
import { answerMatchesCode, randomProbeCode, renderProbeImage, sanitizeAnswer } from './probeImage';

const PROBE_TIMEOUT_MS = 45_000;
/** Limite de sortie de chaque sonde : un modèle à raisonnement réfléchit avant de répondre */
// Bornes choisies pour que le coût maximal tienne dans les sous-budgets initiaux (0,50 $ par jour),
// même au tarif d'un modèle haut de gamme (50 $ par million de tokens de sortie)
export const PROBE_OUTPUT_TOKENS = { plain: 256, reasoning: 1024 } as const;
/** Une seule relance, avec une limite plus haute, si la réflexion a tout consommé */
const PROBE_RETRY_FACTOR = 2;
const PROBE_MAX_RETRY_TOKENS = 4096;
/** Estimation prudente des tokens d'entrée d'une sonde (texte fixe, image comprise) */
export const PROBE_INPUT_TOKENS = { text: 60, json: 70, vision: 2200 } as const;

/** Le fournisseur n'a pas pu répondre : cela ne dit rien du modèle */
const INCONCLUSIVE = new Set<NormalizedErrorCode>(['auth', 'timeout', 'unavailable', 'rate_limited', 'quota_exceeded', 'aborted']);

/** Refus imputables à la requête ou à la configuration, pas au modèle */
const CONFIG_ERRORS = new Set<NormalizedErrorCode>([
  'unsupported_parameter', 'invalid_image', 'bad_request', 'model_not_found', 'permission_denied',
  'endpoint_incompatible', 'output_truncated', 'payload_too_large', 'context_too_long', 'model_deprecated',
]);

export type ProbeStatus = 'compatible' | 'incompatible' | 'config_error';

export interface ProbeResult {
  status: ProbeStatus;
  capabilities: Capability[];
  /** Capacité dont la sonde a échoué */
  failedCapability: Capability | null;
  code: string | null;
  /** Paramètre refusé par le fournisseur (nom seulement) */
  param: string | null;
  /** Paramètres de l'affectation que le modèle refuse : à retirer avant activation */
  rejectedParams: string[];
  /** Corrections de forme appliquées (champ de limite, point d'accès, détail d'image…) */
  adjustments: string[];
  /** Sonde vision : code attendu et réponse reçue (image synthétique, aucune donnée personnelle) */
  vision: { expected: string; received: string } | null;
  matrixVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export class ProbeInconclusive extends Error {
  constructor(public code: NormalizedErrorCode) {
    super(code);
  }
}

function jsonIsValid(content: string): boolean {
  try {
    const parsed = JSON.parse(content.replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, ''));
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/** Réponse qui dit ne pas voir d'image */
const NO_IMAGE = /(can(no|')t|cannot|unable to|not able to) (see|view|read|process|access)|no image|ne (peux|vois|parviens)|pas d[’']image|aucune image|text-only|textual/i;

/** Sondes envoyées pour une fonctionnalité donnée, dans l'ordre */
export function probePlan(required: readonly Capability[]): Capability[] {
  return (['text', 'json', 'vision'] as const).filter(c => c === 'text' || required.includes(c));
}

/** Limite de sortie d'une sonde selon la matrice (inconnu : prudence du raisonnement) */
export function probeOutputTokens(adapter: ProviderAdapter, model: string): number {
  return modelProfile(adapter.id, model).reasoning === false ? PROBE_OUTPUT_TOKENS.plain : PROBE_OUTPUT_TOKENS.reasoning;
}

/** Coût maximal des sondes (relance comprise), en micro-USD ; null si le tarif est inconnu */
export function probeMaxCost(adapter: ProviderAdapter, model: string, required: readonly Capability[], pricing: { inputPerMTok: number; outputPerMTok: number } | null) {
  const output = probeOutputTokens(adapter, model);
  const retry = Math.min(output * PROBE_RETRY_FACTOR, PROBE_MAX_RETRY_TOKENS);
  const steps = probePlan(required);
  const inputTokens = steps.reduce((n, c) => n + PROBE_INPUT_TOKENS[c] * 2, 0);
  const outputTokens = steps.length * (output + retry);
  return {
    requests: steps.length,
    maxRequests: steps.length * 2,
    inputTokens,
    outputTokens,
    maxCostMicroUsd: pricing ? Math.ceil((inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000) : null,
  };
}

const USER_PARAM_ADJUSTMENT = /^param_removed:(.+)$/;

export async function runProbes(
  adapter: ProviderAdapter,
  feature: Pick<FeatureDefinition, 'requiredCapabilities'>,
  model: string,
  apiKey: string,
  params: Record<string, number | string>,
): Promise<ProbeResult> {
  const started = Date.now();
  const validated: Capability[] = [];
  const adjustments = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let vision: ProbeResult['vision'] = null;

  const outcome = (status: ProbeStatus, extra: Partial<ProbeResult> = {}): ProbeResult => {
    const all = [...adjustments];
    return {
      status, capabilities: [...validated], failedCapability: null, code: null, param: null,
      rejectedParams: all.flatMap(a => USER_PARAM_ADJUSTMENT.exec(a)?.[1] ?? []),
      adjustments: all.filter(a => !USER_PARAM_ADJUSTMENT.test(a)),
      vision, matrixVersion: CAPABILITY_MATRIX_VERSION,
      latencyMs: Date.now() - started, inputTokens, outputTokens, ...extra,
    };
  };

  const call = async (request: NormalizedRequest) => {
    const once = async (maxOutputTokens: number) => {
      try {
        const result = await generateAdaptive(adapter, { ...request, maxOutputTokens }, { apiKey, model, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        result.adjustments.forEach(a => adjustments.add(a));
        inputTokens  += result.usage?.inputTokens ?? 0;
        outputTokens += result.usage?.outputTokens ?? 0;
        return result.content;
      } catch (err) {
        if (err instanceof ProviderError) err.adjustments?.forEach(a => adjustments.add(a));
        throw err;
      }
    };
    const budget = probeOutputTokens(adapter, model);
    try {
      return await once(budget);
    } catch (err) {
      // Réflexion plus longue que prévu : une relance, facturée elle aussi, puis conclusion
      if (!(err instanceof ProviderError) || err.code !== 'output_truncated') throw err;
      adjustments.add(`probe_output_limit:${Math.min(budget * PROBE_RETRY_FACTOR, PROBE_MAX_RETRY_TOKENS)}`);
      return once(Math.min(budget * PROBE_RETRY_FACTOR, PROBE_MAX_RETRY_TOKENS));
    }
  };

  const required = feature.requiredCapabilities;
  // Adaptateur sans entrée image : incompatible sans aucun appel, quoi qu'en dise le modèle
  if (required.includes('vision') && !adapter.supportsImages) {
    return outcome('incompatible', { failedCapability: 'vision', code: 'vision_unsupported', latencyMs: 0 });
  }

  const base = { params, maxOutputTokens: 0 };
  let step: Capability = 'text';
  try {
    await call({
      ...base,
      system: 'Réponds uniquement par le mot OK.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Test de connexion.' }] }],
    }).then(content => {
      if (!content.trim()) throw new ProviderError('invalid_response', undefined, 'sonde text');
    });
    validated.push('text');

    if (required.includes('json')) {
      step = 'json';
      const content = await call({
        ...base,
        output: 'json',
        system: 'Réponds uniquement avec du JSON valide, sans markdown.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Renvoie exactement {"ok":true}.' }] }],
      });
      if (!jsonIsValid(content)) return outcome('incompatible', { failedCapability: 'json', code: 'json_invalid' });
      validated.push('json');
    }

    if (required.includes('vision')) {
      step = 'vision';
      const code = randomProbeCode();
      const content = await call({
        ...base,
        system: 'Tu lis des images de test. Réponds uniquement par le texte demandé, sans phrase.',
        messages: [{ role: 'user', content: [
          { type: 'image', dataUrl: renderProbeImage(code), detail: 'low' },
          { type: 'text', text: 'Quel code de trois caractères (lettres majuscules ou chiffres) est écrit en noir dans le cadre de cette image ? Réponds uniquement par ce code.' },
        ] }],
      });
      vision = { expected: code, received: sanitizeAnswer(content) };
      // Une réponse sans le bon code ne prouve pas la lecture de l'image
      if (!answerMatchesCode(content, code)) {
        return outcome('incompatible', { failedCapability: 'vision', code: NO_IMAGE.test(content) ? 'vision_unsupported' : 'vision_misread' });
      }
      validated.push('vision');
    }
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    if (INCONCLUSIVE.has(err.code)) throw new ProbeInconclusive(err.code);
    // Le texte vient de passer avec les mêmes paramètres : un refus visant le contenu du message
    // (et non un paramètre de génération) désigne l'image elle-même
    if (step === 'vision' && (err.code === 'bad_request' || err.code === 'unsupported_parameter') && /image|content/i.test(err.param ?? '')) {
      return outcome('incompatible', { failedCapability: 'vision', code: 'vision_unsupported', param: err.param ?? null });
    }
    const status: ProbeStatus = CONFIG_ERRORS.has(err.code) ? 'config_error' : 'incompatible';
    return outcome(status, { failedCapability: step, code: err.code, param: err.param ?? null });
  }

  // Le modèle a répondu, mais seulement sans certains paramètres de l'affectation : à corriger d'abord
  const result = outcome('compatible');
  if (result.rejectedParams.length) {
    return { ...result, status: 'config_error', code: 'unsupported_parameter', param: result.rejectedParams[0] };
  }
  return result;
}

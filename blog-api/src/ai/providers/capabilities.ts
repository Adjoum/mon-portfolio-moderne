// blog-api/src/ai/providers/capabilities.ts
// Matrice de capacités versionnée (P1). Elle décrit ce que la DOCUMENTATION OFFICIELLE dit d'un
// modèle ou d'une famille : forme de la requête (champ de limite de sortie, point d'accès,
// paramètres refusés, efforts de raisonnement) et indices de capacités.
//
// Ce n'est jamais une preuve : seule une sonde réelle (services/probes.ts) valide une capacité
// pour une fonctionnalité. En particulier, la vision n'est jamais déduite d'une famille de
// modèles : `visionDocumented` n'est renseigné que pour des identifiants dont la page officielle
// a été relue, et reste un simple indice affiché dans le dashboard.
//
// Un identifiant inconnu (saisie manuelle) reçoit le profil par défaut de son fournisseur : la
// requête part sous sa forme standard et les refus du fournisseur sont corrigés par adaptive.ts.

import type { GenerationParam, ProviderId } from './types';

/** À incrémenter à chaque modification des règles ; enregistré avec chaque sonde */
export const CAPABILITY_MATRIX_VERSION = '2026-11-01.1';

export const SAMPLING_PARAMS: readonly GenerationParam[] = ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty'];

export interface ModelProfile {
  /** Règle appliquée, null : profil par défaut du fournisseur */
  rule: string | null;
  /** Modèle à raisonnement : la limite de sortie couvre aussi la réflexion */
  reasoning: boolean | null;
  /** Entrée image annoncée par la page officielle du modèle (indice, jamais une preuve) */
  visionDocumented: boolean | null;
  outputLimitField?: 'max_completion_tokens' | 'max_tokens';
  /** Point d'accès à utiliser d'emblée */
  endpoint?: 'chat' | 'responses';
  /** Paramètres toujours refusés par ce modèle */
  rejectedParams: GenerationParam[];
  /** Paramètres d'échantillonnage acceptés uniquement avec reasoning_effort = none */
  samplingOnlyWithoutReasoning?: boolean;
  /** Efforts de raisonnement acceptés ; absent : inconnus (le fournisseur tranche) */
  reasoningEfforts?: readonly string[];
  /** Le champ `detail` des images est documenté par l'API */
  imageDetail: boolean;
  /** Page officielle relue */
  source?: string;
}

interface Rule {
  id: string;
  match: RegExp;
  profile: Partial<Omit<ModelProfile, 'rule'>>;
}

const OPENAI_DOC = 'https://developers.openai.com/api/docs/models/';
const SNAPSHOT = '(-\\d{4}-\\d{2}-\\d{2})?$';

/** Première règle correspondante, dans l'ordre */
const RULES: Record<ProviderId, Rule[]> = {
  openai: [
    // Modèles de conversation sans raisonnement (alias « chat-latest »)
    { id: 'openai:chat-latest', match: /^(gpt-[\d.]+(-[a-z]+)?-chat-latest|chatgpt-4o-latest)$/, profile: { reasoning: false } },
    // Modèles servis uniquement par l'API Responses (pro, codex), tous à raisonnement
    { id: 'openai:responses-only', match: /^(gpt-|o)\d.*(-pro|-codex)(-|$)/, profile: {
      endpoint: 'responses', reasoning: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'] } },
    // Pages officielles relues le 01/11/2026 : entrée image, Chat Completions et Responses
    { id: 'openai:gpt-5-nano', match: new RegExp(`^gpt-5-nano${SNAPSHOT}`), profile: {
      reasoning: true, visionDocumented: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'],
      reasoningEfforts: ['minimal', 'low', 'medium', 'high'], source: `${OPENAI_DOC}gpt-5-nano` } },
    { id: 'openai:gpt-5-mini', match: new RegExp(`^gpt-5-mini${SNAPSHOT}`), profile: {
      reasoning: true, visionDocumented: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'],
      reasoningEfforts: ['minimal', 'low', 'medium', 'high'], source: `${OPENAI_DOC}gpt-5-mini` } },
    { id: 'openai:gpt-5.6-luna', match: new RegExp(`^gpt-5\\.6-luna${SNAPSHOT}`), profile: {
      reasoning: true, visionDocumented: true, rejectedParams: ['stop'], samplingOnlyWithoutReasoning: true,
      reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], source: `${OPENAI_DOC}gpt-5.6-luna` } },
    { id: 'openai:gpt-6-astra', match: new RegExp(`^gpt-6-astra${SNAPSHOT}`), profile: {
      reasoning: true, visionDocumented: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'],
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'], source: `${OPENAI_DOC}gpt-6-astra` } },
    // Familles à raisonnement : forme de la requête seulement, AUCUNE capacité supposée
    { id: 'openai:gpt-5', match: new RegExp(`^gpt-5${SNAPSHOT}`), profile: {
      reasoning: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'], reasoningEfforts: ['minimal', 'low', 'medium', 'high'] } },
    { id: 'openai:gpt-5.x', match: /^gpt-5\.\d+/, profile: { reasoning: true, rejectedParams: ['stop'], samplingOnlyWithoutReasoning: true } },
    { id: 'openai:gpt-6', match: /^gpt-6/, profile: { reasoning: true, rejectedParams: ['stop'], samplingOnlyWithoutReasoning: true } },
    { id: 'openai:o-series', match: /^o\d/, profile: {
      reasoning: true, rejectedParams: [...SAMPLING_PARAMS, 'stop'], reasoningEfforts: ['low', 'medium', 'high'] } },
  ],
  groq: [
    // gpt-oss : texte seul, raisonnement réglable
    { id: 'groq:gpt-oss', match: /^openai\/gpt-oss-/, profile: { reasoning: true, visionDocumented: false, reasoningEfforts: ['low', 'medium', 'high'] } },
  ],
  xai: [
    // grok-4 refuse reasoning_effort (réservé à grok-3-mini)
    { id: 'xai:grok-4', match: /^grok-4/, profile: { reasoning: true, rejectedParams: ['reasoning_effort'] } },
  ],
  gemini: [
    { id: 'gemini:thinking', match: /^gemini-(2\.5|[3-9])/, profile: { reasoning: true } },
  ],
  openrouter: [],
  anthropic: [],
};

/** Forme standard de chaque API ; les catalogues (xAI, OpenRouter, Anthropic) donnent la vision par modèle */
const DEFAULTS: Record<ProviderId, Omit<ModelProfile, 'rule'>> = {
  openai:     { reasoning: null, visionDocumented: null, outputLimitField: 'max_completion_tokens', endpoint: 'chat', rejectedParams: [], imageDetail: true },
  groq:       { reasoning: null, visionDocumented: null, outputLimitField: 'max_completion_tokens', endpoint: 'chat', rejectedParams: [], imageDetail: false },
  openrouter: { reasoning: null, visionDocumented: null, outputLimitField: 'max_tokens', endpoint: 'chat', rejectedParams: [], imageDetail: true },
  xai:        { reasoning: null, visionDocumented: null, endpoint: 'responses', rejectedParams: [], imageDetail: true },
  gemini:     { reasoning: null, visionDocumented: null, rejectedParams: [], imageDetail: false },
  anthropic:  { reasoning: null, visionDocumented: null, rejectedParams: [], imageDetail: false },
};

export function modelProfile(provider: ProviderId, model: string): ModelProfile {
  const rule = RULES[provider].find(r => r.match.test(model));
  return { ...DEFAULTS[provider], ...rule?.profile, rule: rule?.id ?? null };
}

/**
 * Paramètres refusés par ce modèle selon la matrice, pour un jeu de paramètres donné.
 * Renvoie le premier refus et sa raison, ou null.
 */
export function rejectedByProfile(profile: ModelProfile, params: Record<string, unknown>): { param: string; reason: 'model' | 'reasoning' | 'effort' } | null {
  for (const key of Object.keys(params)) {
    if (profile.rejectedParams.includes(key as GenerationParam)) return { param: key, reason: 'model' };
  }
  const effort = params.reasoning_effort;
  if (typeof effort === 'string' && profile.reasoningEfforts && !profile.reasoningEfforts.includes(effort)) {
    return { param: 'reasoning_effort', reason: 'effort' };
  }
  if (profile.samplingOnlyWithoutReasoning && effort !== 'none') {
    const sampling = Object.keys(params).find(key => SAMPLING_PARAMS.includes(key as GenerationParam));
    if (sampling) return { param: sampling, reason: 'reasoning' };
  }
  return null;
}

/** Résumé exposé au dashboard (aucune donnée sensible) */
export function profileSummary(profile: ModelProfile) {
  return {
    matrixVersion: CAPABILITY_MATRIX_VERSION,
    rule: profile.rule,
    reasoning: profile.reasoning,
    visionDocumented: profile.visionDocumented,
    endpoint: profile.endpoint ?? null,
    rejectedParams: profile.rejectedParams,
    samplingOnlyWithoutReasoning: profile.samplingOnlyWithoutReasoning ?? false,
    reasoningEfforts: profile.reasoningEfforts ?? null,
    source: profile.source ?? null,
  };
}

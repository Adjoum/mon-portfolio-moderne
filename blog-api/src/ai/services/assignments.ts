// blog-api/src/ai/services/assignments.ts
// Résolution côté serveur du couple (fournisseur, modèle) de chaque fonctionnalité.
// Le navigateur ne choisit jamais ni l'un ni l'autre.
//
// Ordre : AI_ASSIGNMENT_<FEATURE>=fournisseur:modèle, sinon les données initiales
// (config/initial-assignments.json). P1.B : table ai_feature_assignments (même interface).
//
// Brouillon / publication (doc 09 §4) : une affectation ne s'exécute que si elle figure
// dans AI_VALIDATED_ASSIGNMENTS (fonctionnalité=fournisseur:modèle). Changer de modèle
// la remet donc à « non validée ». Tant qu'elle ne l'est pas, l'affectation précédente
// éventuelle reste en service (aucune coupure, aucun appel à un modèle non vérifié).

import seed from '../config/initial-assignments.json';
import { isProviderId } from '../providers/registry';
import type { GenerationParam, ProviderId } from '../providers/types';

export type AssignmentParams = Partial<Record<GenerationParam, number | string>>;

export interface Assignment {
  provider: ProviderId;
  model: string;
  params?: AssignmentParams;
  source: 'seed' | 'env' | 'previous';
  validated: boolean;
}

export interface AssignmentResolver {
  resolve(featureId: string): Assignment | null;
}

interface SeedEntry {
  provider: string;
  model: string;
  params?: AssignmentParams;
  previous?: { provider: string; model: string };
}

const SEED = seed as unknown as Record<string, SeedEntry>;

/** Identifiant de modèle en saisie libre : seul le format est contrôlé */
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export const SEEDED_FEATURE_IDS = Object.keys(SEED).filter(k => !k.startsWith('_'));

export function envVarFor(featureId: string): string {
  return `AI_ASSIGNMENT_${featureId.replace(/\./g, '_').toUpperCase()}`;
}

function validatedSet(): Set<string> {
  return new Set((process.env.AI_VALIDATED_ASSIGNMENTS ?? '').split(',').map(s => s.trim()).filter(Boolean));
}

/** Affectation demandée (avant prise en compte de la validation). null si invalide ou absente */
export function candidateFor(featureId: string): Omit<Assignment, 'validated'> | null {
  const entry = Object.prototype.hasOwnProperty.call(SEED, featureId) ? SEED[featureId] : undefined;
  const raw = process.env[envVarFor(featureId)]?.trim();

  if (raw) {
    const sep = raw.indexOf(':');
    const provider = raw.slice(0, sep);
    const model = raw.slice(sep + 1);
    if (sep > 0 && isProviderId(provider) && MODEL_ID_RE.test(model)) {
      return { provider, model, params: entry?.provider === provider ? entry.params : undefined, source: 'env' };
    }
    console.error(`[AI] ${envVarFor(featureId)} invalide : fonctionnalité désactivée`);
    return null;
  }

  if (!entry || !isProviderId(entry.provider)) return null;
  return { provider: entry.provider, model: entry.model, params: entry.params, source: 'seed' };
}

export function isValidated(featureId: string, a: { provider: string; model: string }): boolean {
  return validatedSet().has(`${featureId}=${a.provider}:${a.model}`);
}

export const envAssignmentResolver: AssignmentResolver = {
  resolve(featureId) {
    const candidate = candidateFor(featureId);
    if (!candidate) return null;
    if (isValidated(featureId, candidate)) return { ...candidate, validated: true };

    const previous = SEED[featureId]?.previous;
    if (previous && isProviderId(previous.provider)) {
      return { provider: previous.provider, model: previous.model, source: 'previous', validated: true };
    }
    return { ...candidate, validated: false };
  },
};

export type LegacyGroqFeature = 'agent.chat' | 'inkspace.generate' | 'novamind.diagram';

/** Routes Groq historiques (à brancher sur la passerelle en P1.D). null = indisponible */
export function groqAssignmentFor(featureId: LegacyGroqFeature): { model: string; params: AssignmentParams } | null {
  const a = envAssignmentResolver.resolve(featureId);
  return a?.provider === 'groq' && a.validated ? { model: a.model, params: a.params ?? {} } : null;
}

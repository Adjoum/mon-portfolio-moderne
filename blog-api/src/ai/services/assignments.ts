// blog-api/src/ai/services/assignments.ts
// Résolution côté serveur du couple (fournisseur, modèle) de chaque fonctionnalité.
// Le navigateur ne choisit jamais ni l'un ni l'autre.
//
// Ordre : AI_ASSIGNMENT_<FEATURE>=fournisseur:modèle, sinon les données initiales
// (config/initial-assignments.json). P1.B : table ai_feature_assignments (même interface).
//
// Brouillon / publication (doc 09 §4) : une affectation ne s'exécute que si elle figure
// dans AI_VALIDATED_ASSIGNMENTS (fonctionnalité=fournisseur:modèle). Changer de modèle
// la remet donc à « non validée » : aucun appel n'est possible tant qu'elle ne l'est pas.

import seed from '../config/initial-assignments.json';
import { isProviderId } from '../providers/registry';
import { isValidModelId } from '../providers/modelId';
import type { GenerationParam, ProviderId } from '../providers/types';

export type AssignmentParams = Partial<Record<GenerationParam, number | string>>;

export interface Assignment {
  provider: ProviderId;
  model: string;
  params?: AssignmentParams;
  source: 'seed' | 'env';
  validated: boolean;
}

export interface AssignmentResolver {
  resolve(featureId: string): Assignment | null;
}

interface SeedEntry {
  provider: string;
  model: string;
  params?: AssignmentParams;
}

const SEED = seed as unknown as Record<string, SeedEntry>;

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
    if (sep > 0 && isProviderId(provider) && isValidModelId(model)) {
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
    return candidate ? { ...candidate, validated: isValidated(featureId, candidate) } : null;
  },
};

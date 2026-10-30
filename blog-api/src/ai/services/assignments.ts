// blog-api/src/ai/services/assignments.ts
// Résolution côté serveur du couple (fournisseur, modèle) d'une fonctionnalité.
// Le navigateur ne choisit jamais ni l'un ni l'autre.
//
// P0.A2 : valeurs initiales = configuration historique du frontend (D-IA-06 A),
// surchargeables par variable d'environnement AI_ASSIGNMENT_<FEATURE>=fournisseur:modèle
// (ex. AI_ASSIGNMENT_CV_GENERATE=openai:gpt-4o-mini).
// P1.B : remplacé par la lecture de la table ai_feature_assignments (même interface).

import { isProviderId } from '../providers/registry';
import type { ProviderId } from '../providers/types';
import type { FeatureId } from '../features/registry';

export interface Assignment {
  provider: ProviderId;
  model: string;
  source: 'default' | 'env';
}

export interface AssignmentResolver {
  resolve(featureId: FeatureId): Assignment | null;
}

/** Données initiales (pas une liste de modèles proposée à l'interface) */
const INITIAL_ASSIGNMENTS: Record<FeatureId, { provider: ProviderId; model: string }> = {
  'cv.generate':         { provider: 'openai', model: 'gpt-4o' },
  'cv.review':           { provider: 'openai', model: 'gpt-4o-mini' },
  'cv.import.structure': { provider: 'openai', model: 'gpt-4o-mini' },
  'cv.import.ocr':       { provider: 'openai', model: 'gpt-4o' },
  'latex.generate':      { provider: 'openai', model: 'gpt-4o' },
  'latex.improve':       { provider: 'openai', model: 'gpt-4o' },
};

/** Identifiant de modèle en saisie libre : seul le format est contrôlé */
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export function envVarFor(featureId: FeatureId): string {
  return `AI_ASSIGNMENT_${featureId.replace(/\./g, '_').toUpperCase()}`;
}

export const envAssignmentResolver: AssignmentResolver = {
  resolve(featureId) {
    const raw = process.env[envVarFor(featureId)]?.trim();
    if (raw) {
      const sep = raw.indexOf(':');
      const provider = raw.slice(0, sep);
      const model = raw.slice(sep + 1);
      if (sep > 0 && isProviderId(provider) && MODEL_ID_RE.test(model)) return { provider, model, source: 'env' };
      console.error(`[AI] ${envVarFor(featureId)} invalide : fonctionnalité désactivée`);
      return null;
    }
    const initial = INITIAL_ASSIGNMENTS[featureId];
    return initial ? { ...initial, source: 'default' } : null;
  },
};

// blog-api/src/ai/services/modelCheck.ts
// Vérification des affectations par MÉTADONNÉES uniquement (GET /v1/models) :
// aucune génération, aucune facturation, aucune clé dans le résultat.
// Elle prouve que le modèle est visible par la clé, pas qu'il convient à la fonctionnalité :
// cette preuve demande une sonde de génération, soumise à l'accord du propriétaire.

import { PROVIDERS } from '../providers/registry';
import { ProviderError, type ModelInfo, type ProviderId } from '../providers/types';
import { candidateFor, envAssignmentResolver, SEEDED_FEATURE_IDS, isValidated } from './assignments';

export type ModelCheckStatus = 'found' | 'not_found' | 'inactive' | 'no_key' | 'no_adapter' | 'auth_error' | 'unreachable' | 'invalid_assignment';

export interface ModelCheckRow {
  feature: string;
  provider?: string;
  model?: string;
  validated: boolean;
  /** Modèle réellement utilisé à ce jour (null : fonctionnalité indisponible) */
  effectiveModel: string | null;
  status: ModelCheckStatus;
  contextWindow?: number;
  maxCompletionTokens?: number;
}

const TIMEOUT_MS = 10_000;

export async function checkConfiguredModels(
  baseUrlOverrides: Partial<Record<ProviderId, string>> = {},
): Promise<ModelCheckRow[]> {
  const lists = new Map<ProviderId, Promise<ModelInfo[] | ModelCheckStatus>>();

  const listFor = (provider: ProviderId) => {
    if (!lists.has(provider)) {
      const descriptor = PROVIDERS[provider];
      const apiKey = process.env[descriptor.apiKeyEnv]?.trim();
      const adapter = descriptor.createAdapter?.(baseUrlOverrides[provider] ?? descriptor.baseUrl);
      let result: Promise<ModelInfo[] | ModelCheckStatus>;
      if (!adapter?.listModels) result = Promise.resolve<ModelCheckStatus>('no_adapter');
      else if (!apiKey) result = Promise.resolve<ModelCheckStatus>('no_key');
      else {
        result = adapter.listModels({ apiKey, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch((err: unknown) =>
          err instanceof ProviderError && err.code === 'auth' ? 'auth_error' as const : 'unreachable' as const);
      }
      lists.set(provider, result);
    }
    return lists.get(provider)!;
  };

  const rows: ModelCheckRow[] = [];
  for (const feature of SEEDED_FEATURE_IDS) {
    const candidate = candidateFor(feature);
    const effective = envAssignmentResolver.resolve(feature);
    const effectiveModel = effective?.validated ? effective.model : null;

    if (!candidate) {
      rows.push({ feature, validated: false, effectiveModel, status: 'invalid_assignment' });
      continue;
    }

    const base = {
      feature,
      provider: candidate.provider,
      model: candidate.model,
      validated: isValidated(feature, candidate),
      effectiveModel,
    };
    const models = await listFor(candidate.provider);
    if (typeof models === 'string') {
      rows.push({ ...base, status: models });
      continue;
    }
    const info = models.find(m => m.id === candidate.model);
    rows.push({
      ...base,
      status: !info ? 'not_found' : info.active === false ? 'inactive' : 'found',
      contextWindow: info?.contextWindow,
      maxCompletionTokens: info?.maxCompletionTokens,
    });
  }
  return rows;
}

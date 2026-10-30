// blog-api/src/ai/services/probes.ts
// Sondes de compatibilité : petites générations RÉELLES, donc potentiellement facturées.
// Déclenchées uniquement par l'administrateur, avec confirmation. Elles prouvent les
// capacités dont une fonctionnalité a besoin : le catalogue seul ne le prouve pas.
// Aucune donnée de visiteur : uniquement des textes fixes et une image de test.

import type { Capability, FeatureDefinition } from '../features/registry';
import { ProviderError, type NormalizedErrorCode, type ProviderAdapter } from '../providers/types';

const PROBE_MAX_OUTPUT_TOKENS = 256;   // suffisant pour qu'un modèle à raisonnement réponde
const PROBE_TIMEOUT_MS = 30_000;

// Carré rouge de 8 × 8 pixels
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSAMrvD/E7bL4NAAAAAElFTkSuQmCC';

/** Le fournisseur n'a pas pu répondre : cela ne dit rien du modèle */
const INCONCLUSIVE = new Set<NormalizedErrorCode>(['auth', 'timeout', 'unavailable', 'rate_limited', 'quota_exceeded', 'aborted']);

export interface ProbeResult {
  status: 'compatible' | 'incompatible';
  capabilities: Capability[];
  code: string | null;
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

export async function runProbes(
  adapter: ProviderAdapter,
  feature: Pick<FeatureDefinition, 'requiredCapabilities'>,
  model: string,
  apiKey: string,
  params: Record<string, number | string>,
): Promise<ProbeResult> {
  const started = Date.now();
  const validated: Capability[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  const call = async (capability: Capability, request: Parameters<ProviderAdapter['generate']>[0], accept: (content: string) => boolean) => {
    const result = await adapter.generate(request, { apiKey, model, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    inputTokens  += result.usage?.inputTokens ?? 0;
    outputTokens += result.usage?.outputTokens ?? 0;
    if (!accept(result.content)) throw new ProviderError('invalid_response', undefined, `sonde ${capability}`);
    validated.push(capability);
  };

  const base = { maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS, params };
  const required = feature.requiredCapabilities;

  try {
    await call('text', {
      ...base,
      system: 'Réponds uniquement par le mot OK.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Test de connexion.' }] }],
    }, content => content.trim().length > 0);

    if (required.includes('json')) {
      await call('json', {
        ...base,
        output: 'json',
        system: 'Réponds uniquement avec du JSON valide, sans markdown.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Renvoie exactement {"ok":true}.' }] }],
      }, jsonIsValid);
    }

    if (required.includes('vision')) {
      await call('vision', {
        ...base,
        system: 'Réponds en un mot.',
        messages: [{ role: 'user', content: [
          { type: 'image', dataUrl: TEST_IMAGE, detail: 'low' },
          { type: 'text', text: 'Quelle est la couleur de cette image ?' },
        ] }],
      }, content => content.trim().length > 0);
    }
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    if (INCONCLUSIVE.has(err.code)) throw new ProbeInconclusive(err.code);
    return { status: 'incompatible', capabilities: validated, code: err.code, latencyMs: Date.now() - started, inputTokens, outputTokens };
  }

  return { status: 'compatible', capabilities: validated, code: null, latencyMs: Date.now() - started, inputTokens, outputTokens };
}

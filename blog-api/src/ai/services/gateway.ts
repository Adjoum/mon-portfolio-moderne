// blog-api/src/ai/services/gateway.ts
// Passerelle IA (doc 09 §5) : une requête = un identifiant de fonctionnalité + des données.
//   1. fonctionnalité connue et active        5. quotas (sujet, global, concurrence)
//   2. corps strict { input } uniquement       6. appel de l'adaptateur avec délai maximal
//   3. validation de l'entrée (schéma, tailles) 7. erreurs normalisées, jamais le message brut
//   4. affectation résolue côté serveur        8. journal d'usage sans contenu
// Fournisseur non configuré → refus neutre, AUCUN appel réseau.

import crypto from 'crypto';
import { FEATURES, type FeatureDefinition, type FeatureId } from '../features/registry';
import { InputError } from '../features/validate';
import { PROVIDERS } from '../providers/registry';
import { ProviderError, type ProviderAdapter, type ProviderDescriptor, type ProviderId } from '../providers/types';
import { envAssignmentResolver, type AssignmentResolver } from './assignments';
import { createMemoryQuotaService, quotasFromEnv, QuotaError, type QuotaService } from './quotas';
import { logUsage } from './usage';

export class AiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterSec?: number,
    public field?: string,
  ) {
    super(code);
  }
}

export interface AiGatewayDeps {
  features: Record<string, FeatureDefinition>;
  providers: Record<ProviderId, ProviderDescriptor>;
  resolver: AssignmentResolver;
  quotas: QuotaService;
  /** Remplace l'URL de base d'un fournisseur (tests uniquement, injecté dans le code) */
  baseUrlOverrides?: Partial<Record<ProviderId, string>>;
}

export interface RunContext {
  subject: string;     // 'ip:<clé>' ou 'user:<uuid>'
  signal: AbortSignal; // annulé si le client se déconnecte
  requestId: string;
}

export type Availability = { id: string; available: boolean; reason?: 'disabled' | 'not_configured' };

/** Champs de premier niveau acceptés dans le corps : tout le reste (model, provider, messages…) est refusé */
const ALLOWED_BODY_KEYS = ['input'];

/**
 * URL de développement local (faux fournisseur) : jamais en production, boucle locale uniquement.
 * AI_DEV_PROVIDER_BASE_URL_OPENAI=http://127.0.0.1:8787
 */
function devBaseUrl(provider: ProviderId): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  const raw = process.env[`AI_DEV_PROVIDER_BASE_URL_${provider.toUpperCase()}`];
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return url.origin;
  } catch { /* ignorée */ }
  console.error(`[AI] AI_DEV_PROVIDER_BASE_URL_${provider.toUpperCase()} ignorée (boucle locale uniquement)`);
  return undefined;
}

function disabledFeatures(): Set<string> {
  return new Set((process.env.AI_DISABLED_FEATURES ?? '').split(',').map(s => s.trim()).filter(Boolean));
}

function mapProviderError(err: ProviderError): AiError {
  switch (err.code) {
    case 'timeout':          return new AiError(504, 'AI_TIMEOUT');
    case 'rate_limited':     return new AiError(503, 'AI_BUSY', 30);
    case 'auth':
    case 'model_not_found':
    case 'model_deprecated':
    case 'quota_exceeded':   return new AiError(503, 'AI_FEATURE_UNAVAILABLE');
    case 'context_too_long':
    case 'bad_request':      return new AiError(422, 'AI_REQUEST_REJECTED');
    case 'content_filtered': return new AiError(422, 'AI_CONTENT_FILTERED');
    case 'aborted':          return new AiError(499, 'AI_ABORTED');
    default:                 return new AiError(502, 'AI_PROVIDER_ERROR');
  }
}

export function createAiGateway(overrides: Partial<AiGatewayDeps> = {}) {
  const deps: AiGatewayDeps = {
    features:  FEATURES,
    providers: PROVIDERS,
    resolver:  envAssignmentResolver,
    quotas:    createMemoryQuotaService(),
    ...overrides,
  };
  const adapters = new Map<ProviderId, ProviderAdapter>();

  function adapterFor(provider: ProviderId): ProviderAdapter | null {
    const descriptor = deps.providers[provider];
    if (!descriptor?.createAdapter) return null;
    let adapter = adapters.get(provider);
    if (!adapter) {
      const baseUrl = deps.baseUrlOverrides?.[provider] ?? devBaseUrl(provider) ?? descriptor.baseUrl;
      adapter = descriptor.createAdapter(baseUrl);
      adapters.set(provider, adapter);
    }
    return adapter;
  }

  /** Fonctionnalité exploitable maintenant ? (sans exposer fournisseur ni modèle) */
  function resolveTarget(feature: FeatureDefinition) {
    if (process.env.AI_ENABLED === 'false' || disabledFeatures().has(feature.id)) return { reason: 'disabled' as const };
    const assignment = deps.resolver.resolve(feature.id as FeatureId);
    if (!assignment) return { reason: 'not_configured' as const };
    const adapter = adapterFor(assignment.provider);
    const apiKey  = process.env[deps.providers[assignment.provider].apiKeyEnv]?.trim();
    if (!adapter || !apiKey) return { reason: 'not_configured' as const };
    if (feature.requiredCapabilities.includes('vision') && !adapter.supportsImages) return { reason: 'not_configured' as const };
    return { assignment, adapter, apiKey };
  }

  return {
    feature(featureId: string): FeatureDefinition | null {
      return Object.prototype.hasOwnProperty.call(deps.features, featureId) ? deps.features[featureId] : null;
    },

    availability(): Availability[] {
      return Object.values(deps.features).map(feature => {
        const target = resolveTarget(feature);
        return 'reason' in target ? { id: feature.id, available: false, reason: target.reason } : { id: feature.id, available: true };
      });
    },

    async run(featureId: string, body: unknown, ctx: RunContext): Promise<{ content: string }> {
      const feature = this.feature(featureId);
      if (!feature) throw new AiError(404, 'AI_FEATURE_UNKNOWN');
      const base = { requestId: ctx.requestId, feature: feature.id, subject: ctx.subject };

      // ── Corps strict ──
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AiError(400, 'AI_INVALID_INPUT', undefined, 'body');
      const extra = Object.keys(body).filter(k => !ALLOWED_BODY_KEYS.includes(k));
      if (extra.length) {
        logUsage({ ...base, outcome: 'blocked', code: 'AI_FORBIDDEN_FIELD' });
        console.warn(`[AI] ${ctx.requestId} champ(s) refusé(s) : ${extra.slice(0, 5).map(k => k.slice(0, 40)).join(', ')}`);
        throw new AiError(400, 'AI_FORBIDDEN_FIELD');
      }

      // ── Entrée ──
      let input: unknown;
      try {
        input = feature.parseInput((body as { input?: unknown }).input);
      } catch (err) {
        if (err instanceof InputError) {
          logUsage({ ...base, outcome: 'blocked', code: 'AI_INVALID_INPUT' });
          throw new AiError(400, 'AI_INVALID_INPUT', undefined, err.field.slice(0, 60));
        }
        throw err;
      }

      // ── Affectation et configuration (aucun appel si non configuré) ──
      const target = resolveTarget(feature);
      if ('reason' in target) {
        logUsage({ ...base, outcome: 'blocked', code: target.reason === 'disabled' ? 'AI_FEATURE_DISABLED' : 'AI_FEATURE_UNAVAILABLE' });
        throw new AiError(503, target.reason === 'disabled' ? 'AI_FEATURE_DISABLED' : 'AI_FEATURE_UNAVAILABLE');
      }
      const { assignment, adapter, apiKey } = target;
      const meta = { ...base, provider: assignment.provider, model: assignment.model };

      // ── Quotas ──
      let reservation;
      try {
        reservation = deps.quotas.reserve(feature.id, ctx.subject, quotasFromEnv(feature.id, feature.quotas));
      } catch (err) {
        if (err instanceof QuotaError) {
          logUsage({ ...meta, outcome: 'blocked', code: `${err.code}:${err.scope}` });
          throw new AiError(err.code === 'AI_BUSY' ? 503 : 429, err.code, err.retryAfterSec);
        }
        throw err;
      }

      // ── Appel ──
      const built = feature.buildRequest(input);
      const inputChars = built.system.length + built.messages
        .flatMap(m => m.content)
        .reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0);
      const started = Date.now();
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(feature.timeoutMs)]);

      try {
        const result = await adapter.generate(
          { ...built, maxOutputTokens: feature.maxOutputTokens, params: {} },
          { apiKey, model: assignment.model, signal },
        );
        logUsage({
          ...meta, outcome: 'ok', latencyMs: Date.now() - started, inputChars,
          outputChars: result.content.length, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens,
        });
        return { content: result.content };
      } catch (err) {
        const providerError = err instanceof ProviderError ? err : new ProviderError('unknown', undefined, (err as Error)?.name);
        logUsage({
          ...meta, outcome: 'error', code: providerError.code, latencyMs: Date.now() - started,
          inputChars, providerStatus: providerError.providerStatus,
        });
        if (providerError.code === 'auth' || providerError.code === 'model_not_found') {
          console.error(`[AI] ${feature.id} : ${providerError.code} (${providerError.detail ?? ''}) — vérifier la clé ou l'affectation`);
        }
        throw mapProviderError(providerError);
      } finally {
        reservation.release();
      }
    },
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;

export function newRequestId(): string {
  return crypto.randomUUID();
}

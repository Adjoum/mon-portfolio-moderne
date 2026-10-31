// blog-api/src/ai/services/gateway.ts
// Passerelle IA (doc 09 §5, doc 16 §5) : une requête = un identifiant de fonctionnalité + des données.
//   1. fonctionnalité connue et active           5. budget et quotas réservés (atomique, en base)
//   2. corps strict { input } uniquement          6. appel de l'adaptateur avec délai maximal
//   3. validation de l'entrée (schéma, tailles)   7. erreurs normalisées, jamais le message brut
//   4. affectation et clé lues dans Supabase      8. coût réel et journal d'usage sans contenu
// Non configuré, non testé, non tarifé ou budget invérifiable → refus neutre, AUCUN appel réseau.

import crypto from 'crypto';
import { FEATURES, type FeatureDefinition } from '../features/registry';
import { InputError } from '../features/validate';
import { PROVIDERS } from '../providers/registry';
import { ProviderError, type ProviderAdapter, type ProviderDescriptor, type ProviderId } from '../providers/types';
import { createConcurrencyLimiter, type ConcurrencyLimiter, type ConcurrencySlot } from './concurrency';
import { estimateMaxCost, usageCost } from './cost';
import { createAiStore, type AiRuntimeStore, type FeatureDescriptor, type RuntimeConfig, type RuntimeFeature } from './store';
import { hashSubject, logUsage, type UsageEvent } from './usage';

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
  store: AiRuntimeStore;
  concurrency: ConcurrencyLimiter;
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

/** Budget impossible à vérifier : nouvel essai conseillé dans une minute */
const STORE_RETRY_SEC = 60;
const BUSY_RETRY_SEC = 15;

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

export function featureDescriptor(feature: FeatureDefinition): FeatureDescriptor {
  return {
    id: feature.id,
    section: feature.section,
    requiredCapabilities: feature.requiredCapabilities,
    output: feature.output,
    authLevel: feature.authLevel,
    personalData: feature.personalData,
    promptVersion: feature.promptVersion,
    maxOutputTokens: feature.maxOutputTokens,
    timeoutMs: feature.timeoutMs,
    rateLimitPerMinute: feature.rateLimitPerMinute,
    quotas: feature.quotas,
  };
}

export function createAiGateway(overrides: Partial<AiGatewayDeps> = {}) {
  const deps: AiGatewayDeps = {
    features:    FEATURES,
    providers:   PROVIDERS,
    store:       overrides.store ?? createAiStore(),
    concurrency: createConcurrencyLimiter(),
    ...overrides,
  };
  const adapters = new Map<ProviderId, ProviderAdapter>();
  let lastConfig: RuntimeConfig | null = null;

  function adapterFor(provider: ProviderId): ProviderAdapter | null {
    const descriptor = deps.providers[provider];
    if (!descriptor) return null;
    let adapter = adapters.get(provider);
    if (!adapter) {
      const baseUrl = deps.baseUrlOverrides?.[provider] ?? devBaseUrl(provider) ?? descriptor.baseUrl;
      adapter = descriptor.createAdapter(baseUrl);
      adapters.set(provider, adapter);
    }
    return adapter;
  }

  async function loadConfig(): Promise<RuntimeConfig | null> {
    const config = await deps.store.config().catch(() => null);
    if (config) lastConfig = config;
    return config;
  }

  type Target =
    | { reason: 'disabled' | 'not_configured' }
    | { entry: RuntimeFeature & { model: string; pricing: NonNullable<RuntimeFeature['pricing']> }; settings: RuntimeConfig['settings'] };

  /** Fonctionnalité exploitable maintenant ? (sans exposer fournisseur ni modèle) */
  async function resolveTarget(feature: FeatureDefinition): Promise<Target> {
    if (process.env.AI_ENABLED === 'false' || disabledFeatures().has(feature.id)) return { reason: 'disabled' };
    const config = await loadConfig();
    const entry = config?.features[feature.id];
    if (!config || !entry) return { reason: 'not_configured' };
    if (!entry.enabled) return { reason: 'disabled' };
    if (entry.blocker || !entry.model || !entry.pricing) return { reason: 'not_configured' };
    return { entry: { ...entry, model: entry.model, pricing: entry.pricing }, settings: config.settings };
  }

  /** Le journal ne doit jamais faire échouer une réponse déjà obtenue */
  function record(event: UsageEvent & { costMicroUsd?: number }) {
    logUsage(event);
    deps.store.recordEvent({ ...event, subject: hashSubject(event.subject) })
      .catch(err => console.error('[AI] événement d’usage non enregistré :', (err as Error)?.name));
  }

  return {
    features(): FeatureDefinition[] {
      return Object.values(deps.features);
    },

    feature(featureId: string): FeatureDefinition | null {
      return Object.prototype.hasOwnProperty.call(deps.features, featureId) ? deps.features[featureId] : null;
    },

    adapter(provider: ProviderId): ProviderAdapter | null {
      return adapterFor(provider);
    },

    /** Limite par minute en vigueur (dernière configuration lue, sinon valeur du registre) */
    perMinute(featureId: string): number {
      return lastConfig?.features[featureId]?.quotas.perMinute ?? this.feature(featureId)?.rateLimitPerMinute ?? 6;
    },

    async availability(): Promise<Availability[]> {
      return Promise.all(Object.values(deps.features).map(async feature => {
        const target = await resolveTarget(feature);
        return 'reason' in target ? { id: feature.id, available: false, reason: target.reason } : { id: feature.id, available: true };
      }));
    },

    async run(featureId: string, body: unknown, ctx: RunContext): Promise<{ content: string }> {
      const feature = this.feature(featureId);
      if (!feature) throw new AiError(404, 'AI_FEATURE_UNKNOWN');
      const base = { requestId: ctx.requestId, feature: feature.id, subject: ctx.subject };

      // ── Corps strict ──
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AiError(400, 'AI_INVALID_INPUT', undefined, 'body');
      const extra = Object.keys(body).filter(k => !ALLOWED_BODY_KEYS.includes(k));
      if (extra.length) {
        record({ ...base, outcome: 'blocked', code: 'AI_FORBIDDEN_FIELD' });
        console.warn(`[AI] ${ctx.requestId} champ(s) refusé(s) : ${extra.slice(0, 5).map(k => k.slice(0, 40)).join(', ')}`);
        throw new AiError(400, 'AI_FORBIDDEN_FIELD');
      }

      // ── Entrée ──
      let input: unknown;
      try {
        input = feature.parseInput((body as { input?: unknown }).input);
      } catch (err) {
        if (err instanceof InputError) {
          record({ ...base, outcome: 'blocked', code: 'AI_INVALID_INPUT' });
          throw new AiError(400, 'AI_INVALID_INPUT', undefined, err.field.slice(0, 60));
        }
        throw err;
      }

      // ── Affectation (aucun appel si non configuré) ──
      const target = await resolveTarget(feature);
      if ('reason' in target) {
        const code = target.reason === 'disabled' ? 'AI_FEATURE_DISABLED' : 'AI_FEATURE_UNAVAILABLE';
        record({ ...base, outcome: 'blocked', code });
        throw new AiError(503, code);
      }
      const { entry, settings } = target;
      const meta = { ...base, provider: entry.provider, model: entry.model };

      const adapter = adapterFor(entry.provider);
      const visionMissing = feature.requiredCapabilities.includes('vision') && !adapter?.supportsImages;
      const apiKey = visionMissing ? null : await deps.store.secret(entry.provider).catch(() => null);
      if (!adapter || !apiKey) {
        record({ ...meta, outcome: 'blocked', code: 'AI_FEATURE_UNAVAILABLE' });
        throw new AiError(503, 'AI_FEATURE_UNAVAILABLE');
      }

      // ── Concurrence ──
      const slot: ConcurrencySlot | null = deps.concurrency.acquire(feature.id, entry.quotas.concurrency, settings.globalConcurrency);
      if (!slot) {
        record({ ...meta, outcome: 'blocked', code: 'AI_BUSY:concurrency' });
        throw new AiError(503, 'AI_BUSY', BUSY_RETRY_SEC);
      }

      try {
        // ── Budget et quotas : réservés avant tout appel, refus par défaut ──
        const reservedCost = estimateMaxCost(feature, input, entry.maxOutputTokens, entry.pricing);
        const reservation = await deps.store.reserve(feature.id, hashSubject(ctx.subject), reservedCost).catch(() => null);
        if (!reservation) {
          record({ ...meta, outcome: 'blocked', code: 'AI_BUDGET_UNVERIFIABLE' });
          throw new AiError(503, 'AI_FEATURE_UNAVAILABLE', STORE_RETRY_SEC);
        }
        if (!reservation.ok) {
          record({ ...meta, outcome: 'blocked', code: `${reservation.code}:${reservation.scope}` });
          throw new AiError(reservation.code === 'AI_FEATURE_UNAVAILABLE' ? 503 : 429, reservation.code, reservation.retryAfter);
        }

        // ── Appel ──
        const started = Date.now();
        const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(entry.timeoutMs)]);
        const settle = (actual: number, event: UsageEvent & { costMicroUsd: number }) => {
          logUsage(event);
          return deps.store.settle(feature.id, reservation.day, reservation.month, reservedCost, actual, { ...event, subject: hashSubject(event.subject) })
            .catch(err => console.error('[AI] coût non ajusté :', (err as Error)?.name));
        };

        try {
          const built = await feature.buildRequest(input, { signal });
          const inputChars = built.system.length + built.messages
            .flatMap(m => m.content)
            .reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0);

          const result = await adapter.generate(
            { ...built, maxOutputTokens: entry.maxOutputTokens, params: entry.params, output: feature.output },
            { apiKey, model: entry.model, signal },
          );
          const { inputTokens, outputTokens } = result.usage ?? {};
          // Consommation non indiquée par le fournisseur : le montant réservé est conservé
          const cost = inputTokens !== undefined && outputTokens !== undefined
            ? usageCost(inputTokens, outputTokens, entry.pricing)
            : reservedCost;

          const content = feature.parseOutput ? feature.parseOutput(result.content, input) : result.content;
          await settle(cost, {
            ...meta, outcome: 'ok', latencyMs: Date.now() - started, inputChars, outputChars: content.length,
            inputTokens, outputTokens, costMicroUsd: cost,
          });
          return { content };
        } catch (err) {
          const providerError = err instanceof ProviderError ? err : new ProviderError('unknown', undefined, (err as Error)?.name);
          // Une réponse reçue puis rejetée a tout de même été facturée
          const billed = providerError.code === 'invalid_response' ? reservedCost : 0;
          await settle(billed, {
            ...meta, outcome: 'error', code: providerError.code, latencyMs: Date.now() - started,
            providerStatus: providerError.providerStatus, costMicroUsd: billed,
          });
          if (providerError.code === 'auth' || providerError.code === 'model_not_found') {
            console.error(`[AI] ${feature.id} : ${providerError.code} (${providerError.detail ?? ''}) — vérifier la clé ou l'affectation`);
          }
          throw mapProviderError(providerError);
        }
      } finally {
        slot.release();
      }
    },
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;

export function newRequestId(): string {
  return crypto.randomUUID();
}

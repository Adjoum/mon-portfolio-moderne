// blog-api/src/ai/services/store.ts
// Accès d'exécution à la configuration IA : rôle Postgres restreint ai_backend, qui n'a aucun
// droit sur les tables, uniquement sur les fonctions ai_private.runtime_* (doc 16 §5.1).
//
// Configuration en cache court, invalidé après chaque écriture de l'administrateur : un
// changement s'applique à la requête suivante. Si la base est injoignable, la dernière
// configuration reste utilisable brièvement, mais aucun budget ne peut être réservé :
// aucune génération n'a lieu sans budget vérifié.
// Sans AI_DATABASE_URL : tout est « non configuré », aucun appel n'est possible.

import fs from 'fs';
import { Pool } from 'pg';
import type { ModelInfo, ProviderId } from '../providers/types';

export interface FeaturePricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface RuntimeFeature {
  provider: ProviderId;
  model: string | null;
  enabled: boolean;
  params: Record<string, number | string>;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Raison empêchant l'exécution ; null si la fonctionnalité est prête */
  blocker: string | null;
  pricing: FeaturePricing | null;
  quotas: { perMinute: number; concurrency: number };
}

export interface RuntimeConfig {
  settings: { dailyBudgetMicroUsd: number; monthlyBudgetMicroUsd: number; globalConcurrency: number };
  features: Record<string, RuntimeFeature>;
}

export type ReserveResult =
  | { ok: true; day: string; month: string }
  | { ok: false; code: 'AI_QUOTA_EXCEEDED' | 'AI_BUDGET_EXCEEDED' | 'AI_FEATURE_UNAVAILABLE'; scope: string; retryAfter?: number };

export interface UsageRecord {
  requestId: string;
  kind?: 'run' | 'probe';
  feature: string;
  provider?: string;
  model?: string;
  subject?: string;
  outcome: 'ok' | 'error' | 'blocked';
  code?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costMicroUsd?: number;
}

export interface FeatureDescriptor {
  id: string;
  section: string;
  requiredCapabilities: string[];
  output: string;
  authLevel: string;
  personalData: boolean;
  promptVersion: string;
  maxOutputTokens: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  quotas: { perSubjectPerDay: number; globalPerDay: number; concurrency: number };
}

export interface AiRuntimeStore {
  readonly configured: boolean;
  /** null : base non configurée ou injoignable */
  config(): Promise<RuntimeConfig | null>;
  /** Clé d'un fournisseur actif, pour l'exécution */
  secret(provider: ProviderId): Promise<string | null>;
  /** Clé stockée, même fournisseur inactif : vérifications de l'administrateur uniquement */
  adminSecret(provider: ProviderId): Promise<string | null>;
  reserve(feature: string, subject: string, costMicroUsd: number): Promise<ReserveResult>;
  settle(feature: string, day: string, month: string, reserved: number, actual: number, event: UsageRecord): Promise<void>;
  recordEvent(event: UsageRecord): Promise<void>;
  recordProbe(feature: string, costMicroUsd: number, event: UsageRecord): Promise<void>;
  syncFeatures(features: FeatureDescriptor[]): Promise<void>;
  /** À appeler après toute écriture de la configuration */
  invalidate(): void;
  close(): Promise<void>;
}

const CONFIG_TTL_MS   = 30_000;
const CONFIG_STALE_MS = 5 * 60_000;
const SECRET_TTL_MS   = 60_000;
const NOT_CONFIGURED_LOG_MS = 10 * 60_000;

/** Autorité de certification du projet Supabase : la connexion reste vérifiée */
function tlsOptions() {
  const caFile = process.env.AI_DATABASE_CA_FILE?.trim();
  return caFile ? { ca: fs.readFileSync(caFile, 'utf8'), rejectUnauthorized: true } : undefined;
}

export function createPgRuntimeStore(connectionString: string): AiRuntimeStore {
  const pool = new Pool({
    connectionString,
    ssl: tlsOptions(),
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
  });
  pool.on('error', err => console.error('[AI_STORE] connexion perdue :', err.name));

  let cached: { value: RuntimeConfig; loadedAt: number } | null = null;
  const secrets = new Map<string, { value: string | null; expiresAt: number }>();

  const value = async <T>(sql: string, args: unknown[] = []): Promise<T> => {
    const { rows } = await pool.query<{ value: T }>(sql, args);
    return rows[0]?.value;
  };

  async function readSecret(fn: 'runtime_secret' | 'runtime_admin_secret', provider: ProviderId) {
    const cacheKey = `${fn}:${provider}`;
    const hit = secrets.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const secret = await value<string | null>(`select ai_private.${fn}($1) as value`, [provider]);
    secrets.set(cacheKey, { value: secret ?? null, expiresAt: Date.now() + SECRET_TTL_MS });
    return secret ?? null;
  }

  return {
    configured: true,

    async config() {
      const now = Date.now();
      if (cached && now - cached.loadedAt < CONFIG_TTL_MS) return cached.value;
      try {
        const loaded = await value<RuntimeConfig>('select ai_private.runtime_config() as value');
        cached = { value: loaded, loadedAt: now };
        return loaded;
      } catch (err) {
        console.error('[AI_STORE] configuration illisible :', (err as Error).name);
        return cached && now - cached.loadedAt < CONFIG_STALE_MS ? cached.value : null;
      }
    },

    secret: provider => readSecret('runtime_secret', provider),
    adminSecret: provider => readSecret('runtime_admin_secret', provider),

    reserve: (feature, subject, cost) =>
      value<ReserveResult>('select ai_private.runtime_reserve($1, $2, $3) as value', [feature, subject, cost]),

    async settle(feature, day, month, reserved, actual, event) {
      await pool.query('select ai_private.runtime_settle($1, $2, $3, $4, $5, $6)', [feature, day, month, reserved, actual, JSON.stringify(event)]);
    },

    async recordEvent(event) {
      await pool.query('select ai_private.runtime_record_event($1)', [JSON.stringify(event)]);
    },

    async recordProbe(feature, cost, event) {
      await pool.query('select ai_private.runtime_record_probe($1, $2, $3)', [feature, cost, JSON.stringify(event)]);
    },

    async syncFeatures(features) {
      await pool.query('select ai_private.runtime_sync_features($1)', [JSON.stringify(features)]);
    },

    invalidate() {
      cached = null;
      secrets.clear();
    },

    close: () => pool.end(),
  };
}

export function createUnconfiguredStore(): AiRuntimeStore {
  let loggedAt = 0;
  const notConfigured = () => {
    if (Date.now() - loggedAt > NOT_CONFIGURED_LOG_MS) {
      loggedAt = Date.now();
      console.error('[AI_STORE] AI_DATABASE_URL absente : fonctionnalités IA indisponibles');
    }
  };
  const unavailable = async () => { throw new Error('AI_DATABASE_URL absente'); };

  return {
    configured: false,
    async config() { notConfigured(); return null; },
    async secret() { return null; },
    async adminSecret() { return null; },
    async reserve() { return { ok: false, code: 'AI_FEATURE_UNAVAILABLE', scope: 'store' }; },
    settle: unavailable,
    recordEvent: async () => {},
    recordProbe: unavailable,
    syncFeatures: async () => {},
    invalidate() {},
    close: async () => {},
  };
}

export function createAiStore(): AiRuntimeStore {
  const url = process.env.AI_DATABASE_URL?.trim();
  return url ? createPgRuntimeStore(url) : createUnconfiguredStore();
}

/** Catalogue officiel → format attendu par ai_admin_sync_models */
export function catalogPayload(models: ModelInfo[]) {
  return models.map(({ id, displayName, contextWindow, maxCompletionTokens, active, shutdownDate, vision, pricing }) =>
    ({ id, displayName, contextWindow, maxCompletionTokens, active, shutdownDate, vision, pricing }));
}

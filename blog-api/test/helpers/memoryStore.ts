// Stockage d'exécution en mémoire, pour les tests de la passerelle sans Postgres.
// Les règles SQL (réservation atomique, activation…) sont prouvées à part, sur un vrai
// Postgres : supabase/tests/ai. Ici, seul le comportement de la passerelle est testé.

import { FEATURES } from '../../src/ai/features/registry';
import type { ProviderId } from '../../src/ai/providers/types';
import type { AiRuntimeStore, ReserveResult, RuntimeConfig, RuntimeFeature, UsageRecord } from '../../src/ai/services/store';

export interface MemoryStore extends AiRuntimeStore {
  state: RuntimeConfig;
  keys: Partial<Record<ProviderId, string>>;
  events: UsageRecord[];
  settlements: { feature: string; reserved: number; actual: number }[];
  /** Quotas et budget simulés */
  reserveResult: ReserveResult | ((feature: string, subject: string, cost: number) => ReserveResult) | null;
  invalidations: number;
  failConfig: boolean;
  failReserve: boolean;
  setFeature(id: string, over: Partial<RuntimeFeature>): void;
  reset(): void;
}

const PRICING = { inputPerMTok: 1_000_000, outputPerMTok: 2_000_000 };
const OK: ReserveResult = { ok: true, day: '2026-10-30', month: '2026-10-01' };

function defaults(): RuntimeConfig {
  return {
    settings: { dailyBudgetMicroUsd: 5_000_000, monthlyBudgetMicroUsd: 30_000_000, globalConcurrency: 8 },
    features: Object.fromEntries(Object.values(FEATURES).map(f => [f.id, {
      provider: 'openai' as ProviderId,
      model: 'modele-de-test',
      enabled: true,
      params: {},
      maxOutputTokens: f.maxOutputTokens,
      timeoutMs: f.timeoutMs,
      blocker: null,
      pricing: PRICING,
      quotas: { perMinute: f.rateLimitPerMinute, concurrency: f.quotas.concurrency },
    }])),
  };
}

export function createMemoryStore(keys: Partial<Record<ProviderId, string>> = {}): MemoryStore {
  const initialKeys = { ...keys };
  const store: MemoryStore = {
    configured: true,
    state: defaults(),
    keys,
    events: [],
    settlements: [],
    reserveResult: OK,
    invalidations: 0,
    failConfig: false,
    failReserve: false,

    setFeature(id, over) {
      store.state.features[id] = { ...store.state.features[id], ...over };
    },

    reset() {
      store.state = defaults();
      store.keys = { ...initialKeys };
      store.events.length = 0;
      store.settlements.length = 0;
      store.reserveResult = OK;
      store.failConfig = false;
      store.failReserve = false;
    },

    async config() {
      if (store.failConfig) throw new Error('base injoignable');
      return store.state;
    },
    async secret(provider) { return store.keys[provider] ?? null; },
    async adminSecret(provider) { return store.keys[provider] ?? null; },
    async reserve(feature, subject, cost) {
      if (store.failReserve) throw new Error('base injoignable');
      const result = store.reserveResult;
      return (typeof result === 'function' ? result(feature, subject, cost) : result) ?? OK;
    },
    async settle(feature, _day, _month, reserved, actual, event) {
      store.settlements.push({ feature, reserved, actual });
      store.events.push(event);
    },
    async recordEvent(event) { store.events.push(event); },
    async recordProbe(_feature, _cost, event) { store.events.push(event); },
    async syncFeatures() {},
    invalidate() { store.invalidations++; },
    async close() {},
  };
  return store;
}

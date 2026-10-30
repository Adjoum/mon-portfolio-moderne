// blog-api/src/ai/services/quotas.ts
// Quotas journaliers (par sujet et global) et limites de concurrence, en mémoire.
// Instance unique de l'API (VM Oracle) : suffisant pour P0.A2.
// P1.B : compteurs persistants dans ai_usage_counters (Supabase), même interface.
//
// Surcharge par fonctionnalité : AI_QUOTA_<FEATURE>=parSujet/global/concurrence
// (ex. AI_QUOTA_CV_GENERATE=5/200/3). Concurrence globale : AI_MAX_CONCURRENCY (défaut 8).

import type { FeatureQuotas } from '../features/registry';

export class QuotaError extends Error {
  constructor(
    public code: 'AI_QUOTA_EXCEEDED' | 'AI_BUSY',
    public retryAfterSec: number,
    public scope: 'subject' | 'global' | 'concurrency',
  ) {
    super(code);
  }
}

export interface QuotaReservation {
  release(): void;
}

export interface QuotaService {
  reserve(featureId: string, subject: string, quotas: FeatureQuotas): QuotaReservation;
  reset(): void;
}

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function secondsToNextUtcDay(now: Date) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function quotasFromEnv(featureId: string, defaults: FeatureQuotas): FeatureQuotas {
  const raw = process.env[`AI_QUOTA_${featureId.replace(/\./g, '_').toUpperCase()}`];
  if (!raw) return defaults;
  const [perSubjectPerDay, globalPerDay, concurrency] = raw.split('/').map(v => Number.parseInt(v, 10));
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100_000;
  if (![perSubjectPerDay, globalPerDay, concurrency].every(valid)) {
    console.error(`[AI] Quota invalide pour ${featureId} : valeurs par défaut conservées`);
    return defaults;
  }
  return { perSubjectPerDay, globalPerDay, concurrency };
}

export function createMemoryQuotaService(now: () => Date = () => new Date()): QuotaService {
  let day = dayKey(now());
  let counters = new Map<string, number>();       // `${feature}|${subject}` et `${feature}|*`
  const inFlight = new Map<string, number>();      // par fonctionnalité
  let inFlightTotal = 0;

  const rollDay = () => {
    const today = dayKey(now());
    if (today !== day) { day = today; counters = new Map(); }
  };

  return {
    reserve(featureId, subject, quotas) {
      rollDay();
      const maxTotal = Number.parseInt(process.env.AI_MAX_CONCURRENCY ?? '', 10) || 8;
      const running = inFlight.get(featureId) ?? 0;
      if (running >= quotas.concurrency || inFlightTotal >= maxTotal) {
        throw new QuotaError('AI_BUSY', 15, 'concurrency');
      }

      const subjectKey = `${featureId}|${subject}`;
      const globalKey  = `${featureId}|*`;
      const usedBySubject = counters.get(subjectKey) ?? 0;
      const usedGlobally  = counters.get(globalKey) ?? 0;
      const retry = secondsToNextUtcDay(now());
      if (usedBySubject >= quotas.perSubjectPerDay) throw new QuotaError('AI_QUOTA_EXCEEDED', retry, 'subject');
      if (usedGlobally  >= quotas.globalPerDay)     throw new QuotaError('AI_QUOTA_EXCEEDED', retry, 'global');

      // Chaque tentative transmise au fournisseur est décomptée (y compris en cas d'erreur)
      counters.set(subjectKey, usedBySubject + 1);
      counters.set(globalKey, usedGlobally + 1);
      inFlight.set(featureId, running + 1);
      inFlightTotal++;

      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          inFlight.set(featureId, Math.max(0, (inFlight.get(featureId) ?? 1) - 1));
          inFlightTotal = Math.max(0, inFlightTotal - 1);
        },
      };
    },
    reset() {
      counters = new Map();
      inFlight.clear();
      inFlightTotal = 0;
    },
  };
}

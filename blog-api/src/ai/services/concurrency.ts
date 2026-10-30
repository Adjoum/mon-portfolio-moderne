// blog-api/src/ai/services/concurrency.ts
// Limites de concurrence, en mémoire : instance unique de l'API (VM Oracle).
// Les quotas et budgets, eux, sont persistants (ai_private.runtime_reserve).

export interface ConcurrencySlot {
  release(): void;
}

export interface ConcurrencyLimiter {
  /** null si la limite de la fonctionnalité ou la limite globale est atteinte */
  acquire(featureId: string, featureLimit: number, globalLimit: number): ConcurrencySlot | null;
  reset(): void;
}

export function createConcurrencyLimiter(): ConcurrencyLimiter {
  const running = new Map<string, number>();
  let total = 0;

  return {
    acquire(featureId, featureLimit, globalLimit) {
      const current = running.get(featureId) ?? 0;
      if (current >= featureLimit || total >= globalLimit) return null;
      running.set(featureId, current + 1);
      total++;

      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          running.set(featureId, Math.max(0, (running.get(featureId) ?? 1) - 1));
          total = Math.max(0, total - 1);
        },
      };
    },
    reset() {
      running.clear();
      total = 0;
    },
  };
}

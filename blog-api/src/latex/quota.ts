// blog-api/src/latex/quota.ts
// Quotas journaliers (par visiteur et global) et concurrence (globale et par visiteur), en mémoire :
// une seule instance de l'API (VM Oracle). Utilisés par la compilation LaTeX et l'import de CV,
// qui ne coûtent que du CPU local ; un redémarrage remet les compteurs à zéro, les limites par
// minute ou par dix minutes (express-rate-limit) et la concurrence restent en place.

export interface QuotaLimits {
  perSubjectPerDay: number;
  globalPerDay: number;
  maxConcurrency: number;
}

export type QuotaRefusal =
  | { code: 'BUSY'; status: 429 | 503; retryAfterSec: number }
  | { code: 'QUOTA_EXCEEDED'; status: 429; retryAfterSec: number };

const MAX_TRACKED_SUBJECTS = 100_000;

export function createQuota(limits: QuotaLimits, now: () => number = Date.now) {
  let day = '';
  let globalCount = 0;
  let running = 0;
  const perSubject = new Map<string, number>();
  const runningBySubject = new Map<string, number>();

  const secondsToMidnight = () => {
    const t = new Date(now());
    return Math.max(60, Math.ceil((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1) - t.getTime()) / 1000));
  };

  /** Réserve une exécution ; renvoie la fonction de libération, ou le motif de refus */
  function reserve(subject: string): { release: () => void } | { refusal: QuotaRefusal } {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      globalCount = 0;
      perSubject.clear();
    }
    if (running >= limits.maxConcurrency) return { refusal: { code: 'BUSY', status: 503, retryAfterSec: 3 } };
    if ((runningBySubject.get(subject) ?? 0) >= 1) return { refusal: { code: 'BUSY', status: 429, retryAfterSec: 2 } };
    const used = perSubject.get(subject) ?? 0;
    if (used >= limits.perSubjectPerDay || globalCount >= limits.globalPerDay) {
      return { refusal: { code: 'QUOTA_EXCEEDED', status: 429, retryAfterSec: secondsToMidnight() } };
    }
    if (!perSubject.has(subject) && perSubject.size >= MAX_TRACKED_SUBJECTS) return { refusal: { code: 'BUSY', status: 503, retryAfterSec: 60 } };

    perSubject.set(subject, used + 1);
    globalCount++;
    running++;
    runningBySubject.set(subject, (runningBySubject.get(subject) ?? 0) + 1);
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        running--;
        const left = (runningBySubject.get(subject) ?? 1) - 1;
        if (left > 0) runningBySubject.set(subject, left);
        else runningBySubject.delete(subject);
      },
    };
  }

  return { reserve };
}

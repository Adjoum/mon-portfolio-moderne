// blog-api/src/ai/services/usage.ts
// Journal d'utilisation des fonctionnalités IA : une ligne JSON [AI_USAGE] par requête.
// AUCUN prompt, AUCUNE réponse, AUCUNE IP en clair : le sujet est haché par HMAC.
// P1.B : copie dans ai_usage_events (Supabase).

import crypto from 'crypto';

// Sel de hachage : AI_LOG_HMAC_SECRET (stable entre redémarrages) ou aléatoire par processus
const hmacKey = process.env.AI_LOG_HMAC_SECRET || crypto.randomBytes(32).toString('hex');

export function hashSubject(subject: string): string {
  return crypto.createHmac('sha256', hmacKey).update(subject).digest('hex').slice(0, 16);
}

export interface UsageEvent {
  requestId: string;
  feature: string;
  provider?: string;
  model?: string;
  outcome: 'ok' | 'error' | 'blocked';
  code?: string;
  subject: string;
  latencyMs?: number;
  inputChars?: number;
  outputChars?: number;
  inputTokens?: number;
  outputTokens?: number;
  providerStatus?: number;
}

export function logUsage(event: UsageEvent): void {
  const { subject, ...rest } = event;
  console.log(`[AI_USAGE] ${JSON.stringify({ at: new Date().toISOString(), ...rest, subject: hashSubject(subject) })}`);
}

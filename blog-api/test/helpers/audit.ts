import { vi } from 'vitest';

export interface CapturedAudit {
  at: string;
  action: string;
  outcome: string;
  actorType: string;
  actorId?: string;
  target?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Événements [AUDIT] écrits sur stdout depuis le dernier beforeEach */
export function auditEvents(): CapturedAudit[] {
  return vi.mocked(console.log).mock.calls
    .map(args => String(args[0]))
    .filter(line => line.startsWith('[AUDIT] '))
    .map(line => JSON.parse(line.slice('[AUDIT] '.length)));
}

/** Toutes les sorties console (log + error + warn) concaténées */
export function allConsoleOutput(): string {
  return [console.log, console.error, console.warn]
    .flatMap(fn => vi.mocked(fn).mock.calls)
    .map(args => args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

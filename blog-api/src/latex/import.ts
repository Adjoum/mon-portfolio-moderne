// blog-api/src/latex/import.ts
// Import d'un CV dans le studio LaTeX : extraction du texte déléguée au service isolé cv-extractor.
//
// Ce processus détient les secrets du serveur : il n'analyse JAMAIS le fichier lui-même. Il vérifie
// le type annoncé et la signature, applique quotas et concurrence, transmet uniquement les octets
// et le type au service isolé, puis revérifie la réponse. Le fichier n'est ni écrit sur disque,
// ni journalisé, ni conservé : il ne vit que le temps de la requête, en mémoire.

import { createQuota } from './quota';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;

/** Types acceptés (déclarés par le navigateur) → format attendu par l'extracteur */
export const IMPORT_TYPES: Record<string, 'pdf' | 'docx' | 'txt' | 'rtf'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
};

const SIGNATURES: Record<'pdf' | 'docx' | 'txt' | 'rtf', (b: Buffer) => boolean> = {
  pdf:  b => b.subarray(0, 5).toString('latin1') === '%PDF-',
  docx: b => b.length > 4 && b.readUInt32BE(0) === 0x504b0304,
  rtf:  b => b.subarray(0, 5).toString('latin1') === '{\\rtf',
  txt:  b => !b.subarray(0, 1024).includes(0),
};

export interface ImportConfig {
  extractorUrl: string;
  timeoutMs: number;
  maxConcurrency: number;
  perSubjectPerDay: number;
  globalPerDay: number;
}

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** null : import désactivé (aucun extracteur configuré) */
export function importConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ImportConfig | null {
  const raw = env.CV_EXTRACTOR_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error('[IMPORT] CV_EXTRACTOR_URL invalide : import désactivé');
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    console.error('[IMPORT] CV_EXTRACTOR_URL refusée : import désactivé');
    return null;
  }
  return {
    extractorUrl: url.origin,
    timeoutMs: positive(env.CV_IMPORT_TIMEOUT_MS, 30_000),
    maxConcurrency: positive(env.CV_IMPORT_CONCURRENCY, 2),
    perSubjectPerDay: positive(env.CV_IMPORT_PER_DAY, 40),
    globalPerDay: positive(env.CV_IMPORT_GLOBAL_PER_DAY, 2000),
  };
}

export class ImportError extends Error {
  constructor(public status: number, public code: string, public retryAfterSec?: number) {
    super(code);
  }
}

export interface ImportResult { text: string; truncated: boolean; pages: number | null; needsOcr: boolean }

const EXTRACTOR_CODES = new Set(['EXTRACT_INVALID_FILE', 'EXTRACT_TYPE_MISMATCH', 'EXTRACT_ACTIVE_CONTENT', 'EXTRACT_TOO_COMPLEX', 'EXTRACT_PROTECTED', 'EXTRACT_TIMEOUT', 'EXTRACT_EMPTY']);

export function createImporter(config: ImportConfig, deps: { fetch?: typeof fetch; now?: () => number } = {}) {
  const doFetch = deps.fetch ?? fetch;
  const quota = createQuota(config, deps.now);

  async function callExtractor(file: Buffer, kind: string, signal: AbortSignal): Promise<ImportResult> {
    const timeout = AbortSignal.timeout(config.timeoutMs);
    let res: Response;
    try {
      // Seules données transmises : les octets et le format. Ni nom de fichier, ni en-tête du visiteur.
      res = await doFetch(`${config.extractorUrl}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Kind': kind },
        body: new Uint8Array(file),
        redirect: 'error',
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch {
      if (signal.aborted) throw new ImportError(499, 'IMPORT_ABORTED');
      if (timeout.aborted) throw new ImportError(504, 'IMPORT_TIMEOUT');
      throw new ImportError(503, 'IMPORT_UNAVAILABLE', 30);
    }
    let body: Record<string, unknown> = {};
    try {
      const raw = await res.text();
      if (raw.length > 200_000) throw new Error('réponse trop longue');
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ImportError(502, 'IMPORT_EXTRACTOR_ERROR');
    }
    if (res.status === 200 && typeof body.text === 'string') {
      return {
        text: body.text.slice(0, MAX_TEXT_CHARS),
        truncated: body.truncated === true || body.text.length > MAX_TEXT_CHARS,
        pages: Number.isInteger(body.pages) ? body.pages as number : null,
        needsOcr: body.needsOcr === true,
      };
    }
    if (res.status === 503) throw new ImportError(503, 'IMPORT_BUSY', 3);
    if (res.status === 413) throw new ImportError(413, 'IMPORT_TOO_LARGE');
    const code = typeof body.code === 'string' && EXTRACTOR_CODES.has(body.code) ? body.code.replace('EXTRACT_', 'IMPORT_') : 'IMPORT_EXTRACTOR_ERROR';
    throw new ImportError(code === 'IMPORT_EXTRACTOR_ERROR' ? 502 : 422, code);
  }

  return {
    config,
    async extract(subject: string, file: Buffer, declaredType: string, signal: AbortSignal): Promise<ImportResult> {
      const kind = IMPORT_TYPES[declaredType.split(';')[0].trim().toLowerCase()];
      if (!kind) throw new ImportError(415, 'IMPORT_UNSUPPORTED_TYPE');
      if (!file.length) throw new ImportError(400, 'IMPORT_EMPTY');
      if (file.length > MAX_IMPORT_BYTES) throw new ImportError(413, 'IMPORT_TOO_LARGE');
      if (!SIGNATURES[kind](file)) throw new ImportError(415, 'IMPORT_TYPE_MISMATCH');
      const slot = quota.reserve(subject);
      if ('refusal' in slot) {
        const { code, status, retryAfterSec } = slot.refusal;
        throw new ImportError(status, code === 'BUSY' ? 'IMPORT_BUSY' : 'IMPORT_QUOTA_EXCEEDED', retryAfterSec);
      }
      try {
        return await callExtractor(file, kind, signal);
      } finally {
        slot.release();
      }
    },
  };
}

export type CvImporter = ReturnType<typeof createImporter>;

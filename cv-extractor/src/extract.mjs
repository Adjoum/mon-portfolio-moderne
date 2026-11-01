// cv-extractor/src/extract.mjs
// Chaque extraction tourne dans un thread dédié : tas mémoire borné, arrêt forcé au délai,
// aucun état partagé entre deux fichiers. Le document n'est jamais écrit sur disque.

import { Worker } from 'node:worker_threads';
import { cleanText } from './text.mjs';

export const EXTRACT_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS) || 20_000;
const WORKER_URL = new URL('./worker.mjs', import.meta.url);

export class ExtractFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * @param {Buffer} buffer
 * @param {'pdf'|'docx'|'txt'|'rtf'} kind
 * @returns {Promise<{ text: string, truncated: boolean, pages: number|null, needsOcr: boolean }>}
 */
export function extract(buffer, kind, timeoutMs = EXTRACT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, {
      workerData: { kind },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, codeRangeSizeMb: 16, stackSizeMb: 4 },
      env: {},          // aucune variable d'environnement dans le thread
      stdout: true,     // sorties du thread ignorées (pdf.js écrit des avertissements)
      stderr: true,
    });
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new ExtractFailure('EXTRACT_TIMEOUT')), timeoutMs);
    worker.on('message', msg => {
      if (msg?.ok) {
        const { text, truncated } = cleanText(msg.text ?? '');
        done(resolve, { text, truncated, pages: msg.pages ?? null, needsOcr: !!msg.needsOcr });
      } else {
        done(reject, new ExtractFailure(typeof msg?.code === 'string' && msg.code.startsWith('EXTRACT_') ? msg.code : 'EXTRACT_INVALID_FILE'));
      }
    });
    worker.on('error', err => done(reject, new ExtractFailure(err?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'EXTRACT_TOO_COMPLEX' : 'EXTRACT_INVALID_FILE')));
    worker.on('exit', code => { if (code !== 0) done(reject, new ExtractFailure('EXTRACT_INVALID_FILE')); });
    // Copie transférée : le tampon d'origine est détaché, le thread en est seul propriétaire
    const copy = new Uint8Array(buffer);
    worker.postMessage(copy, [copy.buffer]);
  });
}

// blog-api/src/latex/compile.ts
// Compilation LaTeX → PDF déléguée au service isolé latex-runner (audit S2, doc 22).
//
// Ce processus détient les secrets du serveur : il ne lance JAMAIS TeX lui-même et n'écrit aucun
// fichier. Il valide la requête, applique quotas et concurrence, puis transmet au runner
// uniquement { tex, photo } : ni en-tête du visiteur, ni cookie, ni adresse IP, ni variable.
// La réponse du runner est revérifiée (PDF réel, taille bornée, erreurs filtrées à nouveau).

export const MAX_TEX_BYTES = 200 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface LatexCompileConfig {
  /** Adresse du runner sur le réseau Docker interne, par exemple http://latex-runner:3000 */
  runnerUrl: string;
  /** Délai maximal d'attente du runner (son propre délai de compilation est plus court) */
  timeoutMs: number;
  /** Compilations simultanées, toutes origines confondues (le runner applique la même limite) */
  maxConcurrency: number;
  /** Compilations par visiteur et par jour UTC */
  perSubjectPerDay: number;
  /** Compilations par jour UTC, tous visiteurs */
  globalPerDay: number;
}

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** null : compilation désactivée (aucun runner configuré), comportement par défaut */
export function latexConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LatexCompileConfig | null {
  const raw = env.LATEX_RUNNER_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error('[LATEX] LATEX_RUNNER_URL invalide : compilation désactivée');
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    console.error('[LATEX] LATEX_RUNNER_URL refusée (protocole, identifiants ou paramètres) : compilation désactivée');
    return null;
  }
  return {
    runnerUrl: url.origin,
    timeoutMs: positive(env.LATEX_RUNNER_TIMEOUT_MS, 30_000),
    maxConcurrency: positive(env.LATEX_COMPILE_CONCURRENCY, 2),
    perSubjectPerDay: positive(env.LATEX_COMPILE_PER_DAY, 300),
    globalPerDay: positive(env.LATEX_COMPILE_GLOBAL_PER_DAY, 5000),
  };
}

export interface CompileDetail { line?: number; message: string; context?: string }

export class LatexCompileError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: { details?: CompileDetail[]; subject?: string; line?: number; retryAfterSec?: number } = {},
  ) {
    super(code);
  }
}

export interface CompileInput { tex: string; photo?: Buffer }

/** Corps accepté : exactement { code } ou { code, photo }, photo en data URL JPEG */
export function parseCompileBody(body: unknown): CompileInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LatexCompileError(400, 'LATEX_INVALID_REQUEST');
  const o = body as Record<string, unknown>;
  if (Object.keys(o).some(k => k !== 'code' && k !== 'photo')) throw new LatexCompileError(400, 'LATEX_INVALID_REQUEST');
  if (typeof o.code !== 'string') throw new LatexCompileError(400, 'LATEX_INVALID_REQUEST');
  if (!o.code.trim()) throw new LatexCompileError(400, 'LATEX_EMPTY_SOURCE');
  if (Buffer.byteLength(o.code, 'utf8') > MAX_TEX_BYTES) throw new LatexCompileError(413, 'LATEX_TOO_LARGE');

  let photo: Buffer | undefined;
  if (o.photo !== undefined && o.photo !== null && o.photo !== '') {
    const match = typeof o.photo === 'string' ? /^data:image\/jpe?g;base64,([A-Za-z0-9+/]+={0,2})$/.exec(o.photo) : null;
    if (!match) throw new LatexCompileError(400, 'LATEX_INVALID_PHOTO');
    photo = Buffer.from(match[1], 'base64');
    if (photo.length > MAX_PHOTO_BYTES) throw new LatexCompileError(413, 'LATEX_PHOTO_TOO_LARGE');
    if (photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) throw new LatexCompileError(400, 'LATEX_INVALID_PHOTO');
  }
  return { tex: o.code, photo };
}

/** Deuxième filtre des erreurs du runner : jamais de chemin, de caractère de contrôle ni de texte long */
export function sanitizeDetails(raw: unknown): CompileDetail[] {
  if (!Array.isArray(raw)) return [];
  const clean = (value: unknown, max: number) => String(value ?? '')
    .replace(/(^|[\s(`'"<=])\.{0,2}\/(?:[\w.@+-]+\/)*([\w.@+-]+)/g, '$1$2')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return raw.slice(0, 5).flatMap((item): CompileDetail[] => {
    if (!item || typeof item !== 'object') return [];
    const e = item as Record<string, unknown>;
    const message = clean(e.message, 240);
    if (!message) return [];
    const detail: CompileDetail = { message };
    if (Number.isInteger(e.line) && (e.line as number) > 0 && (e.line as number) < 100_000) detail.line = e.line as number;
    const context = clean(e.context, 120);
    if (context) detail.context = context;
    return [detail];
  });
}

const RUNNER_REFUSALS = new Set([
  'LATEX_FORBIDDEN_COMMAND', 'LATEX_PACKAGE_NOT_ALLOWED', 'LATEX_CLASS_NOT_ALLOWED', 'LATEX_INVALID_SOURCE',
  'LATEX_COMPILE_ERROR', 'LATEX_TIMEOUT', 'LATEX_RESOURCE_LIMIT',
]);

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) return null;
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Un vrai PDF : en-tête %PDF- et marque de fin %%EOF */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 64
    && buf.subarray(0, 5).toString('latin1') === '%PDF-'
    && buf.subarray(Math.max(0, buf.length - 1024)).toString('latin1').includes('%%EOF');
}

export interface LatexCompiler {
  readonly config: LatexCompileConfig;
  compile(subject: string, input: CompileInput, signal: AbortSignal): Promise<Buffer>;
}

export function createLatexCompiler(
  config: LatexCompileConfig,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): LatexCompiler {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  // Quotas journaliers en mémoire : une seule instance de l'API (VM Oracle). La compilation ne
  // coûte que du CPU local ; un redémarrage remet les compteurs à zéro, la limite par 10 minutes
  // et la concurrence restent en place.
  let day = '';
  let globalCount = 0;
  const perSubject = new Map<string, number>();
  const runningBySubject = new Map<string, number>();
  let running = 0;
  const MAX_TRACKED_SUBJECTS = 100_000;

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const secondsToMidnight = () => {
    const t = now();
    return Math.max(60, Math.ceil((Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1) - t) / 1000));
  };

  function reserve(subject: string) {
    const d = today();
    if (d !== day) {
      day = d;
      globalCount = 0;
      perSubject.clear();
    }
    if (running >= config.maxConcurrency) throw new LatexCompileError(503, 'LATEX_BUSY', { retryAfterSec: 3 });
    if ((runningBySubject.get(subject) ?? 0) >= 1) throw new LatexCompileError(429, 'LATEX_BUSY', { retryAfterSec: 2 });
    const used = perSubject.get(subject) ?? 0;
    if (used >= config.perSubjectPerDay || globalCount >= config.globalPerDay) {
      throw new LatexCompileError(429, 'LATEX_QUOTA_EXCEEDED', { retryAfterSec: secondsToMidnight() });
    }
    if (!perSubject.has(subject) && perSubject.size >= MAX_TRACKED_SUBJECTS) throw new LatexCompileError(503, 'LATEX_BUSY', { retryAfterSec: 60 });
    perSubject.set(subject, used + 1);
    globalCount++;
    running++;
    runningBySubject.set(subject, (runningBySubject.get(subject) ?? 0) + 1);
    return () => {
      running--;
      const left = (runningBySubject.get(subject) ?? 1) - 1;
      if (left > 0) runningBySubject.set(subject, left);
      else runningBySubject.delete(subject);
    };
  }

  async function callRunner(input: CompileInput, signal: AbortSignal): Promise<Buffer> {
    // Seules données transmises : le source et la photo. Aucun en-tête du visiteur.
    const body = JSON.stringify(input.photo ? { tex: input.tex, photo: input.photo.toString('base64') } : { tex: input.tex });
    const timeout = AbortSignal.timeout(config.timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${config.runnerUrl}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch {
      if (signal.aborted) throw new LatexCompileError(499, 'LATEX_ABORTED');
      if (timeout.aborted) throw new LatexCompileError(504, 'LATEX_TIMEOUT');
      throw new LatexCompileError(503, 'LATEX_RUNNER_UNAVAILABLE', { retryAfterSec: 30 });
    }

    try {
      const type = res.headers.get('content-type') ?? '';
      if (res.status === 200 && type.startsWith('application/pdf')) {
        const pdf = await readCapped(res, MAX_PDF_BYTES);
        if (!pdf) throw new LatexCompileError(422, 'LATEX_RESOURCE_LIMIT');
        if (!looksLikePdf(pdf)) throw new LatexCompileError(502, 'LATEX_RUNNER_ERROR');
        return pdf;
      }
      const raw = type.includes('application/json') ? await readCapped(res, 64 * 1024) : null;
      let payload: Record<string, unknown> = {};
      try { payload = raw ? JSON.parse(raw.toString('utf8')) as Record<string, unknown> : {}; } catch { /* corps illisible */ }
      const code = typeof payload.code === 'string' ? payload.code : '';

      if (res.status === 503 && code === 'LATEX_BUSY') throw new LatexCompileError(503, 'LATEX_BUSY', { retryAfterSec: 3 });
      if (res.status === 413) throw new LatexCompileError(413, code === 'LATEX_PHOTO_TOO_LARGE' ? 'LATEX_PHOTO_TOO_LARGE' : 'LATEX_TOO_LARGE');
      if (res.status === 422 && RUNNER_REFUSALS.has(code)) {
        const subject = typeof payload.subject === 'string' ? payload.subject.replace(/[^\w\\*^@.-]/g, '').slice(0, 60) : undefined;
        const line = Number.isInteger(payload.line) ? payload.line as number : undefined;
        throw new LatexCompileError(422, code, { details: sanitizeDetails(payload.errors), subject, line });
      }
      console.error(`[LATEX] réponse inattendue du runner : HTTP ${res.status}${code ? ` ${code.slice(0, 40)}` : ''}`);
      throw new LatexCompileError(502, 'LATEX_RUNNER_ERROR');
    } catch (err) {
      if (err instanceof LatexCompileError) throw err;
      if (signal.aborted) throw new LatexCompileError(499, 'LATEX_ABORTED');
      if (timeout.aborted) throw new LatexCompileError(504, 'LATEX_TIMEOUT');
      throw new LatexCompileError(502, 'LATEX_RUNNER_ERROR');
    }
  }

  return {
    config,
    async compile(subject, input, signal) {
      const release = reserve(subject);
      try {
        return await callRunner(input, signal);
      } finally {
        release();
      }
    },
  };
}

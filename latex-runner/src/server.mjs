// latex-runner/src/server.mjs
// Service de compilation isolé, joignable uniquement par blog-api sur un réseau Docker interne.
//   GET  /healthz   → { status: 'ok' }
//   POST /compile   { tex, photo? (JPEG en base64) } → application/pdf, ou { code, … } en JSON
//
// Aucune dépendance npm, aucun secret : un jeton partagé serait lisible par le processus TeX
// (même utilisateur) et ne protégerait rien ; l'accès est limité par le réseau (doc 22 §2).
// Aucun contenu de document n'est journalisé.

import http from 'node:http';
import { checkSource, PolicyError } from './policy.mjs';
import { cleanWorkRoot, compile, CompileError, LIMITS } from './compile.mjs';

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.LATEX_MAX_CONCURRENCY) || 2);

let running = 0;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json), 'Cache-Control': 'no-store' });
  res.end(json);
}

/** Corps JSON borné : la lecture s'arrête dès la limite dépassée */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES) return reject(Object.assign(new Error('too large'), { status: 413 }));
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('too large'), { status: 413 }));
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Valide la requête : exactement { tex } ou { tex, photo }, photo JPEG ≤ 2 Mo */
export function parseJob(raw) {
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return { error: 'LATEX_INVALID_REQUEST' }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'LATEX_INVALID_REQUEST' };
  const keys = Object.keys(body);
  if (keys.some(k => k !== 'tex' && k !== 'photo') || typeof body.tex !== 'string') return { error: 'LATEX_INVALID_REQUEST' };

  let photo;
  if (body.photo !== undefined) {
    if (typeof body.photo !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) return { error: 'LATEX_INVALID_PHOTO' };
    photo = Buffer.from(body.photo, 'base64');
    if (photo.length > MAX_PHOTO_BYTES) return { error: 'LATEX_PHOTO_TOO_LARGE' };
    // JPEG uniquement (le recadrage du navigateur produit toujours du JPEG)
    if (photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) return { error: 'LATEX_INVALID_PHOTO' };
  }
  return { tex: body.tex, photo };
}

async function handleCompile(req, res) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { code: 'LATEX_INVALID_REQUEST' });
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return send(res, err.status === 413 ? 413 : 400, { code: err.status === 413 ? 'LATEX_TOO_LARGE' : 'LATEX_INVALID_REQUEST' });
  }
  const job = parseJob(raw);
  if (job.error) return send(res, job.error === 'LATEX_PHOTO_TOO_LARGE' ? 413 : 400, { code: job.error });

  try {
    checkSource(job.tex);
  } catch (err) {
    if (!(err instanceof PolicyError)) throw err;
    const status = err.code === 'LATEX_TOO_LARGE' ? 413 : 422;
    return send(res, status, { code: err.code, ...(err.subject ? { subject: err.subject } : {}), ...(err.line ? { line: err.line } : {}) });
  }

  if (running >= MAX_CONCURRENCY) return send(res, 503, { code: 'LATEX_BUSY' });
  running++;
  // L'appelant s'est déconnecté (blog-api a abandonné) : TeX est arrêté aussitôt
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const started = Date.now();
  try {
    const { pdf, passes } = await compile({ tex: job.tex, photo: job.photo, signal: controller.signal });
    console.log(`[latex] ok passes=${passes} ms=${Date.now() - started} bytes=${pdf.length}`);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'no-store' });
    res.end(pdf);
  } catch (err) {
    const code = err instanceof CompileError ? err.code : 'LATEX_INTERNAL';
    console.log(`[latex] ${code} ms=${Date.now() - started}`);
    if (res.writableEnded || res.destroyed) return;
    if (code === 'LATEX_INTERNAL') return send(res, 500, { code });
    send(res, 422, { code, errors: err.errors ?? [] });
  } finally {
    running--;
  }
}

export function createServer() {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method === 'GET' && url === '/healthz') return send(res, 200, { status: 'ok' });
    if (url === '/compile') {
      if (req.method !== 'POST') return send(res, 405, { code: 'LATEX_METHOD_NOT_ALLOWED' });
      return void handleCompile(req, res).catch(() => { if (!res.headersSent) send(res, 500, { code: 'LATEX_INTERNAL' }); });
    }
    send(res, 404, { code: 'LATEX_NOT_FOUND' });
  });
  // Connexions lentes ou bloquées : fermées bien avant l'épuisement des descripteurs
  server.headersTimeout = 10_000;
  server.requestTimeout = LIMITS.timeoutMs + 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await cleanWorkRoot();
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => console.log(`[latex] prêt sur le port ${PORT} (concurrence ${MAX_CONCURRENCY}, délai ${LIMITS.timeoutMs} ms)`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

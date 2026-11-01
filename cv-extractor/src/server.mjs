// cv-extractor/src/server.mjs
// Extraction isolée du texte des CV importés, joignable uniquement par blog-api (réseau interne).
//   GET  /healthz   → { status: 'ok' }
//   POST /extract   corps : octets du fichier ; en-tête X-File-Kind : pdf | docx | txt | rtf
//                   → { text, truncated, pages, needsOcr }
// Aucun secret, aucun réseau sortant, aucun fichier écrit, aucun contenu journalisé.

import http from 'node:http';
import { extract, ExtractFailure } from './extract.mjs';

const PORT = Number(process.env.PORT) || 3100;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.EXTRACT_MAX_CONCURRENCY) || 2);
const KINDS = new Set(['pdf', 'docx', 'txt', 'rtf']);

let running = 0;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json), 'Cache-Control': 'no-store' });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > MAX_FILE_BYTES) return reject(new ExtractFailure('EXTRACT_TOO_LARGE'));
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) {
        req.destroy();
        reject(new ExtractFailure('EXTRACT_TOO_LARGE'));
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(new ExtractFailure('EXTRACT_INVALID_FILE')));
  });
}

async function handle(req, res) {
  const kind = String(req.headers['x-file-kind'] ?? '');
  if (!KINDS.has(kind)) return send(res, 400, { code: 'EXTRACT_UNSUPPORTED_TYPE' });
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return send(res, err.code === 'EXTRACT_TOO_LARGE' ? 413 : 400, { code: err.code });
  }
  if (!body.length) return send(res, 400, { code: 'EXTRACT_EMPTY' });
  if (running >= MAX_CONCURRENCY) return send(res, 503, { code: 'EXTRACT_BUSY' });
  running++;
  const started = Date.now();
  try {
    const result = await extract(body, kind);
    console.log(`[extract] ok ${kind} ${Date.now() - started} ms`);
    send(res, 200, result);
  } catch (err) {
    const code = err instanceof ExtractFailure ? err.code : 'EXTRACT_INVALID_FILE';
    console.log(`[extract] ${code} ${kind} ${Date.now() - started} ms`);
    send(res, 422, { code });
  } finally {
    running--;
    body.fill(0);   // le tampon est effacé, même s'il reste référencé un instant
  }
}

export function createServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { status: 'ok' });
    if (req.url === '/extract') {
      if (req.method !== 'POST') return send(res, 405, { code: 'EXTRACT_METHOD_NOT_ALLOWED' });
      return void handle(req, res).catch(() => { if (!res.headersSent) send(res, 500, { code: 'EXTRACT_INTERNAL' }); });
    }
    send(res, 404, { code: 'EXTRACT_NOT_FOUND' });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 40_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => console.log(`[extract] prêt sur le port ${PORT} (concurrence ${MAX_CONCURRENCY})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

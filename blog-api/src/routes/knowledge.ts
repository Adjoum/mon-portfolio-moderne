// blog-api/src/routes/knowledge.ts
// Base de connaissances de l'assistant (Pinecone) — ADMINISTRATION UNIQUEMENT
//
// Toutes les routes   : adminLimiter → requireSupabaseAdmin (401 anonyme / 403 non admin)
// Ajout, téléversement, suppression : + requireAdminMfa (403 MFA_REQUIRED)
//                                     + KNOWLEDGE_WRITE_ENABLED=true (sinon 503)
//                                     + knowledgeWriteLimiter
// L'assistant public (routes/agent.ts) interroge Pinecone directement : il ne dépend pas de ces routes.
// Les journaux ne contiennent jamais le contenu indexé ni les requêtes de recherche.

import path from 'path';
import { Router, type Response, type NextFunction } from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { adminLimiter, knowledgeWriteLimiter } from '../middleware/rateLimit';
import {
  requireSupabaseAdmin,
  requireAdminMfa,
  type SupabaseAdminRequest,
} from '../middleware/supabaseAdmin';
import { auditLog, requestContext, type AuditEvent } from '../lib/audit';

const router = Router();

// ── Limites ─────────────────────────────────────────────────
const MAX_TEXT_CHARS      = 20_000;          // ajout de texte manuel
const MAX_FILE_BYTES      = 5 * 1024 * 1024; // fichier téléversé
const MAX_FILE_TEXT_CHARS = 100_000;         // texte extrait d'un fichier
const MAX_QUERY_CHARS     = 500;
const MAX_LABEL_CHARS     = 200;             // source, nom de fichier
const PARSE_TIMEOUT_MS    = 20_000;
const UPSERT_BATCH_SIZE   = 50;              // Pinecone : ≤ 96 enregistrements par appel

export const KNOWLEDGE_CATEGORIES = [
  'biographie', 'compétences', 'projets', 'formation',
  'contact', 'expérience', 'général', 'document',
];
const RECORD_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
});

// ── Pinecone (initialisé à la première utilisation) ─────────
let pinecone: Pinecone | null = null;

function getIndex() {
  const apiKey    = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;
  if (!apiKey || !indexName) throw new KnowledgeError(503, 'KNOWLEDGE_UNAVAILABLE', 'Base de connaissances non configurée');
  pinecone ??= new Pinecone({ apiKey });
  return pinecone.index({ name: indexName }) as any;
}

class KnowledgeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ── Garde : écritures activées explicitement ────────────────
function requireKnowledgeWrites(req: SupabaseAdminRequest, res: Response, next: NextFunction) {
  if (process.env.KNOWLEDGE_WRITE_ENABLED !== 'true') {
    audit(req, 'knowledge.write', 'denied', { reason: 'writes_disabled' });
    return res.status(503).json({
      error: 'La modification de la base de connaissances est désactivée sur le serveur',
      code:  'KNOWLEDGE_WRITE_DISABLED',
    });
  }
  next();
}

router.use(adminLimiter, requireSupabaseAdmin);
const writeGuards = [requireAdminMfa, requireKnowledgeWrites, knowledgeWriteLimiter];

// ── Helpers ─────────────────────────────────────────────────
function audit(
  req: SupabaseAdminRequest,
  action: string,
  outcome: AuditEvent['outcome'],
  details?: AuditEvent['details'],
  target?: string,
) {
  auditLog({
    action,
    outcome,
    actorType: 'supabase_admin',
    actorId:   req.supabaseAdmin?.userId,
    ...requestContext(req),
    target,
    details,
  });
}

/** Libellé court : texte, sans caractères de contrôle, longueur bornée. null si invalide */
function cleanLabel(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return null;
  const cleaned = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned.length > MAX_LABEL_CHARS) return null;
  return cleaned;
}

function cleanCategory(value: unknown, fallback: string): string | null {
  const category = cleanLabel(value, fallback);
  return category && KNOWLEDGE_CATEGORIES.includes(category) ? category : null;
}

function badRequest(res: Response, error: string, code = 'INVALID_INPUT') {
  return res.status(400).json({ error, code });
}

function chunkText(text: string, size = 500, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter(c => c.trim().length > 30);
}

async function upsertChunks(chunks: string[], idPrefix: string, fields: Record<string, string>) {
  const index   = getIndex();
  const stamp   = Date.now();
  const date    = new Date().toISOString();
  const records = chunks.map((text, i) => ({ id: `${idPrefix}_${stamp}_${i}`, text, date, ...fields }));

  for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
    await index.upsertRecords({ records: records.slice(i, i + UPSERT_BATCH_SIZE) });
  }
  return records.map(r => r.id);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new KnowledgeError(422, 'FILE_UNREADABLE', 'Lecture du fichier trop longue')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ── Type de fichier : extension + signature (magic bytes) ───
type FileKind = 'pdf' | 'docx' | 'text';

const GENERIC_MIME = ['', 'application/octet-stream'];
const ALLOWED_MIME: Record<FileKind, string[]> = {
  pdf:  ['application/pdf', ...GENERIC_MIME],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', ...GENERIC_MIME],
  text: ['text/plain', 'text/markdown', 'text/x-markdown', ...GENERIC_MIME],
};

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export function detectFileKind(filename: string, mime: string, buffer: Buffer): FileKind | null {
  const ext = path.extname(filename).toLowerCase();
  let kind: FileKind | null = null;

  if (ext === '.pdf' && buffer.subarray(0, 5).toString('latin1') === '%PDF-') kind = 'pdf';
  else if (ext === '.docx' && buffer.length > 4 && buffer.readUInt32BE(0) === 0x504b0304) kind = 'docx';
  else if (['.txt', '.md', '.markdown'].includes(ext) && isUtf8Text(buffer)) kind = 'text';

  if (!kind || !ALLOWED_MIME[kind].includes(mime.toLowerCase())) return null;
  return kind;
}

async function extractText(kind: FileKind, buffer: Buffer): Promise<string> {
  if (kind === 'text') return buffer.toString('utf-8').replace(/^﻿/, '');

  try {
    if (kind === 'pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        return (await withTimeout(parser.getText(), PARSE_TIMEOUT_MS)).text;
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    return (await withTimeout(mammoth.extractRawText({ buffer }), PARSE_TIMEOUT_MS)).value;
  } catch (err) {
    if (err instanceof KnowledgeError) throw err;
    throw new KnowledgeError(422, 'FILE_UNREADABLE', 'Fichier illisible ou corrompu');
  }
}

function sendError(req: SupabaseAdminRequest, res: Response, action: string, err: unknown) {
  if (err instanceof KnowledgeError) {
    if (err.status >= 500) console.error(`[KNOWLEDGE] ${action}: ${err.code}`);
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(`[KNOWLEDGE] ${action}:`, (err as Error)?.message);
  audit(req, action, 'failure', { reason: 'upstream_error' });
  return res.status(502).json({ error: 'Opération sur la base de connaissances échouée', code: 'KNOWLEDGE_UPSTREAM_ERROR' });
}

// ── GET /list ───────────────────────────────────────────────
router.get('/list', async (req: SupabaseAdminRequest, res) => {
  try {
    const index = getIndex();
    const stats = await index.describeIndexStats();

    // ✅ Avec integrated embedding → searchRecords au lieu de query
    const result = await index.searchRecords({
      query: {
        inputs: { text: 'développeur profil compétences projets' },
        topK: 100,
      },
      fields: ['text', 'source', 'category', 'date', 'filename'],
    });

    const entries = (result.result?.hits || []).map((m: any) => ({
      id:       m._id,
      text:     ((m.fields?.text as string) || '').slice(0, 200) + '...',
      source:   m.fields?.source   || 'manuel',
      category: m.fields?.category || 'général',
      date:     m.fields?.date     || '',
      score:    m._score,
    }));

    audit(req, 'knowledge.list', 'success', { entries: entries.length });
    res.json({ entries, totalVectors: stats.totalRecordCount });
  } catch (err) {
    sendError(req, res, 'knowledge.list', err);
  }
});

// ── POST /add-text ──────────────────────────────────────────
router.post('/add-text', ...writeGuards, async (req: SupabaseAdminRequest, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return badRequest(res, 'Texte requis');
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(413).json({ error: `Texte trop long (${MAX_TEXT_CHARS} caractères maximum)`, code: 'TEXT_TOO_LONG' });
  }
  const category = cleanCategory(req.body.category, 'général');
  const source   = cleanLabel(req.body.source, 'manuel');
  if (!category) return badRequest(res, 'Catégorie invalide', 'INVALID_CATEGORY');
  if (!source)   return badRequest(res, 'Source invalide', 'INVALID_SOURCE');

  try {
    const chunks = chunkText(text.normalize('NFC').trim());
    if (chunks.length === 0) return badRequest(res, 'Texte trop court pour être indexé', 'TEXT_TOO_SHORT');

    const ids = await upsertChunks(chunks, 'manual', { source, category });
    audit(req, 'knowledge.add_text', 'success', { chunks: ids.length, chars: text.length, category });
    res.json({ success: true, chunksIndexed: ids.length, ids });
  } catch (err) {
    sendError(req, res, 'knowledge.add_text', err);
  }
});

// ── POST /upload-file ───────────────────────────────────────
// multer n'est exécuté qu'après l'authentification : aucun fichier anonyme n'est lu
router.post('/upload-file', ...writeGuards, upload.single('file'), async (req: SupabaseAdminRequest, res) => {
  const file = req.file;
  if (!file) return badRequest(res, 'Fichier requis', 'FILE_REQUIRED');

  // win32.basename retire les chemins « / » et « \ » quel que soit l'OS du serveur
  const filename = cleanLabel(path.win32.basename(file.originalname || ''), '');
  const category = cleanCategory(req.body?.category, 'document');
  if (!filename) return badRequest(res, 'Nom de fichier invalide', 'INVALID_FILENAME');
  if (!category) return badRequest(res, 'Catégorie invalide', 'INVALID_CATEGORY');
  const source = cleanLabel(req.body?.source, filename);
  if (!source)   return badRequest(res, 'Source invalide', 'INVALID_SOURCE');

  const kind = detectFileKind(filename, file.mimetype || '', file.buffer);
  if (!kind) {
    audit(req, 'knowledge.upload_file', 'denied', { reason: 'unsupported_type', bytes: file.size });
    return res.status(415).json({
      error: 'Format non supporté ou contenu non conforme (PDF, DOCX, TXT, MD)',
      code:  'UNSUPPORTED_FILE_TYPE',
    });
  }

  try {
    const text = (await extractText(kind, file.buffer)).normalize('NFC');
    if (!text.trim()) throw new KnowledgeError(422, 'FILE_EMPTY', 'Fichier vide ou illisible');
    if (text.length > MAX_FILE_TEXT_CHARS) {
      throw new KnowledgeError(413, 'FILE_TEXT_TOO_LONG', `Document trop long (${MAX_FILE_TEXT_CHARS} caractères maximum)`);
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) throw new KnowledgeError(422, 'FILE_EMPTY', 'Fichier vide ou illisible');

    const ids = await upsertChunks(chunks, 'file', { source, category, filename });
    audit(req, 'knowledge.upload_file', 'success', { chunks: ids.length, kind, bytes: file.size, category, filename });
    res.json({ success: true, filename, chunksIndexed: ids.length });
  } catch (err) {
    if (err instanceof KnowledgeError) audit(req, 'knowledge.upload_file', 'failure', { reason: err.code, kind });
    sendError(req, res, 'knowledge.upload_file', err);
  }
});

// ── POST /search ────────────────────────────────────────────
// Test de recherche depuis la page admin (l'assistant public n'utilise pas cette route)
router.post('/search', async (req: SupabaseAdminRequest, res) => {
  const { query } = req.body ?? {};
  if (typeof query !== 'string' || !query.trim()) return badRequest(res, 'query requis');
  if (query.length > MAX_QUERY_CHARS) return badRequest(res, `Requête trop longue (${MAX_QUERY_CHARS} caractères maximum)`);

  try {
    const result = await getIndex().searchRecords({
      query: { inputs: { text: query.trim() }, topK: 5 },
      fields: ['text', 'source', 'category', 'date'],
    });
    const hits = result.result?.hits || [];

    audit(req, 'knowledge.search', 'success', { queryChars: query.length, hits: hits.length });
    res.json({
      results: hits.map((m: any) => ({
        id:       m._id,
        text:     m.fields?.text,
        source:   m.fields?.source,
        category: m.fields?.category,
        score:    m._score,
      })),
    });
  } catch (err) {
    sendError(req, res, 'knowledge.search', err);
  }
});


// ── DELETE /:id ─────────────────────────────────────────────
router.delete('/:id', ...writeGuards, async (req: SupabaseAdminRequest, res) => {
  const id = String(req.params.id ?? ''); // déjà décodé par Express
  if (!RECORD_ID_RE.test(id)) return badRequest(res, 'Identifiant invalide', 'INVALID_ID');

  try {
    // ✅ Selon la doc officielle JavaScript
    await getIndex().namespace('__default__').deleteOne({ id });

    audit(req, 'knowledge.delete', 'success', undefined, id);
    res.json({ success: true, deleted: id });
  } catch (err) {
    sendError(req, res, 'knowledge.delete', err);
  }
});

export default router;

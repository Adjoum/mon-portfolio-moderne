// blog-api/src/routes/adminCv.ts
// CV public du portfolio — opérations d'administration (lecture : rpc cv_active côté navigateur)
//   POST /api/admin/cv               téléverse et active une nouvelle version
//   POST /api/admin/cv/:id/restore   réactive une version archivée
//
// Admin vérifié + MFA (aal2) obligatoires. Aucune clé service_role : le jeton de
// l'administrateur est transmis à Supabase, où la RLS et les fonctions SQL revérifient
// ses droits. La version active ne change qu'à la fin, dans une transaction SQL : en cas
// d'échec, l'ancienne version reste active et le nouvel objet est retiré.

import crypto from 'crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import { adminLimiter, cvWriteLimiter } from '../middleware/rateLimit';
import {
  requireSupabaseAdmin,
  requireAdminMfa,
  bearerToken,
  getSupabaseConfig,
  type SupabaseAdminRequest,
  type SupabaseConfig,
} from '../middleware/supabaseAdmin';
import { auditLog, requestContext, type AuditEvent } from '../lib/audit';
import { validatePdf, PdfValidationError, MAX_PDF_BYTES } from '../lib/pdfValidation';

const router = Router();

const BUCKET = 'portfolio-public-documents';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMMUTABLE_CACHE = 'max-age=31536000';  // chemin unique par version : jamais réécrit
const TIMEOUT_MS = 30_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 2, fieldSize: 128, parts: 4 },
});

router.use(adminLimiter, requireSupabaseAdmin, requireAdminMfa);

class CvError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const NOT_READY = () => new CvError(503, 'CV_NOT_MIGRATED', 'La gestion du CV n’est pas encore activée sur la base de données');

function headers(cfg: SupabaseConfig, token: string, extra: Record<string, string> = {}) {
  return { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, ...extra };
}

function context(req: SupabaseAdminRequest) {
  const cfg = getSupabaseConfig();
  const token = bearerToken(req);
  if (!cfg || !token) throw new CvError(503, 'ADMIN_AUTH_NOT_CONFIGURED', 'Administration indisponible');
  return { cfg, token };
}

function audit(req: SupabaseAdminRequest, action: string, outcome: AuditEvent['outcome'], target?: string, details?: AuditEvent['details']) {
  auditLog({ action, outcome, actorType: 'supabase_admin', actorId: req.supabaseAdmin?.userId, ...requestContext(req), target, details });
}

async function rpc(cfg: SupabaseConfig, token: string, fn: string, args: object): Promise<any> {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method:  'POST',
    headers: headers(cfg, token, { 'Content-Type': 'application/json', Accept: 'application/json' }),
    body:    JSON.stringify(args),
    signal:  AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null) as { code?: string; message?: string } | null;
  if (res.ok) return body;

  if (res.status === 404 && body?.code === 'PGRST202') throw NOT_READY();
  if (res.status === 409 || body?.message === 'cv_conflict') {
    throw new CvError(409, 'CV_CONFLICT', 'Le CV actif a changé entre-temps. Rechargez la page puis réessayez.');
  }
  if (body?.message === 'cv_version_not_found') throw new CvError(404, 'CV_VERSION_NOT_FOUND', 'Version introuvable');
  if (body?.message === 'cv_object_missing') throw new CvError(409, 'CV_OBJECT_MISSING', 'Le fichier de cette version est introuvable');
  if (res.status === 401 || res.status === 403) throw new CvError(403, 'FORBIDDEN', 'Opération refusée par la base de données');
  console.error(`[CV] rpc ${fn} : HTTP ${res.status} ${body?.code ?? ''}`);
  throw new CvError(502, 'CV_STORAGE_ERROR', 'Enregistrement du CV impossible. La version active est inchangée.');
}

async function uploadObject(cfg: SupabaseConfig, token: string, path: string, buffer: Buffer) {
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method:  'POST',
    headers: headers(cfg, token, {
      'Content-Type':  'application/pdf',
      'Cache-Control': IMMUTABLE_CACHE,
      'x-upsert':      'false',
    }),
    body:   new Uint8Array(buffer),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error(`[CV] téléversement : HTTP ${res.status}`);
    throw new CvError(502, 'CV_STORAGE_ERROR', 'Téléversement du fichier impossible. La version active est inchangée.');
  }
}

/** Compensation : retire l'objet non référencé. Un objet référencé est protégé par la RLS. */
async function removeOrphan(req: SupabaseAdminRequest, cfg: SupabaseConfig, token: string, path: string) {
  const ok = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method:  'DELETE',
    headers: headers(cfg, token),
    signal:  AbortSignal.timeout(TIMEOUT_MS),
  }).then(r => r.ok).catch(() => false);
  // À nettoyer à la main si besoin : l'objet n'est référencé par aucune version active
  if (!ok) audit(req, 'cv.orphan_object', 'failure', path);
}

function sendError(req: SupabaseAdminRequest, res: Response, action: string, err: unknown) {
  if (err instanceof PdfValidationError) {
    audit(req, action, 'denied', undefined, { reason: err.code });
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof CvError) {
    audit(req, action, 'failure', undefined, { reason: err.code });
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(`[CV] ${action} :`, (err as Error)?.name);
  audit(req, action, 'failure', undefined, { reason: 'unexpected' });
  return res.status(502).json({ error: 'Opération impossible. La version active est inchangée.', code: 'CV_STORAGE_ERROR' });
}

function parseExpectedActive(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new CvError(400, 'CV_INVALID_INPUT', 'Version attendue invalide');
  return value;
}

// ── POST /api/admin/cv ──────────────────────────────────────
router.post('/', cvWriteLimiter, upload.single('file'), async (req: SupabaseAdminRequest, res) => {
  try {
    const file = req.file;
    if (!file) throw new CvError(400, 'CV_FILE_REQUIRED', 'Fichier PDF requis');
    const expectedActive = parseExpectedActive(req.body?.expectedActive);
    const { cfg, token } = context(req);

    await validatePdf(file.buffer);
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const active = await rpc(cfg, token, 'cv_active', {}) as { sha256?: string }[];
    if (active?.[0]?.sha256 === sha256) throw new CvError(409, 'CV_ALREADY_ACTIVE', 'Ce fichier est déjà le CV actif');

    // Chemin unique : une version n'écrase jamais la précédente
    const id = crypto.randomUUID();
    const path = `cv/versions/${id}.pdf`;
    await uploadObject(cfg, token, path, file.buffer);

    let published;
    try {
      published = await rpc(cfg, token, 'cv_publish_version', {
        p_id:                id,
        p_storage_path:      path,
        p_size_bytes:        file.size,
        p_sha256:            sha256,
        p_original_filename: (file.originalname || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || null,
        p_expected_active:   expectedActive,
      }) as unknown[];
    } catch (err) {
      await removeOrphan(req, cfg, token, path);
      throw err;
    }

    audit(req, 'cv.publish', 'success', id, { bytes: file.size, sha256 });
    res.status(201).json({ version: published?.[0] ?? null });
  } catch (err) {
    sendError(req, res, 'cv.publish', err);
  }
});

// ── POST /api/admin/cv/:id/restore ──────────────────────────
router.post('/:id/restore', cvWriteLimiter, async (req: SupabaseAdminRequest, res) => {
  try {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) throw new CvError(400, 'CV_INVALID_INPUT', 'Identifiant invalide');
    const expectedActive = parseExpectedActive(req.body?.expectedActive);
    const { cfg, token } = context(req);

    const restored = await rpc(cfg, token, 'cv_restore_version', { p_id: id, p_expected_active: expectedActive }) as unknown[];
    audit(req, 'cv.restore', 'success', id);
    res.json({ version: restored?.[0] ?? null });
  } catch (err) {
    sendError(req, res, 'cv.restore', err);
  }
});

export default router;

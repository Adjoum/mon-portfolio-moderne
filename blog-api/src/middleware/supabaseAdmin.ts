// blog-api/src/middleware/supabaseAdmin.ts
// Contrôle d'accès administrateur basé sur Supabase Auth (dashboard /admin)
//
// requireSupabaseAdmin :
//   1. jeton d'accès Supabase lu uniquement dans l'en-tête Authorization: Bearer
//      (jamais de rôle lu dans le corps, la query ou un en-tête personnalisé)
//   2. signature, émetteur, audience et expiration vérifiés localement :
//      JWKS du projet (ES256 / RS256) ou SUPABASE_JWT_SECRET (projets HS256)
//   3. appartenance à admin_users vérifiée par Supabase lui-même (rpc is_portfolio_admin)
//      avec le jeton de l'utilisateur : PostgREST revalide la signature, aucune clé
//      service_role n'est nécessaire sur le serveur
//   4. toute indisponibilité ou configuration absente → refus (fail closed)
// requireAdminMfa : session aal2 (TOTP validé) exigée pour les opérations sensibles

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import { auditLog, requestContext } from '../lib/audit';

// ── Types ─────────────────────────────────────────────────────
export interface SupabaseAdminRequest extends Request {
  supabaseAdmin?: {
    userId: string;
    aal:    'aal1' | 'aal2';
  };
}

interface SupabaseClaims {
  sub?:          string;
  role?:         string;
  aal?:          string;
  exp?:          number;
  iss?:          string;
  aud?:          string | string[];
  is_anonymous?: boolean;
}

interface SupabaseConfig {
  url:       string;
  anonKey:   string;
  jwtSecret: string | undefined;
  issuer:    string;
}

class AdminAuthError extends Error {
  constructor(
    public status: 401 | 403 | 503,
    public code: string,
    public reason: string,
  ) {
    super(reason);
  }
}

const JWKS_TTL_MS          = 10 * 60 * 1000; // rafraîchissement normal des clés publiques
const JWKS_MIN_REFRESH_MS  = 30 * 1000;      // kid inconnu : au plus un rafraîchissement / 30 s
const ADMIN_CACHE_TTL_MS   = 60 * 1000;      // retrait d'un admin pris en compte en ≤ 60 s
const ADMIN_CACHE_MAX      = 500;
const UPSTREAM_TIMEOUT_MS  = 4000;
const MAX_TOKEN_LENGTH     = 8192;
const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED:               'Authentification administrateur requise',
  INVALID_TOKEN:              'Session invalide ou expirée. Reconnectez-vous.',
  FORBIDDEN:                  'Accès réservé aux administrateurs',
  MFA_REQUIRED:               'Validation par double authentification (MFA) requise pour cette opération',
  ADMIN_AUTH_UNAVAILABLE:     'Vérification des droits momentanément indisponible',
  ADMIN_AUTH_NOT_CONFIGURED:  'Administration indisponible : authentification non configurée sur le serveur',
};

// ── Configuration (lue à chaque requête : aucune valeur figée au démarrage) ──
function getConfig(): SupabaseConfig | null {
  const url     = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocal) return null;

  return {
    url,
    anonKey,
    jwtSecret: process.env.SUPABASE_JWT_SECRET?.trim() || undefined,
    issuer:    `${url}/auth/v1`,
  };
}

// ── JWKS (clés publiques de signature du projet) ──────────────
type SigningAlg = 'ES256' | 'RS256';
let jwksCache: { url: string; fetchedAt: number; keys: Map<string, { alg: SigningAlg; key: crypto.KeyObject }> } | null = null;

interface Jwk { kty?: string; crv?: string; alg?: string; kid?: string; use?: string; [param: string]: unknown }

function jwkAlg(jwk: Jwk): SigningAlg | null {
  if (jwk.alg === 'ES256' || (!jwk.alg && jwk.kty === 'EC' && jwk.crv === 'P-256')) return 'ES256';
  if (jwk.alg === 'RS256' || (!jwk.alg && jwk.kty === 'RSA')) return 'RS256';
  return null;
}

async function fetchJwks(cfg: SupabaseConfig) {
  const res = await fetch(`${cfg.url}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: cfg.anonKey, Accept: 'application/json' },
    signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);

  const body = await res.json() as { keys?: Jwk[] };
  const keys = new Map<string, { alg: SigningAlg; key: crypto.KeyObject }>();
  for (const jwk of body.keys ?? []) {
    const alg = jwkAlg(jwk);
    if (!jwk.kid || !alg || (jwk.use && jwk.use !== 'sig')) continue;
    try {
      keys.set(jwk.kid, { alg, key: crypto.createPublicKey({ key: jwk as any, format: 'jwk' }) });
    } catch {
      // clé illisible : ignorée
    }
  }
  return { url: cfg.url, fetchedAt: Date.now(), keys };
}

async function getSigningKey(cfg: SupabaseConfig, kid: string, alg: SigningAlg): Promise<crypto.KeyObject | null> {
  const now   = Date.now();
  let cache   = jwksCache?.url === cfg.url ? jwksCache : null;
  const stale = !cache || now - cache.fetchedAt > JWKS_TTL_MS;
  const unknownKid = !!cache && !cache.keys.has(kid) && now - cache.fetchedAt > JWKS_MIN_REFRESH_MS;

  if (stale || unknownKid) {
    try {
      cache = jwksCache = await fetchJwks(cfg);
    } catch (err) {
      console.error('[ADMIN_AUTH] JWKS indisponible:', (err as Error).message);
      if (!cache) throw new AdminAuthError(503, 'ADMIN_AUTH_UNAVAILABLE', 'jwks_unavailable');
    }
  }

  const entry = cache!.keys.get(kid);
  return entry && entry.alg === alg ? entry.key : null;
}

// ── Vérification du jeton ─────────────────────────────────────
function checkUnverifiedClaims(cfg: SupabaseConfig, claims: SupabaseClaims) {
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (typeof claims.exp !== 'number' || claims.exp + 5 < now) throw new AdminAuthError(401, 'INVALID_TOKEN', 'token_expired');
  if (claims.iss !== cfg.issuer)        throw new AdminAuthError(401, 'INVALID_TOKEN', 'bad_issuer');
  if (!aud.includes('authenticated'))   throw new AdminAuthError(401, 'INVALID_TOKEN', 'bad_audience');
}

async function verifyAccessToken(
  cfg: SupabaseConfig,
  token: string
): Promise<{ claims: SupabaseClaims; verifiedLocally: boolean }> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded.payload === 'string') {
    throw new AdminAuthError(401, 'INVALID_TOKEN', 'malformed_token');
  }

  const { alg, kid } = decoded.header;
  const options: jwt.VerifyOptions = { issuer: cfg.issuer, audience: 'authenticated', clockTolerance: 5 };
  let claims: SupabaseClaims;
  let verifiedLocally = true;

  try {
    if (alg === 'ES256' || alg === 'RS256') {
      if (!kid) throw new AdminAuthError(401, 'INVALID_TOKEN', 'missing_kid');
      const key = await getSigningKey(cfg, kid, alg);
      if (!key) throw new AdminAuthError(401, 'INVALID_TOKEN', 'unknown_signing_key');
      claims = jwt.verify(token, key, { ...options, algorithms: [alg] }) as SupabaseClaims;
    } else if (alg === 'HS256') {
      if (cfg.jwtSecret) {
        claims = jwt.verify(token, cfg.jwtSecret, { ...options, algorithms: ['HS256'] }) as SupabaseClaims;
      } else {
        // Projet à secret partagé sans SUPABASE_JWT_SECRET : la signature est validée
        // par Supabase lors de l'appel rpc is_portfolio_admin (cache indexé par jeton)
        claims = decoded.payload as SupabaseClaims;
        checkUnverifiedClaims(cfg, claims);
        verifiedLocally = false;
      }
    } else {
      throw new AdminAuthError(401, 'INVALID_TOKEN', 'unsupported_alg');
    }
  } catch (err) {
    if (err instanceof AdminAuthError) throw err;
    throw new AdminAuthError(401, 'INVALID_TOKEN', 'bad_signature_or_claims');
  }

  if (claims.role !== 'authenticated' || claims.is_anonymous === true) {
    throw new AdminAuthError(401, 'INVALID_TOKEN', 'not_an_authenticated_user');
  }
  if (typeof claims.sub !== 'string' || !UUID_RE.test(claims.sub)) {
    throw new AdminAuthError(401, 'INVALID_TOKEN', 'bad_subject');
  }
  return { claims, verifiedLocally };
}

// ── Appartenance à admin_users (vérifiée par Supabase) ────────
const adminCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();

async function isPortfolioAdmin(cfg: SupabaseConfig, token: string, exp: number): Promise<boolean> {
  // Indexé par empreinte du jeton complet : un jeton forgé avec le sub d'un admin
  // ne peut jamais profiter du résultat mis en cache pour le vrai jeton.
  const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
  const now      = Date.now();
  const hit      = adminCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.isAdmin;

  const res = await fetch(`${cfg.url}/rest/v1/rpc/is_portfolio_admin`, {
    method:  'POST',
    headers: {
      apikey:         cfg.anonKey,
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body:   '{}',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }).catch((err: Error) => {
    console.error('[ADMIN_AUTH] rpc is_portfolio_admin injoignable:', err.message);
    throw new AdminAuthError(503, 'ADMIN_AUTH_UNAVAILABLE', 'admin_check_unreachable');
  });

  if (res.status === 401 || res.status === 403) {
    throw new AdminAuthError(401, 'INVALID_TOKEN', 'rejected_by_supabase');
  }
  if (!res.ok) {
    console.error(`[ADMIN_AUTH] rpc is_portfolio_admin HTTP ${res.status}`);
    throw new AdminAuthError(503, 'ADMIN_AUTH_UNAVAILABLE', `admin_check_http_${res.status}`);
  }

  const isAdmin = (await res.json().catch(() => null)) === true;

  if (adminCache.size >= ADMIN_CACHE_MAX) {
    for (const [key, value] of adminCache) if (value.expiresAt <= now) adminCache.delete(key);
    if (adminCache.size >= ADMIN_CACHE_MAX) adminCache.clear();
  }
  adminCache.set(cacheKey, { isAdmin, expiresAt: Math.min(now + ADMIN_CACHE_TTL_MS, exp * 1000) });
  return isAdmin;
}

// ── Réponses ──────────────────────────────────────────────────
function deny(
  req: Request,
  res: Response,
  status: number,
  code: string,
  reason: string,
  actorId?: string,  // uniquement un identifiant dont la signature a été vérifiée
) {
  auditLog({
    action:    'admin.access',
    outcome:   'denied',
    actorType: actorId ? 'supabase_user' : 'anonymous',
    actorId,
    ...requestContext(req),
    details:   { status, code, reason },
  });
  res.status(status).json({ error: MESSAGES[code] ?? MESSAGES.FORBIDDEN, code });
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || token.length > MAX_TOKEN_LENGTH || !TOKEN_RE.test(token)) return null;
  return token;
}

// ── Middleware : administrateur du portfolio ──────────────────
export const requireSupabaseAdmin = async (
  req: SupabaseAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractBearer(req);
  if (!token) return deny(req, res, 401, 'UNAUTHORIZED', 'missing_or_malformed_token');

  const cfg = getConfig();
  if (!cfg) {
    console.error('[ADMIN_AUTH] SUPABASE_URL / SUPABASE_ANON_KEY absents ou invalides : accès admin refusé');
    return deny(req, res, 503, 'ADMIN_AUTH_NOT_CONFIGURED', 'not_configured');
  }

  let sub: string | undefined;
  try {
    const { claims, verifiedLocally } = await verifyAccessToken(cfg, token);
    if (verifiedLocally) sub = claims.sub;

    const isAdmin = await isPortfolioAdmin(cfg, token, claims.exp!);
    sub = claims.sub; // jeton accepté par Supabase : identifiant fiable
    if (!isAdmin) {
      return deny(req, res, 403, 'FORBIDDEN', 'not_in_admin_users', sub);
    }

    req.supabaseAdmin = { userId: claims.sub!, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    next();
  } catch (err) {
    if (err instanceof AdminAuthError) return deny(req, res, err.status, err.code, err.reason, sub);
    console.error('[ADMIN_AUTH] Erreur inattendue:', (err as Error).message);
    return deny(req, res, 503, 'ADMIN_AUTH_UNAVAILABLE', 'unexpected_error', sub);
  }
};

// ── Middleware : MFA (aal2) pour les opérations sensibles ─────
// À placer après requireSupabaseAdmin
export const requireAdminMfa = (
  req: SupabaseAdminRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.supabaseAdmin) return deny(req, res, 401, 'UNAUTHORIZED', 'admin_context_missing');
  if (req.supabaseAdmin.aal !== 'aal2') {
    return deny(req, res, 403, 'MFA_REQUIRED', 'aal1_session', req.supabaseAdmin.userId);
  }
  next();
};

/** Tests uniquement : vide les caches JWKS et admin */
export function resetSupabaseAdminCaches(): void {
  jwksCache = null;
  adminCache.clear();
}

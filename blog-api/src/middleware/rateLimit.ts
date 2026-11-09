// blog-api/src/middleware/rateLimit.ts
// Protection contre le spam et les abus
// Implémentation manuelle légère + express-rate-limit

import { type Request, type Response, type NextFunction } from 'express';
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { AuthRequest } from './auth';
import type { SupabaseAdminRequest } from './supabaseAdmin';

// ─────────────────────────────────────────────────────────────
// INSTALLATION :  npm install express-rate-limit
// ─────────────────────────────────────────────────────────────

// ── Formater l'erreur de rate limit ──────────────────────────
const rateLimitHandler = (req: Request, res: Response) => {
  res.status(429).json({
    error: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
    code:  'RATE_LIMIT_EXCEEDED',
    retryAfter: res.getHeader('Retry-After'),
  });
};

// ── 1. Limite globale — toutes les routes API ─────────────────
// 200 requêtes par 15 minutes par IP
export const globalLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              200,
  standardHeaders:  true,            // retourne Retry-After dans les headers
  legacyHeaders:    false,
  handler:          rateLimitHandler,
  skip: (req) => req.method === 'GET' && process.env.NODE_ENV === 'production',
});

// ── 2. Limite auth — login / register ────────────────────────
// 5 tentatives par 15 minutes par IP (anti bruteforce)
export const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         (req, res) => {
    res.status(429).json({
      error:      'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
      code:       'AUTH_RATE_LIMIT',
      retryAfter: 900, // secondes
    });
  },
  skipSuccessfulRequests: true, // ne compte pas les connexions réussies
});

// ── 3. Commentaires : lecture et écritures séparées ──────────
// Lecture (GET, HEAD) : la page d'un article charge ses commentaires une fois. Les lectures ne
// consomment plus le quota anti-spam des écritures : un visiteur qui ouvrait plus de 10 articles
// dans l'heure ne voyait plus aucun commentaire (429).
const isCommentRead = (req: Request) => req.method === 'GET' || req.method === 'HEAD';

// 3a. Écritures publiques — anti-spam : 10 par heure par compte du blog, sinon par IP.
// Monté route par route (src/routes/comments.ts) : création et réponse, modification ou suppression
// de SON commentaire. Ni les réactions (4), ni la modération par un administrateur Supabase + MFA
// (adminLimiter, session, audit : src/middleware/blogAdmin.ts) ne le consomment.
export const commentWriteLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 heure
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            isCommentRead,
  handler:         (req, res) => {
    res.status(429).json({
      error:      'Vous avez posté trop de commentaires. Attendez 1h.',
      code:       'COMMENT_RATE_LIMIT',
      retryAfter: 3600,
    });
  },
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    if (authReq.user?._id) return authReq.user._id;
    // ipKeyGenerator attend une string (req.ip), pas req lui-même
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
});

// 3b. Lecture publique — anti-surcharge, compteur indépendant : 300 par 15 minutes par IP.
// Chaque lecture = une requête indexée (articleId) + les auteurs. 300 / 15 min laisse lire des
// dizaines d'articles à plusieurs visiteurs derrière une même adresse (opérateur mobile, bureau),
// et borne un client isolé à une lecture toutes les 3 s en moyenne. Le limiteur global ne compte
// aucun GET en production : sans celui-ci, les lectures ne seraient pas bornées du tout.
export const commentReadLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             Number(process.env.COMMENT_READ_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            (req) => !isCommentRead(req),
  handler:         rateLimitHandler,
  keyGenerator:    (req) => ipKeyGenerator(req.ip ?? '127.0.0.1'),
});

// ── 4. Réactions aux commentaires — compteur propre ──────────
// 30 par 10 minutes, par compte du blog si connecté, sinon par IP (l'identifiant de session est
// choisi par le client : jamais une clé). Une réaction ajoute une entrée au commentaire : 30 / 10 min
// laisse réagir et se raviser sans retenue, et borne une adresse à 180 écritures par heure.
// Indépendant du quota des commentaires : réagir n'empêche plus de commenter.
export const reactionLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  max:             Number(process.env.REACTION_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         (req, res) => {
    res.status(429).json({
      error:      'Trop de réactions. Patientez quelques minutes.',
      code:       'REACTION_RATE_LIMIT',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    if (authReq.user?._id) return `user:${authReq.user._id}`;
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
});

// ── 5. Limite upload — images ─────────────────────────────────
// 20 uploads par heure par user (admin seulement de toute façon)
export const uploadLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         (req, res) => {
    res.status(429).json({
      error: '20 uploads maximum par heure.',
      code:  'UPLOAD_RATE_LIMIT',
    });
  },
});

// ── 6. Limite recherche — anti-scraping ──────────────────────
// 30 recherches par minute par IP
export const searchLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── 6b. Limite administration — appliquée AVANT l'authentification ──
// 100 requêtes par 15 minutes par IP (anti force brute / énumération)
export const adminLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             Number(process.env.ADMIN_RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── 6c. Limite écriture base de connaissances ─────────────────
// 30 ajouts / téléversements / suppressions par heure par administrateur
export const knowledgeWriteLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             Number(process.env.KNOWLEDGE_WRITE_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
  keyGenerator: (req) => {
    const adminReq = req as SupabaseAdminRequest;
    if (adminReq.supabaseAdmin?.userId) return `admin:${adminReq.supabaseAdmin.userId}`;
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
});

// ── 6c bis. Limite remplacement du CV public ──────────────────
// 10 téléversements ou restaurations par heure par administrateur
export const cvWriteLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             Number(process.env.CV_WRITE_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
  keyGenerator: (req) => {
    const adminReq = req as SupabaseAdminRequest;
    if (adminReq.supabaseAdmin?.userId) return `admin:${adminReq.supabaseAdmin.userId}`;
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
});

// ── 6d. Limite passerelle IA — par IP et par minute ───────────
// Complète les quotas journaliers et la concurrence de src/ai/services/quotas.ts
export const aiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 6,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── 6d bis. Écritures du centre IA — par administrateur ───────
// Y compris les tests de compatibilité, potentiellement facturés
export const aiAdminWriteLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             Number(process.env.AI_ADMIN_WRITE_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
  keyGenerator: (req) => {
    const adminReq = req as SupabaseAdminRequest;
    if (adminReq.supabaseAdmin?.userId) return `admin:${adminReq.supabaseAdmin.userId}`;
    return ipKeyGenerator(req.ip ?? '127.0.0.1');
  },
});

// ── 6e. Limite par fonctionnalité IA — par IP et par minute ───
// Limite lue à chaque requête : modifiable depuis le dashboard, sans redémarrage.
// AI_RATE_LIMIT_PER_MINUTE remplace toutes les valeurs enregistrées.
const aiFeatureLimiters = new Map<string, RateLimitRequestHandler>();

export function aiFeatureLimiter(featureId: string, perMinute: () => number): RateLimitRequestHandler {
  let limiter = aiFeatureLimiters.get(featureId);
  if (!limiter) {
    limiter = rateLimit({
      windowMs:        60 * 1000,
      limit:           () => Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || perMinute(),
      standardHeaders: true,
      legacyHeaders:   false,
      handler:         rateLimitHandler,
    });
    aiFeatureLimiters.set(featureId, limiter);
  }
  return limiter;
}

// ── 6f. Compilation LaTeX (service latex-runner) — par IP ─────
// 60 compilations par 10 minutes : l'éditeur compile 3 s après la dernière frappe, et jamais deux fois
// le même source. Quotas journaliers et concurrence : src/latex/compile.ts
export const latexCompileLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  limit:           () => Number(process.env.LATEX_COMPILE_PER_10MIN) || 60,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── 6g. Import de CV (service cv-extractor) — par IP ──────────
// 20 fichiers par 10 minutes ; quotas journaliers et concurrence : src/latex/import.ts
export const cvImportLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,
  limit:           () => Number(process.env.CV_IMPORT_PER_10MIN) || 20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

// ── 7. Middleware de validation du contenu ────────────────────
// Rejeter les commentaires trop courts ou trop longs
// et détecter les patterns de spam basiques
const SPAM_PATTERNS = [
  /https?:\/\/.+https?:\/\/.+https?:\/\//i, // 3+ liens = spam probable
  /\b(casino|viagra|crypto|forex|bitcoin).{0,20}(click|buy|win|earn)\b/i,
  /(.)\1{20,}/,                               // 20+ caractères répétés
];

export const validateComment = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Contenu requis', code: 'INVALID_CONTENT' });
    return;
  }

  const trimmed = content.trim();

  if (trimmed.length < 3) {
    res.status(400).json({ error: 'Commentaire trop court (min 3 caractères)', code: 'TOO_SHORT' });
    return;
  }

  if (trimmed.length > 2000) {
    res.status(400).json({ error: 'Commentaire trop long (max 2000 caractères)', code: 'TOO_LONG' });
    return;
  }

  // Détection spam basique
  const isSpam = SPAM_PATTERNS.some(p => p.test(trimmed));
  if (isSpam) {
    res.status(400).json({ error: 'Commentaire détecté comme spam', code: 'SPAM_DETECTED' });
    return;
  }

  // Sanitiser le contenu (supprimer les balises HTML)
  req.body.content = trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');

  next();
};

// ── 8. Logger des abus (optionnel) ───────────────────────────
// Loguer les IPs qui dépassent les limites pour monitoring
export const abuseLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.on('finish', () => {
    if (res.statusCode === 429) {
      console.warn(`[RATE_LIMIT] ${new Date().toISOString()} | IP: ${req.ip} | Route: ${req.method} ${req.path}`);
      // En prod : envoyer vers un service de monitoring (Sentry, Datadog, etc.)
    }
  });
  next();
};
// blog-api/src/middleware/rateLimit.ts
// Protection contre le spam et les abus
// Implémentation manuelle légère + express-rate-limit

import { type Request, type Response, type NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { AuthRequest } from './auth';

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

// ── 3. Limite commentaires — anti-spam ───────────────────────
// 10 commentaires par heure par IP
export const commentLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 heure
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
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

// ── 4. Limite réactions — anti-spam emoji ────────────────────
// 60 réactions par minute par IP/session
export const reactionLimiter = rateLimit({
  windowMs:        60 * 1000, // 1 minute
  max:             60,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
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
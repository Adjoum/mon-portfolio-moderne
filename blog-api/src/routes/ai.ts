// blog-api/src/routes/ai.ts
// Passerelle IA publique
//   GET  /api/ai/features            → disponibilité de chaque fonctionnalité (sans fournisseur ni modèle)
//   POST /api/ai/run/:featureId      → { input } → { content, requestId }
// Les URL historiques (/api/agent/chat, /api/groq/*) réutilisent featureLimiter et respondWithFeature.
// Le corps est limité par app.ts (256 Ko ; 6 Mo pour cv.import.ocr).
// Erreurs : { error, code, requestId } — jamais de message de fournisseur ni de détail interne.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { aiFeatureLimiter, aiLimiter } from '../middleware/rateLimit';
import { requireSupabaseAdmin, type SupabaseAdminRequest } from '../middleware/supabaseAdmin';
import { AiError, newRequestId, type AiGateway } from '../ai/services/gateway';

const MESSAGES: Record<string, string> = {
  AI_FEATURE_UNKNOWN:     'Fonctionnalité IA inconnue.',
  AI_FEATURE_DISABLED:    'Cette fonctionnalité IA est momentanément désactivée.',
  AI_FEATURE_UNAVAILABLE: 'Cette fonctionnalité IA est momentanément indisponible.',
  AI_INVALID_INPUT:       'Données invalides.',
  AI_FORBIDDEN_FIELD:     'Paramètre non autorisé dans la requête.',
  AI_QUOTA_EXCEEDED:      'Limite d’utilisation atteinte pour aujourd’hui. Réessayez demain.',
  AI_BUDGET_EXCEEDED:     'Cette fonctionnalité IA a atteint sa limite d’utilisation. Réessayez plus tard.',
  AI_BUSY:                'Le service IA est très sollicité. Réessayez dans un instant.',
  AI_TIMEOUT:             'Le service IA n’a pas répondu à temps. Réessayez.',
  AI_REQUEST_REJECTED:    'La demande n’a pas pu être traitée (contenu trop long ou non conforme).',
  AI_CONTENT_FILTERED:    'La demande a été refusée par le filtre de contenu.',
  AI_PROVIDER_ERROR:      'Le service IA a rencontré une erreur. Réessayez plus tard.',
  AI_ABORTED:             'Requête annulée.',
  SERVER_ERROR:           'Erreur serveur.',
};

function sendError(res: Response, requestId: string, err: AiError) {
  if (err.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec));
  const body: Record<string, string> = { error: MESSAGES[err.code] ?? MESSAGES.SERVER_ERROR, code: err.code, requestId };
  if (err.field) body.field = err.field;
  res.status(err.status).json(body);
}

/** Limiteur par minute propre à une fonctionnalité */
export function featureLimiter(gateway: AiGateway, featureId: string) {
  const feature = gateway.feature(featureId);
  return feature ? aiFeatureLimiter(feature.id, () => gateway.perMinute(feature.id)) : aiLimiter;
}

function subjectOf(req: SupabaseAdminRequest): string {
  return req.supabaseAdmin?.userId ? `user:${req.supabaseAdmin.userId}` : `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
}

/**
 * Exécute une fonctionnalité avec un corps déjà au format de la passerelle ({ input }),
 * puis met le résultat au format attendu par le client appelant.
 */
async function execute(
  gateway: AiGateway,
  featureId: string,
  body: unknown,
  req: SupabaseAdminRequest,
  res: Response,
  format: (content: string, requestId: string) => unknown,
) {
  const requestId = newRequestId();
  res.setHeader('Cache-Control', 'no-store');

  // Annulation de l'appel au fournisseur si le visiteur se déconnecte
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    const { content } = await gateway.run(featureId, body, { subject: subjectOf(req), signal: controller.signal, requestId });
    res.json(format(content, requestId));
  } catch (err) {
    if (err instanceof AiError) return sendError(res, requestId, err);
    console.error(`[AI] ${requestId} erreur inattendue:`, (err as Error)?.message);
    sendError(res, requestId, new AiError(500, 'SERVER_ERROR'));
  }
}

/** URL historique : le corps de la requête est l'entrée de la fonctionnalité */
export function respondWithFeature(
  gateway: AiGateway,
  featureId: string,
  req: Request,
  res: Response,
  format: (content: string) => unknown,
) {
  return execute(gateway, featureId, { input: req.body }, req, res, format);
}

export function createAiRouter(gateway: AiGateway) {
  const router = Router();

  router.get('/features', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ features: await gateway.availability() });
  });

  // Niveau d'authentification défini par le registre (jamais par le client)
  const authForFeature = (req: Request, res: Response, next: NextFunction) => {
    const feature = gateway.feature(String(req.params.featureId));
    if (feature?.authLevel === 'admin') return requireSupabaseAdmin(req, res, next);
    next();
  };

  // Limiteurs créés au démarrage : express-rate-limit refuse une création pendant une requête
  const limiters = new Map(gateway.features().map(f => [f.id, aiFeatureLimiter(f.id, () => gateway.perMinute(f.id))]));
  const limitForFeature = (req: Request, res: Response, next: NextFunction) =>
    (limiters.get(String(req.params.featureId)) ?? aiLimiter)(req, res, next);

  router.post('/run/:featureId', limitForFeature, authForFeature, (req: SupabaseAdminRequest, res) =>
    execute(gateway, String(req.params.featureId), req.body, req, res, (content, requestId) => ({ content, requestId })));

  return router;
}

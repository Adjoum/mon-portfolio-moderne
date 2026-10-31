// blog-api/src/routes/cv.ts
// POST /api/cv/compile — compilation LaTeX → PDF de l'éditeur LaTeX
//
// L'ancienne implémentation (retirée en P0.A1, faille S2) exécutait latexmk dans CE processus,
// qui détient tous les secrets du serveur. Elle ne revient pas : aucun processus TeX n'est lancé
// ici, quel que soit l'environnement. La compilation est déléguée au service isolé latex-runner
// (sans secret, sans réseau, ressources bornées), uniquement si LATEX_RUNNER_URL est configurée ;
// sinon la route répond 503 comme depuis P0.A1.
//
// Public comme latex.generate, protégé par : 60 compilations par IP sur 10 minutes, 300 par IP et
// 5 000 au total par jour, 2 simultanées (1 par visiteur), source ≤ 200 Ko, photo JPEG ≤ 2 Mo.

import { Router, type Request, type Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { latexCompileLimiter } from '../middleware/rateLimit';
import {
  createLatexCompiler, latexConfigFromEnv, parseCompileBody, LatexCompileError,
  type LatexCompiler,
} from '../latex/compile';

const DISABLED_MESSAGE = 'La compilation PDF est momentanément indisponible. Téléchargez le fichier .tex pour le compiler (par exemple sur Overleaf).';

const MESSAGES: Record<string, (e: LatexCompileError) => string> = {
  LATEX_INVALID_REQUEST:     () => 'Requête de compilation invalide.',
  LATEX_EMPTY_SOURCE:        () => 'Le code LaTeX est vide.',
  LATEX_TOO_LARGE:           () => 'Le document dépasse la taille maximale autorisée (200 Ko).',
  LATEX_INVALID_PHOTO:       () => 'Photo invalide : seul le format JPEG est accepté.',
  LATEX_PHOTO_TOO_LARGE:     () => 'Photo trop volumineuse (2 Mo au maximum).',
  LATEX_FORBIDDEN_COMMAND:   e => `Commande non autorisée dans l’éditeur en ligne : ${e.extra.subject ?? 'inconnue'}. Elle donne accès aux fichiers ou au système.`,
  LATEX_PACKAGE_NOT_ALLOWED: e => `Paquet LaTeX non disponible dans l’éditeur en ligne : ${e.extra.subject ?? 'inconnu'}.`,
  LATEX_CLASS_NOT_ALLOWED:   e => `Classe de document non disponible : ${e.extra.subject ?? 'inconnue'}. Utilisez \\documentclass{article}.`,
  LATEX_INVALID_SOURCE:      () => 'Document non analysable : vérifiez les commandes \\documentclass et \\usepackage.',
  LATEX_COMPILE_ERROR:       () => 'La compilation LaTeX a échoué.',
  LATEX_TIMEOUT:             () => 'La compilation a dépassé la durée maximale. Le document contient peut-être une boucle infinie.',
  LATEX_RESOURCE_LIMIT:      () => 'Le document dépasse les ressources autorisées (mémoire, durée ou taille du PDF).',
  LATEX_BUSY:                () => 'Le service de compilation est très sollicité. Réessayez dans un instant.',
  LATEX_QUOTA_EXCEEDED:      () => 'Limite de compilations atteinte pour aujourd’hui. Téléchargez le fichier .tex pour continuer (par exemple sur Overleaf).',
  LATEX_RUNNER_UNAVAILABLE:  () => 'Le service de compilation est momentanément indisponible. Réessayez plus tard ou téléchargez le fichier .tex.',
  LATEX_RUNNER_ERROR:        () => 'Le service de compilation a rencontré une erreur. Réessayez plus tard.',
};

function sendError(res: Response, err: LatexCompileError) {
  if (err.extra.retryAfterSec) res.setHeader('Retry-After', String(err.extra.retryAfterSec));
  const body: Record<string, unknown> = { error: (MESSAGES[err.code] ?? MESSAGES.LATEX_RUNNER_ERROR)(err), code: err.code };
  if (err.extra.details?.length) body.details = err.extra.details;
  if (err.extra.line) body.line = err.extra.line;
  res.status(err.status).json(body);
}

export interface CvRouterOptions {
  /** Compilateur injecté (tests) ; par défaut, construit depuis LATEX_RUNNER_URL */
  compiler?: LatexCompiler | null;
}

export function createCvRouter(options: CvRouterOptions = {}) {
  const router = Router();
  const config = latexConfigFromEnv();
  const compiler = options.compiler !== undefined ? options.compiler : config ? createLatexCompiler(config) : null;

  if (!compiler) {
    router.all('/compile', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: DISABLED_MESSAGE, code: 'LATEX_COMPILE_DISABLED' });
    });
    return router;
  }

  router.post('/compile', latexCompileLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    // Abandon du visiteur : la requête au runner est annulée, qui arrête TeX
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    try {
      if (!req.is('application/json')) throw new LatexCompileError(415, 'LATEX_INVALID_REQUEST');
      const input = parseCompileBody(req.body);
      const subject = `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
      const pdf = await compiler.compile(subject, input, controller.signal);
      console.log(`[LATEX] ok ${Date.now() - started} ms, ${pdf.length} octets`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="cv.pdf"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.status(200).end(pdf);
    } catch (err) {
      if (err instanceof LatexCompileError) {
        if (err.code === 'LATEX_ABORTED') return;
        console.log(`[LATEX] ${err.code} ${Date.now() - started} ms`);
        return sendError(res, err);
      }
      console.error('[LATEX] erreur inattendue :', (err as Error)?.message);
      sendError(res, new LatexCompileError(500, 'LATEX_RUNNER_ERROR'));
    }
  });

  router.all('/compile', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Méthode non autorisée.', code: 'METHOD_NOT_ALLOWED' });
  });

  return router;
}

export default createCvRouter;

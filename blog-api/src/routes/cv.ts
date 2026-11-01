// blog-api/src/routes/cv.ts
// POST /api/cv/compile — compilation LaTeX → PDF de l'éditeur LaTeX
// POST /api/cv/import  — texte d'un CV importé (PDF, DOCX, TXT, RTF), extrait par cv-extractor
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
import { cvImportLimiter, latexCompileLimiter } from '../middleware/rateLimit';
import { createImporter, importConfigFromEnv, ImportError, type CvImporter } from '../latex/import';
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
  /** Extracteur injecté (tests) ; par défaut, construit depuis CV_EXTRACTOR_URL */
  importer?: CvImporter | null;
}

const IMPORT_MESSAGES: Record<string, string> = {
  IMPORT_DISABLED:          'L’import de CV est momentanément indisponible. Vous pouvez saisir vos informations ou coller votre texte.',
  IMPORT_UNSUPPORTED_TYPE:  'Format non pris en charge : PDF, DOCX, TXT ou RTF (ou image JPG/PNG lue par l’IA).',
  IMPORT_TYPE_MISMATCH:     'Le contenu du fichier ne correspond pas à son type.',
  IMPORT_EMPTY:             'Le fichier est vide.',
  IMPORT_TOO_LARGE:         'Fichier trop volumineux (10 Mo au maximum).',
  IMPORT_INVALID_FILE:      'Fichier illisible ou endommagé.',
  IMPORT_ACTIVE_CONTENT:    'Document refusé : il contient des macros ou du contenu actif. Enregistrez-le au format .docx standard ou en PDF.',
  IMPORT_TOO_COMPLEX:       'Document trop volumineux ou trop complexe une fois décompressé.',
  IMPORT_PROTECTED:         'Document protégé par mot de passe.',
  IMPORT_TIMEOUT:           'La lecture du fichier a pris trop de temps.',
  IMPORT_BUSY:              'Le service d’import est très sollicité. Réessayez dans un instant.',
  IMPORT_QUOTA_EXCEEDED:    'Limite d’imports atteinte pour aujourd’hui.',
  IMPORT_UNAVAILABLE:       'Le service d’import est momentanément indisponible.',
  IMPORT_EXTRACTOR_ERROR:   'Le service d’import a rencontré une erreur.',
};

function sendImportError(res: Response, err: ImportError) {
  if (err.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec));
  res.status(err.status).json({ error: IMPORT_MESSAGES[err.code] ?? IMPORT_MESSAGES.IMPORT_EXTRACTOR_ERROR, code: err.code });
}

/** Import : texte extrait en mémoire, jamais écrit sur disque, journalisé ni conservé */
function importRoutes(router: Router, importer: CvImporter | null) {
  router.post('/import', cvImportLimiter, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const file = Buffer.isBuffer(req.body) ? req.body : null;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (!importer) throw new ImportError(503, 'IMPORT_DISABLED');
      if (!file) throw new ImportError(415, 'IMPORT_UNSUPPORTED_TYPE');
      const subject = `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
      res.json(await importer.extract(subject, file, String(req.headers['x-file-type'] ?? ''), controller.signal));
    } catch (err) {
      if (err instanceof ImportError) {
        if (err.code === 'IMPORT_ABORTED') return;
        console.log(`[IMPORT] ${err.code}`);
        return sendImportError(res, err);
      }
      console.error('[IMPORT] erreur inattendue :', (err as Error)?.name);
      sendImportError(res, new ImportError(500, 'IMPORT_EXTRACTOR_ERROR'));
    } finally {
      // Le fichier n'est conservé nulle part : son tampon est effacé dès la réponse
      file?.fill(0);
    }
  });
  router.all('/import', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Méthode non autorisée.', code: 'METHOD_NOT_ALLOWED' });
  });
}

export function createCvRouter(options: CvRouterOptions = {}) {
  const router = Router();
  const config = latexConfigFromEnv();
  const compiler = options.compiler !== undefined ? options.compiler : config ? createLatexCompiler(config) : null;
  const importConfig = importConfigFromEnv();
  importRoutes(router, options.importer !== undefined ? options.importer : importConfig ? createImporter(importConfig) : null);

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
      const { pdf, warnings } = await compiler.compile(subject, input, controller.signal);
      console.log(`[LATEX] ok ${Date.now() - started} ms, ${pdf.length} octets`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="cv.pdf"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      if (warnings.length) res.setHeader('X-Latex-Warnings', Buffer.from(JSON.stringify(warnings)).toString('base64'));
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

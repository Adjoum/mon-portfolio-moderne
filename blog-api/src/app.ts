// blog-api/src/app.ts
// Construction de l'application Express (middlewares + routes).
// Séparée de index.ts (connexion MongoDB, écoute du port, signaux)
// pour pouvoir tester l'API sans base de données ni réseau.

import express, { type Request, type Response, type NextFunction } from 'express';
import cors       from 'cors';
import mongoose   from 'mongoose';
import cookieParser from 'cookie-parser';
import path          from 'path';
import multer        from 'multer';

// ── Middleware ────────────────────────────────────────────────
import {
  globalLimiter,
  abuseLogger,
  commentReadLimiter,
  authLimiter,
  uploadLimiter,
} from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';
import { trustLocalProxy } from './lib/trustProxy';

// ── Routes ───────────────────────────────────────────────────
import articlesRouter from './routes/articles';
import commentsRouter from './routes/comments';
import authRouter     from './routes/auth';
import uploadRouter   from './routes/upload';
import tagsRouter     from './routes/tags';
import { createGroqRouter } from './routes/groq';
import knowledgeRouter from './routes/knowledge';
import { createAgentRouter } from './routes/agent';
import { createCvRouter, type CvRouterOptions } from './routes/cv';
import { createAiRouter } from './routes/ai';
import adminCvRouter from './routes/adminCv';
import { createAdminAiRouter } from './routes/adminAi';
import { createAiGateway, type AiGatewayDeps } from './ai/services/gateway';
import { createAiStore } from './ai/services/store';

export interface AppOptions {
  /** Dépendances de la passerelle IA (remplacées dans les tests : faux fournisseur, quotas) */
  ai?: Partial<AiGatewayDeps>;
  /** Compilation LaTeX (tests : faux runner) */
  latex?: CvRouterOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  // Un seul proxy, et seulement local (nginx via la passerelle Docker) : src/lib/trustProxy.ts
  app.set('trust proxy', trustLocalProxy);
  app.disable('x-powered-by');
  const aiStore = options.ai?.store ?? createAiStore();
  const aiGateway = createAiGateway({ ...options.ai, store: aiStore });
  // Accessibles au démarrage (synchronisation du registre, arrêt propre)
  app.locals.aiStore = aiStore;
  app.locals.aiGateway = aiGateway;
  // ── Middlewares globaux ───────────────────────────────────────

  // ── HTTP Request Logger ────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    const ts    = new Date().toISOString();

    res.on('finish', () => {
      const ms      = Date.now() - start;
      const status  = res.statusCode;
      const method  = req.method.padEnd(6);
      const url     = req.originalUrl.padEnd(40);
      const color   = status >= 500 ? '\x1b[31m'   // rouge
                    : status >= 400 ? '\x1b[33m'   // jaune
                    : status >= 300 ? '\x1b[36m'   // cyan
                    : '\x1b[32m';                  // vert
      const reset   = '\x1b[0m';
      const dim     = '\x1b[2m';

      console.log(
        `${dim}${ts}${reset} ${color}${status}${reset} ${method} ${url} ${dim}${ms}ms${reset}`
      );
    });

    next();
  });

  //app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
  const devOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost', 'http://localhost:80', 'http://localhost:5173'];
  app.use(cors({
    origin: [
      'https://adjoumani-koffi.com',
      'https://www.adjoumani-koffi.com',
      ...devOrigins,
      process.env.FRONTEND_URL || '',
    ].filter(Boolean),
    credentials: true,
    // Lisibles par le site : délai avant nouvel essai, avertissements de mise en page du PDF
    exposedHeaders: ['Retry-After', 'X-Latex-Warnings'],
  }));

  // Base de connaissances : corps JSON limité à 128 Ko (parsé avant le parseur global,
  // qui ignore ensuite la requête déjà lue)
  app.use('/api/agent/knowledge', express.json({ limit: '128kb' }));
  app.use('/api/admin/cv', express.json({ limit: '4kb' }));
  app.use('/api/admin/ai', express.json({ limit: '32kb' }));
  // Passerelle IA : 256 Ko, sauf la lecture d'image (data URL d'au plus 4 Mo)
  app.use('/api/ai/run/cv.import.ocr', express.json({ limit: '6mb' }));
  app.use('/api/ai/run/latex.import.ocr', express.json({ limit: '6mb' }));
  app.use('/api/ai', express.json({ limit: '256kb' }));
  // URL historiques des assistants : entrées texte uniquement
  app.use('/api/agent/chat', express.json({ limit: '128kb' }));
  app.use('/api/groq', express.json({ limit: '16kb' }));
  // Compilation LaTeX : source ≤ 200 Ko + photo JPEG ≤ 2 Mo encodée en base64
  app.use('/api/cv/compile', express.json({ limit: '3mb' }));
  // Import de CV : octets du fichier (10 Mo au plus), jamais écrits sur disque
  app.use('/api/cv/import', express.raw({ type: 'application/octet-stream', limit: '10mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  // Servir les images uploadées localement
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

  app.use(abuseLogger);

  // ── Logger HTTP ───────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    const time  = new Date().toISOString();

    res.on('finish', () => {
      const ms     = Date.now() - start;
      const status = res.statusCode;
      const color  = status >= 500 ? '\x1b[31m'   // rouge
                   : status >= 400 ? '\x1b[33m'   // jaune
                   : status >= 300 ? '\x1b[36m'   // cyan
                   :                 '\x1b[32m';   // vert
      const reset  = '\x1b[0m';
      const method = req.method.padEnd(7);
      const path   = (req.originalUrl || req.url).padEnd(35);
      console.log(`${color}[${time}] ${status} ${method} ${path} ${ms}ms${reset}`);
    });

    next();
  });

  app.use(globalLimiter);
  app.use(authMiddleware); // injecte req.user partout

  // ── Routes ───────────────────────────────────────────────────
  app.use('/api/articles', articlesRouter);
  // Lectures : compteur propre ici. Écritures publiques, réactions et modération : chacune son
  // limiteur, posé route par route (src/routes/comments.ts)
  app.use('/api/comments', commentReadLimiter, commentsRouter);
  app.use('/api/upload',   uploadLimiter,  uploadRouter);
  app.use('/api/auth',     authLimiter,    authRouter);
  app.use('/api/tags',     tagsRouter);
  app.use('/api/groq', createGroqRouter(aiGateway));
  app.use('/api/agent/knowledge', knowledgeRouter);
  app.use('/api/agent', createAgentRouter(aiGateway));
  app.use('/api/cv', createCvRouter(options.latex));
  app.use('/api/ai', createAiRouter(aiGateway));
  app.use('/api/admin/cv', adminCvRouter);
  app.use('/api/admin/ai', createAdminAiRouter(aiGateway, aiStore));


  // ── Health check ─────────────────────────────────────────────
  // Public et minimal : aucun état interne (D19). /ready sert au diagnostic de démarrage.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'starting' });
  });

  // ── Erreurs : réponse JSON neutre, jamais de pile ni de message interne ──
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? 'Fichier trop volumineux' : 'Envoi de fichier invalide',
        code:  tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
      });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requête trop volumineuse', code: 'PAYLOAD_TOO_LARGE' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalide', code: 'INVALID_JSON' });
    }
    const status = Number(err?.status || err?.statusCode);
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: 'Requête invalide', code: 'BAD_REQUEST' });
    }

    console.error(`[ERROR] ${req.method} ${req.path}:`, err?.message || err);
    res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
  });

  return app;
}

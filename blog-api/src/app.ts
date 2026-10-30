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
  commentLimiter,
  authLimiter,
  uploadLimiter,
} from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';

// ── Routes ───────────────────────────────────────────────────
import articlesRouter from './routes/articles';
import commentsRouter from './routes/comments';
import authRouter     from './routes/auth';
import uploadRouter   from './routes/upload';
import tagsRouter     from './routes/tags';
import groqRouter from './routes/groq';
import knowledgeRouter from './routes/knowledge';
import agentRouter from './routes/agent';
import cvRouter from './routes/cv';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
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
  app.use(cors({
    origin: [
      'https://adjoumani-koffi.com',
      'https://www.adjoumani-koffi.com',
      'http://localhost',
      'http://localhost:80',
      'http://localhost:5173',
      process.env.FRONTEND_URL || '',
    ].filter(Boolean),
    credentials: true,
  }));

  // Base de connaissances : corps JSON limité à 128 Ko (parsé avant le parseur global,
  // qui ignore ensuite la requête déjà lue)
  app.use('/api/agent/knowledge', express.json({ limit: '128kb' }));
  app.use(express.json({ limit: '10mb' }));
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
  app.use('/api/comments', commentLimiter, commentsRouter);
  app.use('/api/upload',   uploadLimiter,  uploadRouter);
  app.use('/api/auth',     authLimiter,    authRouter);
  app.use('/api/tags',     tagsRouter);
  app.use('/api/groq', groqRouter);
  app.use('/api/agent/knowledge', knowledgeRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/cv', cvRouter);


  // ── Health check ─────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status:   'ok',
      mongodb:  mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      uptime:   process.uptime(),
    });
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

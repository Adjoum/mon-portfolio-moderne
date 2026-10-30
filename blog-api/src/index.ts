// blog-api/src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import mongoose   from 'mongoose';
import { createApp } from './app';

const app = createApp();

// ── Connexion MongoDB ─────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI!)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB:', err));

// ── Arrêt propre (Graceful Shutdown) ─────────────────────────
function shutdown(signal: string) {
  console.log(`
[33m[${signal}][0m Arrêt en cours...`);

  server.close(async () => {
    console.log('🔌 Serveur HTTP fermé');
    try {
      await mongoose.connection.close();
      console.log('🍃 Connexion MongoDB fermée');
      console.log('✅ Arrêt propre terminé');
      process.exit(0);
    } catch (err) {
      console.error('❌ Erreur fermeture MongoDB:', err);
      process.exit(1);
    }
  });

  // Forcer l'arrêt si ça traîne plus de 5 secondes
  setTimeout(() => {
    console.error('⏱ Timeout dépassé — arrêt forcé');
    process.exit(1);
  }, 5000);
}

// ── Lancement ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;
const server = app.listen(PORT, () =>
  console.log(`🚀 Blog API ${BASE_URL}`)
);

// Écouter les signaux d'arrêt
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill / Docker stop
process.on('SIGINT',  () => shutdown('SIGINT'));  // Ctrl+C
process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

// Capturer les erreurs non gérées
process.on('uncaughtException', (err) => {
  console.error('[31m[ERREUR NON GÉRÉE][0m', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[31m[PROMESSE REJETÉE][0m', reason);
});













// // ─────────────────────────────────────────────────────────
// // 7. SERVER PRINCIPAL (src/index.ts)
// // ─────────────────────────────────────────────────────────
// // blog-api/src/index.ts

// import express    from 'express';
// import cors       from 'cors';
// import dotenv     from 'dotenv';
// import mongoose   from 'mongoose';
// import cookieParser from 'cookie-parser';

// // ── Middleware ────────────────────────────────────────────────
// import {
//   globalLimiter,
//   abuseLogger,
//   commentLimiter,
//   authLimiter,
//   uploadLimiter,
// } from './middleware/rateLimit';
// import { authMiddleware } from './middleware/auth';

// // ── Routes ───────────────────────────────────────────────────
// import articlesRouter from './routes/articles';
// import commentsRouter from './routes/comments';
// import authRouter     from './routes/auth';
// import uploadRouter   from './routes/upload';
// import tagsRouter     from './routes/tags';




// // ── Config ───────────────────────────────────────────────────
// dotenv.config();

// const app = express();

// // ── Middlewares globaux ───────────────────────────────────────
// app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
// app.use(express.json({ limit: '10mb' }));
// app.use(cookieParser());
// app.use(abuseLogger);
// app.use(globalLimiter);
// app.use(authMiddleware); // injecte req.user partout

// // ── Connexion MongoDB ─────────────────────────────────────────
// mongoose
//   .connect(process.env.MONGODB_URI!)
//   .then(() => console.log('✅ MongoDB connecté'))
//   .catch(err => console.error('❌ MongoDB:', err));

// // ── Routes ───────────────────────────────────────────────────
// app.use('/api/articles', articlesRouter);
// app.use('/api/comments', commentLimiter, commentsRouter);
// app.use('/api/upload',   uploadLimiter,  uploadRouter);
// app.use('/api/auth',     authLimiter,    authRouter);
// app.use('/api/tags',     tagsRouter);

// // ── Health check ─────────────────────────────────────────────
// app.get('/api/health', (_req, res) => {
//   res.json({
//     status:   'ok',
//     mongodb:  mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
//     uptime:   process.uptime(),
//   });
// });

// // ── Lancement ────────────────────────────────────────────────
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () =>
//   console.log(`🚀 Blog API sur http://localhost:${PORT}`)
// ); 





























/*import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { globalLimiter, abuseLogger, commentLimiter, authLimiter, uploadLimiter } from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';
import router from './routes/articles';
import commentsRouter from './routes/comments'
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import { User } from './models/User';


 
dotenv.config();
 
const app = express();
 
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
 
// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI!)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB:', err));


app.use(abuseLogger);
app.use(globalLimiter);
app.use(authMiddleware); // injecte req.user sur toutes les routes
 import cookieParser from 'cookie-parser';

app.use(cookieParser());

// Routes
import jwt from 'jsonwebtoken';
app.use('/api/articles', router);
app.use('/api/comments', commentsRouter);
app.use('/api/upload',   uploadRouter);
app.use('/api/auth',     authLimiter,    authRouter);
app.use('/api/comments', commentLimiter, commentsRouter);
app.use('/api/upload',   uploadLimiter,  uploadRouter);
 
// Auth routes (simplifié)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await user.comparePassword(password)) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign(
      { _id: user._id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { _id: user._id, username: user.username, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Blog API sur http://localhost:${PORT}`));              */
 



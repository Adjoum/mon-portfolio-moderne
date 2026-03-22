// blog-api/src/middleware/auth.ts
// JWT authentication middleware
// Supporte : Bearer token (header) + cookie httpOnly

import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import dotenv from 'dotenv';


dotenv.config();


// ── Types ─────────────────────────────────────────────────────
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    username: string;
    role: 'admin' | 'visitor';
    email: string;
  };
}

interface JwtPayload {
  _id: string;
  role: 'admin' | 'visitor';
  iat: number;
  exp: number;
}

// ── Extraire le token depuis header ou cookie ─────────────────
function extractToken(req: Request): string | null {
  // 1. Header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  // 2. Cookie httpOnly (si configuré côté serveur)
  if (req.cookies?.blog_token) {
    return req.cookies.blog_token;
  }
  return null;
}

// ── Middleware optionnel — ne bloque pas si non connecté ──────
// Utiliser sur les routes publiques qui profitent du contexte user
// Ex: GET /articles (pour savoir si on est admin)
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);

  if (!token) {
    return next(); // pas de token → visiteur anonyme, on continue
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    // Vérifier que l'utilisateur existe encore en DB
    const user = await User.findById(decoded._id)
      .select('_id username email role')
      .lean();

    if (!user) {
      return next(); // utilisateur supprimé → traiter comme visiteur
    }

    req.user = {
      _id:      user._id.toString(),
      username: user.username,
      email:    user.email,
      role:     user.role,
    };

    next();
  } catch (err) {
    // Token expiré ou invalide → ne pas bloquer, juste ignorer
    next();
  }
};

// ── Middleware strict — bloque si non connecté ────────────────
// Utiliser sur les routes protégées (poster un commentaire connecté, etc.)
export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentification requise',
      code:  'UNAUTHORIZED',
    });
    return;
  }
  next();
};

// ── Middleware admin — bloque si pas admin ────────────────────
// Utiliser sur les routes d'administration (CRUD articles, delete comments, etc.)
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentification requise',
      code:  'UNAUTHORIZED',
    });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Accès réservé aux administrateurs',
      code:  'FORBIDDEN',
    });
    return;
  }
  next();
};

// ── Middleware ownership — vérifie que l'utilisateur est
//    le propriétaire de la ressource OU un admin ───────────────
// Utiliser pour modifier/supprimer son propre commentaire
export const requireOwnerOrAdmin = (
  getOwnerId: (req: AuthRequest) => string | undefined
) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise', code: 'UNAUTHORIZED' });
      return;
    }
    const ownerId = getOwnerId(req);
    const isOwner = ownerId === req.user._id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      res.status(403).json({
        error: 'Vous ne pouvez modifier que vos propres ressources',
        code:  'FORBIDDEN',
      });
      return;
    }
    next();
  };
};


// ── Générer un JWT ────────────────────────────────────────────
// Fix TypeScript : jwt.sign() attend SignOptions['expiresIn'] qui
// est de type number | StringValue, pas string brut.
export function generateToken(payload: {
  _id: string;
  role: 'admin' | 'visitor';
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET manquant dans .env');
 
  const rawExpiry = process.env.JWT_EXPIRES_IN ?? '7d';
 
  // Nombre pur (ex: "3600") → secondes (number)
  // Durée string (ex: "7d", "2h") → cast vers SignOptions['expiresIn']
  const expiresIn = /^\d+$/.test(rawExpiry)
    ? parseInt(rawExpiry, 10)
    : rawExpiry as jwt.SignOptions['expiresIn'];
 
  return jwt.sign(payload, secret, { expiresIn });
}
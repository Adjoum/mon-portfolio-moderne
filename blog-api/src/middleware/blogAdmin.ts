// blog-api/src/middleware/blogAdmin.ts
// Écritures d'administration du blog (articles, tags, images, modération des commentaires d'autrui) :
// même contrôle que /api/admin/* — administrateur Supabase, MFA (aal2), session serveur active.
// Le jeton du blog (compte MongoDB, mot de passe seul) ne donne plus aucun droit d'administration :
// il ne sert qu'aux visiteurs, pour leurs propres commentaires. Son rôle « admin » est ignoré ici.

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { adminLimiter } from './rateLimit';
import { requireAdminMfa, requireSupabaseAdmin, type SupabaseAdminRequest } from './supabaseAdmin';
import { auditLog, requestContext, type AuditOutcome } from '../lib/audit';
import { User } from '../models/User';

export const blogAdminGuards: RequestHandler[] = [
  adminLimiter,
  requireSupabaseAdmin as RequestHandler,
  requireAdminMfa as RequestHandler,
];

/** Applique les gardes à la suite, hors déclaration de route (modération des commentaires) */
export function runBlogAdminGuards(req: Request, res: Response, next: NextFunction): void {
  const step = (i: number) => (err?: unknown) => {
    if (err) return next(err);
    if (i === blogAdminGuards.length) return next();
    void blogAdminGuards[i](req, res, step(i + 1));
  };
  step(0)();
}

export function auditBlog(req: Request, action: string, outcome: AuditOutcome, target?: string): void {
  auditLog({
    action, outcome, target,
    actorType: 'supabase_admin',
    actorId: (req as SupabaseAdminRequest).supabaseAdmin?.userId,
    ...requestContext(req),
  });
}

/**
 * Auteur MongoDB des articles créés par l'administrateur du portfolio : le compte « admin » du
 * blog le plus ancien (les articles référencent un utilisateur MongoDB). null s'il n'existe pas.
 */
export async function blogAuthorId(): Promise<string | null> {
  const author = await User.findOne({ role: 'admin' }).sort({ _id: 1 }).select('_id').lean();
  return author?._id ? String(author._id) : null;
}

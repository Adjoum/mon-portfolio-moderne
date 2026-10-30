// blog-api/src/lib/audit.ts
// Journal d'audit des opérations d'administration et des accès refusés
//  - une ligne JSON par événement sur stdout (préfixe [AUDIT]), collectée par Docker / journald
//  - copie dans MongoDB (collection admin_audit_logs) quand la connexion est active
// Ne jamais y mettre de contenu, de jeton ni de secret : uniquement qui, quoi, quand, résultat.

import type { Request } from 'express';
import mongoose from 'mongoose';
import { AdminAuditLog } from '../models/AdminAuditLog';

export type AuditOutcome   = 'success' | 'denied' | 'failure';
export type AuditActorType = 'supabase_admin' | 'supabase_user' | 'blog_admin' | 'anonymous';

export interface AuditEvent {
  action:    string;
  outcome:   AuditOutcome;
  actorType: AuditActorType;
  actorId?:  string;
  ip?:       string;
  method?:   string;
  path?:     string;
  target?:   string;
  details?:  Record<string, string | number | boolean | null>;
}

/** Contexte de requête commun à tous les événements (sans corps ni en-têtes) */
export function requestContext(req: Request): Pick<AuditEvent, 'ip' | 'method' | 'path'> {
  return { ip: req.ip, method: req.method, path: req.originalUrl.split('?')[0] };
}

export function auditLog(event: AuditEvent): void {
  const entry = { at: new Date().toISOString(), ...event };
  console.log(`[AUDIT] ${JSON.stringify(entry)}`);

  if (mongoose.connection.readyState === 1) {
    AdminAuditLog.create(entry).catch((err: Error) => {
      console.error('[AUDIT] Enregistrement MongoDB échoué:', err.message);
    });
  }
}

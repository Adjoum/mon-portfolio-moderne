// === models/AdminAuditLog.ts ===
// Journal d'audit des opérations d'administration (qui, quoi, quand, résultat).
// Aucun contenu, jeton ou secret n'y est enregistré. Expiration automatique après 180 jours.
import mongoose, { Schema } from 'mongoose';

const AdminAuditLogSchema = new Schema({
  at:        { type: Date, required: true, default: Date.now, expires: 60 * 60 * 24 * 180 },
  action:    { type: String, required: true },
  outcome:   { type: String, required: true, enum: ['success', 'denied', 'failure'] },
  actorType: { type: String, required: true },
  actorId:   { type: String },
  ip:        { type: String },
  method:    { type: String },
  path:      { type: String },
  target:    { type: String },
  details:   { type: Schema.Types.Mixed },
}, { versionKey: false });

export const AdminAuditLog = mongoose.model('AdminAuditLog', AdminAuditLogSchema, 'admin_audit_logs');

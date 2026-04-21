// ─────────────────────────────────────────────────────────────
//  blog-api/src/models/CV.ts
//  Sauvegarde chaque export PDF utilisateur en base de données
// ─────────────────────────────────────────────────────────────
import mongoose, { Schema, Document } from 'mongoose';

export interface ICV extends Document {
  userId?: string;
  email?: string;
  fullName: string;
  jobTitle?: string;
  template: string;
  targetRole?: string;
  cvData: Record<string, unknown>;
  aiValidationScore: number;
  aiValidationReport: string;
  aiApproved: boolean;
  issues: Array<{ severity: string; section: string; message: string }>;
  exportedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const CVSchema = new Schema<ICV>(
  {
    userId:              { type: String, index: true },
    email:               { type: String, index: true },
    fullName:            { type: String, required: true },
    jobTitle:            { type: String },
    template:            { type: String, required: true, default: 'ats-classic' },
    targetRole:          { type: String },
    cvData:              { type: Schema.Types.Mixed, required: true },
    aiValidationScore:   { type: Number, default: 0, min: 0, max: 100 },
    aiValidationReport:  { type: String, default: '' },
    aiApproved:          { type: Boolean, default: false },
    issues: [
      {
        severity: String,
        section:  String,
        message:  String,
      },
    ],
    exportedAt:  { type: Date, default: Date.now },
    ipAddress:   { type: String },
    userAgent:   { type: String },
  },
  {
    timestamps: true,
    collection: 'cv_exports',
  }
);

CVSchema.index({ exportedAt: -1 });
CVSchema.index({ aiValidationScore: -1 });
CVSchema.index({ fullName: 'text', targetRole: 'text', template: 'text' });

export default mongoose.model<ICV>('CV', CVSchema);
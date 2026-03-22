// ─────────────────────────────────────────────────────────
// 4. MODÈLES MONGOOSE
// ─────────────────────────────────────────────────────────

// === models/User.ts ===
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  avatar?: string;
  bio?: string;
  role: 'admin' | 'visitor';
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  avatar:   { type: String },
  bio:      { type: String, maxlength: 300 },
  role:     { type: String, enum: ['admin', 'visitor'], default: 'visitor' },
}, { timestamps: true });

// Hash password avant sauvegarde
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return ;
  this.password = await bcrypt.hash(this.password, 12);
  
});

UserSchema.methods.comparePassword = async function(password: string) {
  return bcrypt.compare(password, this.password);
};

// Index : { email: 1 } unique, { username: 1 } unique
export const User = mongoose.model<IUser>('User', UserSchema);

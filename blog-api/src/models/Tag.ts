// === models/Tag.ts ===

import mongoose, { Schema, Document } from 'mongoose';



const TagSchema = new Schema({
  name:  { type: String, required: true, unique: true },
  slug:  { type: String, required: true, unique: true },
  color: { type: String, default: '#00ff88' },
  count: { type: Number, default: 0 },
}, { timestamps: true });

// Index : { slug: 1 } unique
export const Tag = mongoose.model('Tag', TagSchema);


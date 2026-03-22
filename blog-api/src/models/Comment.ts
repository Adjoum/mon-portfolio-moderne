// === models/ ===
import mongoose, { Schema, Document } from 'mongoose';

const CommentSchema = new Schema({
  articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
  parentId:  { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
  depth:     { type: Number, default: 0 },
  path:      { type: String },                   // ex: "abc123/def456"
  // Auteur connecté OU visiteur (l'un des deux)
  authorId:  { type: Schema.Types.ObjectId, ref: 'User' },
  guestName: { type: String },
  guestEmail:{ type: String },
  content:   { type: String, required: true, maxlength: 2000 },
  isEdited:  { type: Boolean, default: false },
  editedAt:  { type: Date },
  reactions: { type: Map, of: [String], default: {} }, // { '❤️': [userId1, ...] }
  repliesCount: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Index pour récupérer les commentaires d'un article efficacement
CommentSchema.index({ articleId: 1, parentId: 1, createdAt: -1 });
CommentSchema.index({ path: 1 });

export const Comment = mongoose.model('Comment', CommentSchema);

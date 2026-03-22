// === models/Article.ts ===
import mongoose, { Schema, Document } from 'mongoose';

const ArticleSchema = new Schema({
  title:     { type: String, required: true, maxlength: 200 },
  slug:      { type: String, required: true, unique: true },
  excerpt:   { type: String, required: true, maxlength: 300 },
  content:   { type: String, required: true },       // Markdown complet
  coverImage:{ type: String },
  images:    [{ type: String }],                     // URLs Cloudinary
  author:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tags:      [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  status:    { type: String, enum: ['draft', 'published'], default: 'draft' },
  featured:  { type: Boolean, default: false },
  readTime:  { type: Number, default: 5 },           // minutes
  views:     { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  reactionsCount: { type: Map, of: Number, default: {} },
  seo: {
    title:       String,
    description: String,
    keywords:    [String],
    ogImage:     String,
  },
  series:      { type: String },
  seriesOrder: { type: Number },
  publishedAt: { type: Date },
}, { timestamps: true });

// Index texte pour la recherche full-text
ArticleSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
// Index pour le tri et filtrage
ArticleSchema.index({ status: 1, publishedAt: -1 });
// ArticleSchema.index({ slug: 1 }, { unique: true });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ author: 1 });

export const Article = mongoose.model('Article', ArticleSchema);


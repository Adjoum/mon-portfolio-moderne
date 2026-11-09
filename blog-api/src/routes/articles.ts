// blog-api/src/routes/articles.ts
import { Router } from 'express';
import { Article } from '../models/Article';
import { Tag } from '../models/Tag';
import { auditBlog, blogAdminGuards, blogAuthorId } from '../middleware/blogAdmin';

const router = Router();

// Champs publics de l'auteur : jamais d'e-mail ni de mot de passe
const AUTHOR_FIELDS = 'username avatar bio role';

// GET /api/articles — liste paginée avec jointures
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, tag, search, featured } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter: any = { status: 'published' };
    if (featured) filter.featured = true;
    if (search) filter.$text = { $search: String(search) };
    if (tag) {
      const tagDoc = await Tag.findOne({ slug: String(tag) });
      if (tagDoc) filter.tags = tagDoc._id;
    }
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .sort(search ? { score: { $meta: 'textScore' } } : { publishedAt: -1 })
        .skip(skip).limit(Number(limit))
        .populate('author', 'username avatar bio')
        .populate('tags', 'name slug color')
        .lean(),
      Article.countDocuments(filter),
    ]);
    res.json({ articles, total, page: Number(page), hasMore: skip + articles.length < total });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/articles/id/:id — par _id, brouillons compris : éditeur (admin Supabase + MFA)
// ⚠️ Doit être AVANT /:slug sinon "id" est capturé comme slug
router.get('/id/:id', ...blogAdminGuards, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id)
      .populate('author', 'username avatar bio role')
      .populate('tags', 'name slug color')
      .lean();
    if (!article) return res.status(404).json({ error: 'Article introuvable' });
    res.json(article);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/articles/:slug — article complet + incrément views
router.get('/:slug', async (req, res) => {
  try {
    const article = await Article.findOneAndUpdate(
      { slug: req.params.slug, status: 'published' },
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    )
      .populate('author', 'username avatar bio role')
      .populate('tags', 'name slug color')
      .lean();
    if (!article) return res.status(404).json({ error: 'Article introuvable' });
    res.json(article);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/articles — créer (admin Supabase + MFA)
router.post('/', ...blogAdminGuards, async (req, res) => {
  try {
    const author = await blogAuthorId();
    if (!author) {
      return res.status(503).json({ error: 'Aucun compte auteur du blog', code: 'BLOG_AUTHOR_MISSING' });
    }
    const { title, content, excerpt, tags, coverImage, images, seo, series, seriesOrder } = req.body;
    const baseSlug = title.toLowerCase()
      .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
      .replace(/[ùûü]/g, 'u').replace(/[ôö]/g, 'o')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug, n = 0;
    while (await Article.findOne({ slug })) { slug = `${baseSlug}-${++n}`; }
    const readTime = Math.ceil((content || '').split(/\s+/).length / 250) || 1;
    const article = new Article({
      title, slug, excerpt, content, tags, coverImage, images, seo, series, seriesOrder, readTime,
      author,
      status: req.body.status || 'draft',
      publishedAt: req.body.status === 'published' ? new Date() : undefined,
      featured: req.body.featured || false,
    });
    await article.save();
    if (tags?.length) await Tag.updateMany({ _id: { $in: tags } }, { $inc: { count: 1 } });
    auditBlog(req, 'blog.article.create', 'success', String(article._id));
    res.status(201).json(await article.populate([{ path: 'author', select: AUTHOR_FIELDS }, 'tags']));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/articles/:id — modifier (admin Supabase + MFA)
router.put('/:id', ...blogAdminGuards, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: new Date() };
    if (req.body.status === 'published' && !req.body.publishedAt) {
      update.publishedAt = new Date();
    }
    const article = await Article.findByIdAndUpdate(
      req.params.id, update,
      { returnDocument: 'after', runValidators: true }
    ).populate([{ path: 'author', select: AUTHOR_FIELDS }, 'tags']);
    if (!article) return res.status(404).json({ error: 'Introuvable' });
    auditBlog(req, 'blog.article.update', 'success', String(req.params.id));
    res.json(article);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/articles/:id — vraie suppression MongoDB (admin Supabase + MFA)
router.delete('/:id', ...blogAdminGuards, async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article introuvable' });
    // Décrémenter les compteurs des tags associés
    if (article.tags?.length) {
      await Tag.updateMany({ _id: { $in: article.tags } }, { $inc: { count: -1 } });
    }
    auditBlog(req, 'blog.article.delete', 'success', String(req.params.id));
    res.json({ success: true, deleted: article.title });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
// blog-api/src/routes/tags.ts
import { Router } from 'express';
import { Tag } from '../models/Tag'
import { auditBlog, blogAdminGuards } from '../middleware/blogAdmin';


const router = Router();

// GET /api/tags
router.get('/', async (_req, res) => {
  try {
    const tags = await Tag.find().sort({ count: -1 }).lean();
    res.json(tags);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/tags — créer un tag (admin Supabase + MFA)
router.post('/', ...blogAdminGuards, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 50) {
      return res.status(400).json({ error: 'Nom de tag invalide' });
    }
    const slug = name.toLowerCase()
      .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const tag = await Tag.create({ name, slug, color: color || '#00ff88' });
    auditBlog(req, 'blog.tag.create', 'success', String(tag._id));
    res.status(201).json(tag);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
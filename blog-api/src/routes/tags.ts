// blog-api/src/routes/tags.ts
import { Router } from 'express';
import { Tag } from '../models/Tag'


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

// POST /api/tags — créer un tag (admin)
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    const slug = name.toLowerCase()
      .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const tag = await Tag.create({ name, slug, color: color || '#00ff88' });
    res.status(201).json(tag);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
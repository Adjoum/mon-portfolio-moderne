// === routes/comments.ts ===
import { Router } from 'express';
import { Comment } from '../models/Comment';
import mongoose from 'mongoose';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { Article } from '../models/Article';



const commentsRouter = Router();
 
// GET /api/comments/:articleId — arbre de commentaires
commentsRouter.get('/:articleId', async (req, res) => {
  try {
    //const { page = 1, limit = 50 } = req.query;
 
    // Récupérer tous les commentaires de l'article avec populate auteur
    const allComments = await Comment.find({
      articleId: req.params.articleId,
    })
      .sort({ createdAt: 1 })
      .populate('authorId', 'username avatar role')  // JOIN users
      .lean();
 
    // Construire l'arbre côté serveur
    const map: Record<string, any> = {};
    const roots: any[] = [];
 
    allComments.forEach(c => {
      map[c._id.toString()] = {
        ...c,
        author: c.authorId || { name: c.guestName, email: c.guestEmail },
        replies: [],
      };
    });
 
    allComments.forEach(c => {
      const node = map[c._id.toString()];
      if (c.parentId && map[c.parentId.toString()]) {
        map[c.parentId.toString()].replies.push(node);
      } else if (!c.parentId) {
        roots.push(node);
      }
    });
 
    res.json({
      comments: roots,
      total: allComments.filter(c => !c.isDeleted).length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
 
// POST /api/comments — nouveau commentaire (connecté ou guest)
commentsRouter.post('/', authMiddleware, async (req, res) => {
  try {
    const { articleId, parentId, content, guestName, guestEmail } = req.body;
    const userId = (req as AuthRequest).user?._id;
 
    // Validation guest
    if (!userId && (!guestName?.trim() || !guestEmail?.trim())) {
      return res.status(400).json({ error: 'Nom et email requis pour les visiteurs' });
    }
 
    // Calculer depth et path
    let depth = 0;
    let path = '';
    if (parentId) {
      const parent = await Comment.findById(parentId);
      if (!parent) return res.status(404).json({ error: 'Commentaire parent introuvable' });
      depth = parent.depth + 1;
      path = `${parent.path}/${new mongoose.Types.ObjectId()}`;
 
      // Incrémenter repliesCount du parent
      await Comment.findByIdAndUpdate(parentId, { $inc: { repliesCount: 1 } });
    } else {
      const newId = new mongoose.Types.ObjectId();
      path = newId.toString();
    }
 
    const comment = new Comment({
      articleId, parentId: parentId || null,
      depth, path,
      authorId:   userId || undefined,
      guestName:  userId ? undefined : guestName,
      guestEmail: userId ? undefined : guestEmail,
      content: content.trim(),
    });
 
    await comment.save();
 
    // Incrémenter commentsCount de l'article
    await Article.findByIdAndUpdate(articleId, { $inc: { commentsCount: 1 } });
 
    // Populate auteur pour la réponse
    await comment.populate('authorId', 'username avatar role');
 
    res.status(201).json({
      ...comment.toObject(),
      author: comment.get('authorId') || { name: guestName, email: guestEmail },
      replies: [],
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
 
// PUT /api/comments/:id — modifier (auteur ou admin)
commentsRouter.put('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Introuvable' });
 
    const userId = (req as AuthRequest).user?._id;
    const isAdmin = (req as AuthRequest).user?.role === 'admin';
    const isOwner = comment.authorId?.toString() === userId;
 
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
 
    comment.content  = req.body.content;
    comment.isEdited = true;
    comment.editedAt = new Date();
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
 
// DELETE /api/comments/:id — soft delete (auteur ou admin)
commentsRouter.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Introuvable' });
 
    const userId = (req as AuthRequest).user?._id;
    const isAdmin = (req as AuthRequest).user?.role === 'admin';
    const isOwner = comment.authorId?.toString() === userId;
 
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
 
    // Soft delete — le contenu reste mais marqué supprimé
    comment.isDeleted = true;
    comment.content   = '';
    await comment.save();
 
    await Article.findByIdAndUpdate(comment.articleId, { $inc: { commentsCount: -1 } });
 
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
 
// POST /api/comments/:id/react — réagir à un commentaire
commentsRouter.post('/:id/react', async (req, res) => {
  try {
    const { emoji, sessionId } = req.body;
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Introuvable' });
 
    const users = (comment.reactions.get(emoji) as string[]) || [];
    const idx   = users.indexOf(sessionId);
 
    if (idx >= 0) {
      users.splice(idx, 1); // toggle off
    } else {
      users.push(sessionId); // toggle on
    }
    comment.reactions.set(emoji, users);
    await comment.save();
    res.json({ reactions: Object.fromEntries(comment.reactions) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


export default commentsRouter
 
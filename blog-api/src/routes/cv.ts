// blog-api/src/routes/cv.ts
// POST /api/cv/compile — compilation LaTeX → PDF : DÉSACTIVÉE (audit P0, faille S2)
//
// L'ancienne implémentation exécutait latexmk sur du code fourni par n'importe quel
// visiteur, dans le processus qui détient tous les secrets du serveur (lecture de
// fichiers et de variables d'environnement possible via TeX). Elle a été retirée :
// aucun drapeau d'environnement ne peut la réactiver dans ce processus.
// La compilation reviendra uniquement via le conteneur isolé latex-runner
// (sans secret, sans réseau, ressources limitées), sous authentification et quotas.

import { Router, type Request, type Response } from 'express';

const router = Router();

router.all('/compile', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(503).json({
    error: 'La compilation PDF est momentanément indisponible. Téléchargez le fichier .tex pour le compiler (par exemple sur Overleaf).',
    code:  'LATEX_COMPILE_DISABLED',
  });
});

export default router;









// ─────────────────────────────────────────────────────────────
//  blog-api/src/routes/cv.ts
//  Endpoints : sauvegarde + lecture des exports CV
//
//  Dans index.ts, ajouter :
//    import cvRouter from './routes/cv';
//    app.use('/api/cv', cvRouter);
// ─────────────────────────────────────────────────────────────
/*import { Router, Request, Response } from 'express';
import CV from '../models/CV';

const router = Router();

// ── POST /api/cv/export ─────────────────────────────────────
// Appelé automatiquement lors de chaque export PDF côté client
router.post('/export', async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      email,
      jobTitle,
      template,
      targetRole,
      cvData,
      aiValidationScore,
      aiValidationReport,
      aiApproved,
      issues,
    } = req.body;

    if (!cvData) {
      return res.status(400).json({ error: 'cvData est requis' });
    }

    const cv = new CV({
      userId:             (req as any).user?.id,
      email:              email || cvData?.personal?.email || '',
      fullName:           fullName || cvData?.personal?.name || 'Anonyme',
      jobTitle:           jobTitle || cvData?.personal?.title || '',
      template:           template  || 'ats-classic',
      targetRole:         targetRole || '',
      cvData,
      aiValidationScore:  aiValidationScore  ?? 0,
      aiValidationReport: aiValidationReport || '',
      aiApproved:         aiApproved ?? false,
      issues:             issues || [],
      ipAddress:          req.ip,
      userAgent:          req.headers['user-agent'],
    });

    await cv.save();

    console.log(`📄 CV exporté — ${cv.fullName} (${cv.template}) — score: ${cv.aiValidationScore}/100`);

    return res.status(201).json({
      success: true,
      cvId:    cv._id,
      message: 'CV sauvegardé avec succès',
    });
  } catch (err) {
    console.error('❌ Erreur sauvegarde CV:', err);
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde du CV' });
  }
});

// ── GET /api/cv ─────────────────────────────────────────────
// Liste paginée (admin)
router.get('/', async (req: Request, res: Response) => {
  try {
    const page  = parseInt(req.query.page  as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip  = (page - 1) * limit;

    const [cvs, total] = await Promise.all([
      CV.find({}, { cvData: 0, aiValidationReport: 0 })   // Exclure les champs lourds
        .sort({ exportedAt: -1 })
        .skip(skip)
        .limit(limit),
      CV.countDocuments(),
    ]);

    return res.json({
      cvs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('❌ Erreur liste CVs:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /api/cv/stats ───────────────────────────────────────
// Statistiques pour le tableau de bord admin
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [total, avgScore, byTemplate] = await Promise.all([
      CV.countDocuments(),
      CV.aggregate([{ $group: { _id: null, avg: { $avg: '$aiValidationScore' } } }]),
      CV.aggregate([{ $group: { _id: '$template', count: { $sum: 1 } } }]),
    ]);

    return res.json({
      total,
      avgScore: Math.round(avgScore[0]?.avg || 0),
      byTemplate,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur' });
  }
});

// ── GET /api/cv/:id ─────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) return res.status(404).json({ error: 'CV non trouvé' });
    return res.json(cv);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur' });
  }
});

// ── DELETE /api/cv/:id ──────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await CV.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur' });
  }
});

export default router;  */
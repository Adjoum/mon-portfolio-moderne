import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

const router = Router();

function run(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `${command} failed with code ${code}`));
      }
    });
  });
}

router.post('/compile', async (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  if (!code.trim()) {
    return res.status(400).json({ error: 'Code LaTeX vide.' });
  }

  const workDir = path.join(os.tmpdir(), `latex-${randomUUID()}`);
  const texPath = path.join(workDir, 'main.tex');
  const pdfPath = path.join(workDir, 'main.pdf');

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(texPath, code, 'utf8');

    await run(
      "latexmk",
      [
        '-pdf',
        '-interaction=nonstopmode',
        '-halt-on-error',
        '-file-line-error',
        'main.tex',
      ],
      workDir
    );

    
    const pdfBuffer = await fs.readFile(pdfPath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cv.pdf"');
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('❌ CV compile error:', error);
    return res.status(500).json({
      error: error?.message || 'Compilation LaTeX échouée.',
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
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
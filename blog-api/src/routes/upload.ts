// === routes/upload.ts — Upload image via Cloudinary ===
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { Router, type Response } from 'express';
import multer from 'multer';
import { requireAdmin, authMiddleware } from '../middleware/auth';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, callback) => callback(null, ALLOWED_MIME.has(file.mimetype)),
});

function storeImage(file: Express.Multer.File): Promise<UploadApiResponse> {
  // Configuration lue à l'envoi : aucune valeur figée au chargement du module
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:          'adjoumani-blog',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
        transformation:  [{ width: 1200, crop: 'limit' }],
      },
      (error, result) => (error || !result ? reject(error ?? new Error('Envoi Cloudinary vide')) : resolve(result)),
    ).end(file.buffer);
  });
}

function uploadFailed(res: Response, err: unknown) {
  console.error('[UPLOAD] Envoi Cloudinary impossible :', (err as Error)?.name);
  res.status(502).json({ error: 'Envoi de l’image impossible', code: 'UPLOAD_FAILED' });
}

const uploadRouter = Router();

// POST /api/upload — upload une image
uploadRouter.post('/', authMiddleware, requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image' });
  try {
    const stored = await storeImage(req.file);
    res.json({ url: stored.secure_url, public_id: stored.public_id });
  } catch (err) {
    uploadFailed(res, err);
  }
});

// POST /api/upload/multiple — upload plusieurs images
uploadRouter.post('/multiple', authMiddleware, requireAdmin, upload.array('images', 10), async (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ error: 'Aucune image' });
  try {
    const stored = await Promise.all(files.map(storeImage));
    res.json({ urls: stored.map(image => image.secure_url) });
  } catch (err) {
    uploadFailed(res, err);
  }
});

export default uploadRouter;

// === routes/upload.ts — Upload image via Cloudinary ===
import { v2 as cloudinary } from 'cloudinary';
import { Router } from 'express';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { requireAdmin, authMiddleware } from '../middleware/auth';
 
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
 
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:         'adjoumani-blog',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    transformation: [{ width: 1200, crop: 'limit' }],
  }),
});
 
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
 
const uploadRouter = Router();
 
// POST /api/upload — upload une image
uploadRouter.post('/', authMiddleware, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image' });
  res.json({ url: (req.file as any).path, public_id: (req.file as any).filename });
});
 
// POST /api/upload/multiple — upload plusieurs images
uploadRouter.post('/multiple', authMiddleware, requireAdmin, upload.array('images', 10), (req, res) => {
  const files = req.files as Express.Multer.File[];
  res.json({ urls: files.map((f: any) => f.path) });
});
 

export default uploadRouter
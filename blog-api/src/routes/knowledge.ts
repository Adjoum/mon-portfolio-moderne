// blog-api/src/routes/knowledge.ts
import { Router } from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';


const router   = Router();
const upload   = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

console.log('🔧 knowledge.ts chargé');
console.log('🔑 PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? '✅ définie' : '❌ manquante');
console.log('📦 PINECONE_INDEX:', process.env.PINECONE_INDEX || '❌ manquant');

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
console.log('✅ Pinecone initialisé');
const indexName = process.env.PINECONE_INDEX;

// ── Chunking ────────────────────────────────────────────────
function chunkText(text: string, size = 500, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter(c => c.trim().length > 30);
}

// ── GET /list ───────────────────────────────────────────────
// ── GET /list ───────────────────────────────────────────────
router.get('/list', async (_req, res) => {
  console.log('📋 GET /list appelé');
  try {
    const index = pinecone.index({name: indexName,});

    const stats = await index.describeIndexStats();
    console.log('📊 Stats:', JSON.stringify(stats));

    // ✅ Avec integrated embedding → searchRecords au lieu de query
    const result = await (index as any).searchRecords({
      query: {
        inputs: { text: 'développeur profil compétences projets' },
        topK: 100,
      },
      fields: ['text', 'source', 'category', 'date', 'filename'],
    });
    console.log('🔍 Hits:', result.result?.hits?.length || 0);

    const entries = (result.result?.hits || []).map((m: any) => ({
      id:       m._id,
      text:     ((m.fields?.text as string) || '').slice(0, 200) + '...',
      source:   m.fields?.source   || 'manuel',
      category: m.fields?.category || 'général',
      date:     m.fields?.date     || '',
      score:    m._score,
    }));

    res.json({ entries, totalVectors: stats.totalRecordCount });
  } catch (err: any) {
    console.error('❌ ERREUR /list:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /add-text ──────────────────────────────────────────
router.post('/add-text', async (req, res) => {
  console.log('📝 POST /add-text appelé');
  console.log('📝 Body:', JSON.stringify(req.body).slice(0, 200));
  try {
    const { text, category = 'général', source = 'manuel' } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text requis' });

    const index = pinecone.index({name: indexName,});
    const chunks = chunkText(text.trim());
    console.log(`✂️ ${chunks.length} chunks créés`);
    const ids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const id = `manual_${Date.now()}_${i}`;
      console.log(`⬆️ Upsert chunk ${i + 1}/${chunks.length} — id: ${id}`);
      try {
        await (index as any).upsertRecords({ records: [{
            id,
            text:     chunks[i],
            source:   String(source),
            category: String(category),
            date:     new Date().toISOString(),
        }]});
        console.log(`✅ Chunk ${i + 1} indexé`);
      } catch (upsertErr: any) {
        console.error(`❌ Erreur upsert chunk ${i}:`, upsertErr.message);
        console.error('❌ Détail:', JSON.stringify(upsertErr).slice(0, 500));
        throw upsertErr;
      }
      ids.push(id);
    }

    res.json({ success: true, chunksIndexed: ids.length, ids });
  } catch (err: any) {
    console.error('❌ ERREUR /add-text:', err.message);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /upload-file ───────────────────────────────────────
router.post('/upload-file', upload.single('file'), async (req, res) => {
  console.log('📁 POST /upload-file appelé');
  console.log('📁 Fichier:', req.file?.originalname, '— MIME:', req.file?.mimetype, '— Taille:', req.file?.size);
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    const { category = 'document', source } = req.body;
    const filename = req.file.originalname;
    const mime     = req.file.mimetype;
    let text = '';

    console.log(`📄 Extraction texte depuis ${mime}...`);

    if (mime === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        await parser.destroy();
        text = result.text;
        console.log(`✅ PDF parsé — ${text.length} caractères extraits`);
      } catch (pdfErr: any) {
        console.error('❌ Erreur pdf-parse:', pdfErr.message);
        throw pdfErr;
      }
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
        console.log(`✅ DOCX parsé — ${text.length} caractères extraits`);
      } catch (docxErr: any) {
        console.error('❌ Erreur mammoth:', docxErr.message);
        throw docxErr;
      }
    } else if (mime === 'text/plain' || mime === 'text/markdown') {
      text = req.file.buffer.toString('utf-8');
      console.log(`✅ TXT/MD lu — ${text.length} caractères`);
    } else {
      console.warn('⚠️ Format non supporté:', mime);
      return res.status(400).json({ error: 'Format non supporté (PDF, DOCX, TXT, MD)' });
    }

    if (!text.trim()) return res.status(400).json({ error: 'Fichier vide ou illisible' });

    const index = pinecone.index({name: indexName,});
    const chunks  = chunkText(text);
    console.log(`✂️ ${chunks.length} chunks créés depuis le fichier`);
    let indexed = 0;

    for (let i = 0; i < chunks.length; i++) {
      const id = `file_${Date.now()}_${i}`;
      console.log(`⬆️ Upsert chunk ${i + 1}/${chunks.length}`);
      try {
        await (index as any).upsertRecords({ records: [{
            id,
            text:     chunks[i],
            source:   String(source || filename),
            category: String(category),
            date:     new Date().toISOString(),
            filename,
        }]});      
        console.log(`✅ Chunk ${i + 1} indexé`);
      } catch (upsertErr: any) {
        console.error(`❌ Erreur upsert chunk ${i}:`, upsertErr.message);
        console.error('❌ Détail:', JSON.stringify(upsertErr).slice(0, 500));
        throw upsertErr;
      }
      indexed++;
    }

    console.log(`🎉 Upload terminé — ${indexed} chunks indexés`);
    res.json({ success: true, filename, chunksIndexed: indexed });
  } catch (err: any) {
    console.error('❌ ERREUR /upload-file:', err.message);
    console.error('❌ Stack:', err.stack?.slice(0, 500));
    res.status(500).json({ error: err.message });
  }
});

// ── POST /search ────────────────────────────────────────────
router.post('/search', async (req, res) => {
  console.log('🔍 POST /search appelé — query:', req.body?.query);
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query requis' });

    const index = pinecone.index({name: indexName,});
    const result = await (index as any).searchRecords({
      query: { inputs: { text: query }, topK: 5 },
      fields: ['text', 'source', 'category', 'date'],
    });
    console.log('🔍 Résultats:', result.result?.hits?.length || 0, 'hits');

    res.json({
      results: (result.result?.hits || []).map((m: any) => ({
        id:       m._id,
        text:     m.fields?.text,
        source:   m.fields?.source,
        category: m.fields?.category,
        score:    m._score,
      })),
    });
  } catch (err: any) {
    console.error('❌ ERREUR /search:', err.message);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});


// ── DELETE /:id ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const id = decodeURIComponent(req.params.id);
  console.log('🗑️ DELETE /:id appelé — id:', id);
  try {
    const index = pinecone.index({ name: indexName, });

    // ✅ Selon la doc officielle JavaScript
    await index.namespace('__default__').deleteOne({ id });

    console.log('✅ Supprimé:', id);
    res.json({ success: true, deleted: id });
  } catch (err: any) {
    console.error('❌ ERREUR /delete:', err.message);
    console.error('❌ Stack:', err.stack?.slice(0, 300));
    res.status(500).json({ error: err.message });
  }
});

export default router;
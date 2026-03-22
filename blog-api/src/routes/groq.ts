// blog-api/src/routes/groq.ts
import { Router } from 'express';

const router = Router();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

interface GroqResponse {
  error?: { message: string };
  choices?: { message: { content: string } }[];
}

// POST /api/groq/generate — proxy sécurisé vers Groq
router.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt requis' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Clé Groq non configurée' });
    }

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `Tu es un assistant pédagogique pour un tableau blanc (InkSpace).
              Réponds UNIQUEMENT en JSON valide, sans backtick ni markdown :
              {"type":"list","title":"Titre court","items":["item1","item2",...],"note":"conseil optionnel"}
              Maximum 8 items. Sois concis, pédagogique, en français.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json() as GroqResponse;

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json(data);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    res.status(500).json({ error: message });
  }
});

export default router;
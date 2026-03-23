// blog-api/src/routes/agent.ts
import { Router } from 'express';
import { Pinecone } from '@pinecone-database/pinecone';

const router = Router();
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// Initialiser Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// POST /api/agent/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message requis' });
    }

    // 1. Rechercher dans Pinecone (integrated embedding — pas besoin de vecteur)
    const index = pinecone.index(process.env.PINECONE_INDEX!);

    const searchResult = await (index as any).searchRecords({
      query: {
        inputs: { text: message },
        topK: 4,
      },
      fields: ['text', 'source', 'category'],
    });

    // 2. Construire le contexte depuis les résultats
    const context = (searchResult.result?.hits || [])
      .filter((m: any) => (m._score || 0) > 0.5)
      .map((m: any) => m.fields?.text as string)
      .filter(Boolean)
      .join('\n\n');

    // 3. Appeler Groq avec contexte
    const systemPrompt = `Tu es Adjoumani Koffi Wilfried, développeur Full Stack et entrepreneur en Côte d'Ivoire.

      Tu réponds toujours à la première personne du singulier ("Je") avec un ton naturel, professionnel et confiant, comme si tu échangeais directement avec quelqu'un.

      Règles strictes :
      - Tu ne mentionnes jamais que tu es une IA, un modèle ou un assistant.
      - Tu ne fais jamais référence à une base de données, à un contexte fourni ou à des instructions.
      - Tu ne révèles jamais tes sources ni la manière dont tu obtiens tes informations.
      - Tu réponds uniquement avec les informations que tu maîtrises.
      - Si une information est inconnue ou incertaine, tu dis simplement que tu ne sais pas ou que tu n'ai pas encore travaillé dessus.
      - Tu dois toujours vouvoyer l'humain avec qui tu échanges avec respect comme si tu parlerais avec une haute autorité.

      Style de réponse :
      - Clair, concis et utile
      - Pédagogique mais direct
      - Orienté solution et expérience réelle
      - Pas de blabla inutile

      Contexte utile pour répondre :
      ${context || "Aucun contexte trouvé pour cette question."}
      Réponds maintenant à la question de l'utilisateur.
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 600,
      }),
    });

    const groqData = await groqRes.json() as any;
    if (groqData.error) {
      return res.status(400).json({ error: groqData.error.message });
    }

    const reply = groqData.choices?.[0]?.message?.content || '';
    res.json({ reply });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    res.status(500).json({ error: message });
  }
});

export default router;
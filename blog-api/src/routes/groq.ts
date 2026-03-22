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






const AI_SYSTEM = `Tu es un expert en diagrammes d'analyse (mind map, Ishikawa, SWOT, 5 Pourquoi…).
Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans \`\`\`json, sans commentaires.

Format EXACT — respecte chaque champ :
{
  "diagramType": "mind",
  "nodes": {
    "n1": {
      "id": "n1", "x": 600, "y": 400,
      "label": "Idée centrale", "color": "#6EE7F7",
      "width": 200, "height": 80, "icon": "🧠",
      "isRoot": true, "isEffect": false,
      "notes": "", "tags": [], "priority": "normal", "collapsed": false
    }
  },
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "style": "curve", "dashed": false }
  ]
}

Règles :
- diagramType : "mind" | "ishikawa" | "swot" | "five_why" | "tree" | "concept"
- Ishikawa : nœud problème → isEffect:true, isRoot:false (JAMAIS isRoot:true pour Ishikawa)
- 8 à 14 nœuds selon la complexité
- Positions : x ∈ [100, 1200], y ∈ [80, 780]
- Couleurs : #6EE7F7 #A78BFA #F472B6 #34D399 #FBBF24 #F87171 #60A5FA #C084FC
- IDs : "n1", "n2"… et "e1", "e2"… (courts, sans espaces)
- Réponds UNIQUEMENT avec le JSON — rien avant, rien après.`;

router.post('/generate-diagram', async (req, res) => {
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
          { role: 'system', content: AI_SYSTEM },
          { role: 'user',   content: `Génère un diagramme sur : ${prompt}` }
        ],
        temperature: 0.7,
        max_tokens:  1400,
      }),
    });

    const data = await response.json() as any;

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    // Extraire et nettoyer le JSON brut
    const raw   = data.choices?.[0]?.message?.content || '';
    const clean = raw
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // Valider le JSON avant de renvoyer
    const parsed = JSON.parse(clean);
    if (!parsed.nodes || !Array.isArray(parsed.edges)) {
      return res.status(500).json({ error: 'Réponse LLM invalide' });
    }

    // Retourner le diagramme parsé directement
    res.json(parsed);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    res.status(500).json({ error: message });
  }
});



export default router;



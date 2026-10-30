// blog-api/src/ai/features/knowledgeContext.ts
// Contexte de l'assistant Clone IA : recherche dans l'index Pinecone (embedding intégré).
// Une panne de Pinecone ne coupe pas l'assistant : il répond sans contexte et dit qu'il
// ne sait pas. La recherche est bornée dans le temps et annulée avec la requête du visiteur.

import { Pinecone } from '@pinecone-database/pinecone';

const TOP_K = 4;
const MIN_SCORE = 0.5;
const SEARCH_TIMEOUT_MS = 5000;

interface SearchHit { _score?: number; fields?: { text?: unknown } }

let client: Pinecone | null = null;

export async function searchKnowledge(query: string, signal: AbortSignal): Promise<string> {
  const apiKey    = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;
  if (!apiKey || !indexName) return '';

  client ??= new Pinecone({ apiKey });
  const search = (client.index(indexName) as any).searchRecords({
    query: { inputs: { text: query }, topK: TOP_K },
    fields: ['text', 'source', 'category'],
  }) as Promise<{ result?: { hits?: SearchHit[] } }>;

  const abort = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]);
  const aborted = new Promise<never>((_, reject) => {
    if (abort.aborted) return reject(abort.reason);
    abort.addEventListener('abort', () => reject(abort.reason), { once: true });
  });

  try {
    const result = await Promise.race([search, aborted]);
    return (result.result?.hits ?? [])
      .filter(hit => (hit._score ?? 0) > MIN_SCORE)
      .map(hit => hit.fields?.text)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join('\n\n');
  } catch (err) {
    console.error('[AI] Recherche Pinecone indisponible :', (err as Error)?.name);
    return '';
  }
}

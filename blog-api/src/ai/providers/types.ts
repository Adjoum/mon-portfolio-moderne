// blog-api/src/ai/providers/types.ts
// Contrats communs aux six fournisseurs retenus (architecture multi-IA, doc 09 §3).
// Le navigateur ne voit jamais ces types : il n'envoie qu'un identifiant de
// fonctionnalité et des données d'entrée validées.

export const PROVIDER_IDS = ['openai', 'groq', 'xai', 'gemini', 'openrouter', 'anthropic'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Paramètres de génération normalisés ; chaque adaptateur déclare ceux qu'il accepte */
export type GenerationParam =
  | 'temperature' | 'top_p' | 'top_k' | 'stop'
  | 'presence_penalty' | 'frequency_penalty' | 'seed' | 'reasoning_effort';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string; detail: 'low' | 'high' };

export type OutputFormat = 'text' | 'json';

export interface NormalizedRequest {
  /** Message système : défini exclusivement côté serveur par le registre des fonctionnalités */
  system: string;
  /** Uniquement user / assistant : aucun rôle système ne peut venir du client */
  messages: { role: 'user' | 'assistant'; content: ContentPart[] }[];
  maxOutputTokens: number;
  params: Partial<Record<GenerationParam, number | string>>;
  /** Mode JSON du fournisseur quand il existe ; la sortie reste contrôlée côté serveur */
  output?: OutputFormat;
}

export interface NormalizedResponse {
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: string;
}

export type NormalizedErrorCode =
  | 'auth' | 'model_not_found' | 'model_deprecated' | 'rate_limited' | 'quota_exceeded'
  | 'context_too_long' | 'content_filtered' | 'timeout' | 'unavailable' | 'bad_request'
  | 'invalid_response' | 'aborted' | 'unknown';

/** Erreur de fournisseur normalisée. Le message brut n'est JAMAIS renvoyé au visiteur. */
export class ProviderError extends Error {
  constructor(
    public code: NormalizedErrorCode,
    public providerStatus?: number,
    /** Détail technique expurgé, destiné aux journaux serveur uniquement */
    public detail?: string,
  ) {
    super(code);
  }
}

export interface CallContext {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  contextWindow?: number;
  maxCompletionTokens?: number;
  /** false : retiré par le fournisseur */
  active?: boolean;
  /** Date de retrait annoncée (ISO) */
  shutdownDate?: string;
  /** Entrée image : undefined = le catalogue ne le dit pas, seule une sonde peut trancher */
  vision?: boolean;
  /** Tarif publié par le catalogue, en micro-USD par million de tokens */
  pricing?: { inputPerMTok: number; outputPerMTok: number };
}

export interface ProviderAdapter {
  id: ProviderId;
  supportedParams: ReadonlySet<GenerationParam>;
  /** Entrée image acceptée par l'adaptateur (le modèle doit aussi la supporter) */
  supportsImages: boolean;
  generate(req: NormalizedRequest, ctx: CallContext): Promise<NormalizedResponse>;
  /** Catalogue officiel, métadonnées uniquement : aucune facturation */
  listModels(ctx: Pick<CallContext, 'apiKey' | 'signal'>): Promise<ModelInfo[]>;
}

/** Description statique d'un fournisseur : URL de base FIXÉE dans le code (jamais configurable à distance) */
export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  /** Variable d'environnement serveur contenant la clé (transitoire avant Supabase Vault) */
  apiKeyEnv: string;
  createAdapter: (baseUrl: string) => ProviderAdapter;
}

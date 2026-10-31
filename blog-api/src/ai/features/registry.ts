// blog-api/src/ai/features/registry.ts
// Registre des fonctionnalités IA : identifiants techniques stables, définis dans le code.
// Pour chacune : niveau d'authentification, schéma d'entrée strict, prompt système serveur,
// limites (tokens, durée, taille du corps), quotas par défaut, capacités requises.
// Seule l'AFFECTATION (fournisseur, modèle), indépendante par fonctionnalité, sera
// modifiable depuis le dashboard (P1/P2) : données dans config/initial-assignments.json.
//
// Toutes les fonctionnalités IA passent par cette passerelle. Les URL historiques
// (/api/agent/chat, /api/groq/*) n'en sont que des adaptateurs de format.

import type { NormalizedRequest, OutputFormat } from '../providers/types';
import { InputError, strictObject, text, oneOf, imageDataUrl } from './validate';
import { searchKnowledge } from './knowledgeContext';
import { normalizeDiagramOutput, normalizeInkspaceOutput } from './outputs';
import {
  CV_PROMPT_VERSION, cvGenerateSystem, cvGenerateUser, CV_REVIEW_SYSTEM,
  CV_OCR_SYSTEM, CV_OCR_USER, CV_STRUCTURE_SYSTEM, type CvIntake,
} from './prompts/cv.v1';
import { LATEX_FEATURES } from './latexStudio';
import { ASSISTANTS_PROMPT_VERSION, INKSPACE_SYSTEM, NOVAMIND_SYSTEM, agentSystem } from './prompts/assistants.v1';

export const FEATURE_IDS = [
  'cv.generate', 'cv.review', 'cv.import.structure', 'cv.import.ocr',
  'latex.generate', 'latex.improve', 'latex.fix', 'latex.import.structure', 'latex.import.ocr', 'latex.rewrite',
  'agent.chat', 'inkspace.generate', 'novamind.diagram',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type Capability = 'text' | 'json' | 'vision';

export interface FeatureQuotas {
  /** Requêtes par sujet (IP ou utilisateur) et par jour UTC */
  perSubjectPerDay: number;
  /** Requêtes totales par jour UTC (tous visiteurs) */
  globalPerDay: number;
  /** Requêtes simultanées en cours vers le fournisseur */
  concurrency: number;
}

export type BuiltRequest = Pick<NormalizedRequest, 'system' | 'messages'>;

export interface BuildContext {
  /** Annulé si le visiteur se déconnecte */
  signal: AbortSignal;
}

export interface FeatureDefinition<Input = any> {
  id: string;
  section: string;
  authLevel: 'public' | 'admin';
  /** Données personnelles envoyées au fournisseur (pour la politique de confidentialité et le secours) */
  personalData: boolean;
  requiredCapabilities: Capability[];
  output: OutputFormat;
  promptVersion: string;
  bodyLimit: 'small' | 'large';
  timeoutMs: number;
  maxOutputTokens: number;
  quotas: FeatureQuotas;
  /** Requêtes par minute et par IP */
  rateLimitPerMinute: number;
  parseInput(raw: unknown): Input;
  /** Exécutée après les quotas : peut interroger une source externe (recherche de contexte) */
  buildRequest(input: Input, ctx: BuildContext): BuiltRequest | Promise<BuiltRequest>;
  /** Contrôle et normalise la sortie du modèle (avec l'entrée validée) ; lève une ProviderError si elle est inexploitable */
  parseOutput?(content: string, input: Input): string;
}


const userText = (value: string): BuiltRequest['messages'] => [{ role: 'user', content: [{ type: 'text', text: value }] }];

/** Historique de l'assistant : le widget peut envoyer toute la conversation, seul le dernier échange part au modèle */
const MAX_HISTORY_RECEIVED = 200;
const HISTORY_SENT = 6;

interface AgentInput {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

const isChatRole = (value: unknown): value is AgentInput['history'][number]['role'] => value === 'user' || value === 'assistant';

const SHORT = 200;   // champs d'identité
const LONG  = 6000;  // champs descriptifs

const INTAKE_SHORT = ['name', 'title', 'email', 'phone', 'city', 'linkedin', 'github', 'targetRole', 'yearsExp', 'sector'] as const;
const INTAKE_LONG  = ['rawExps', 'rawEdu', 'rawSkills', 'keyAchievement', 'rawProjects'] as const;

export const FEATURES: Record<FeatureId, FeatureDefinition> = {
  'cv.generate': {
    id: 'cv.generate',
    section: 'CV Generator',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 85_000,
    maxOutputTokens: 4500,
    quotas: { perSubjectPerDay: 3, globalPerDay: 150, concurrency: 3 },
    rateLimitPerMinute: 6,
    parseInput(raw): CvIntake {
      const o = strictObject(raw, 'input', [...INTAKE_SHORT, ...INTAKE_LONG, 'style', 'lang', 'importedContent', 'updateInstructions']);
      const intake = {
        style: oneOf(o, 'style', ['french', 'american'] as const, 'french'),
        lang:  oneOf(o, 'lang', ['fr', 'en'] as const, 'fr'),
        importedContent:    text(o, 'importedContent', { max: 12_000 }),
        updateInstructions: text(o, 'updateInstructions', { max: 2000 }),
      } as CvIntake;
      for (const k of INTAKE_SHORT) intake[k] = text(o, k, { max: SHORT });
      for (const k of INTAKE_LONG)  intake[k] = text(o, k, { max: LONG });
      if (!intake.name.trim()) throw new InputError('name', 'requis');
      return intake;
    },
    buildRequest: (intake: CvIntake) => ({ system: cvGenerateSystem(intake), messages: userText(cvGenerateUser(intake)) }),
  },

  'cv.review': {
    id: 'cv.review',
    section: 'CV Generator',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 30_000,
    maxOutputTokens: 800,
    quotas: { perSubjectPerDay: 5, globalPerDay: 200, concurrency: 4 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['cv', 'lang']);
      const lang = oneOf(o, 'lang', ['fr', 'en'] as const, 'fr');
      if (typeof o.cv !== 'object' || o.cv === null || Array.isArray(o.cv)) {
        throw new InputError('cv', 'objet attendu');
      }
      // La photo n'est jamais transmise au fournisseur (minimisation des données)
      const cv = JSON.parse(JSON.stringify(o.cv)) as { personal?: Record<string, unknown> };
      if (cv.personal && typeof cv.personal === 'object') delete cv.personal.photo;
      const serialized = JSON.stringify(cv, null, 2);
      if (serialized.length > 60_000) throw new InputError('cv', 'trop volumineux');
      return { lang, text: serialized.slice(0, 3000) };
    },
    buildRequest: ({ lang, text }: { lang: string; text: string }) => ({
      system: CV_REVIEW_SYSTEM,
      messages: userText(`CV à analyser (langue: ${lang}):\n${text}`),
    }),
  },

  'cv.import.structure': {
    id: 'cv.import.structure',
    section: 'CV Generator',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text'],
    output: 'text',
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 45_000,
    maxOutputTokens: 2000,
    quotas: { perSubjectPerDay: 3, globalPerDay: 150, concurrency: 3 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['text']);
      const value = text(o, 'text', { max: 60_000, required: true });
      return { text: value.length > 8000 ? value.slice(0, 8000) + '\n[tronqué]' : value };
    },
    buildRequest: ({ text }: { text: string }) => ({
      system: CV_STRUCTURE_SYSTEM,
      messages: userText(`Texte extrait:\n${text}`),
    }),
  },

  'cv.import.ocr': {
    id: 'cv.import.ocr',
    section: 'CV Generator',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'vision'],
    output: 'text',
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'large',
    timeoutMs: 60_000,
    maxOutputTokens: 2000,
    quotas: { perSubjectPerDay: 1, globalPerDay: 50, concurrency: 2 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['image']);
      return { image: imageDataUrl(o, 'image', 4 * 1024 * 1024) };
    },
    buildRequest: ({ image }: { image: string }) => ({
      system: CV_OCR_SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', dataUrl: image, detail: 'high' },
        { type: 'text', text: CV_OCR_USER },
      ] }],
    }),
  },

  ...LATEX_FEATURES,

  'agent.chat': {
    id: 'agent.chat',
    section: 'Assistant Clone IA',
    authLevel: 'public',
    personalData: false,
    requiredCapabilities: ['text'],
    output: 'text',
    promptVersion: ASSISTANTS_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 30_000,
    maxOutputTokens: 1000,
    quotas: { perSubjectPerDay: 40, globalPerDay: 2000, concurrency: 6 },
    rateLimitPerMinute: 12,
    parseInput(raw): AgentInput {
      const o = strictObject(raw, 'input', ['message', 'history']);
      const message = text(o, 'message', { max: 2000, required: true });
      const rawHistory = o.history ?? [];
      if (!Array.isArray(rawHistory) || rawHistory.length > MAX_HISTORY_RECEIVED) throw new InputError('history', 'liste attendue');
      // Seuls user et assistant sont acceptés : le rôle système appartient au serveur
      const history = rawHistory.map((entry, index) => {
        const field = `history[${index}]`;
        const item = strictObject(entry, field, ['role', 'content']);
        if (!isChatRole(item.role)) throw new InputError(`${field}.role`, 'rôle non autorisé');
        return { role: item.role, content: text(item, 'content', { max: 4000, required: true }) };
      });
      return { message, history: history.slice(-HISTORY_SENT) };
    },
    async buildRequest({ message, history }: AgentInput, { signal }) {
      return {
        system: agentSystem(await searchKnowledge(message, signal)),
        messages: [
          ...history.map(({ role, content }) => ({ role, content: [{ type: 'text' as const, text: content }] })),
          ...userText(message),
        ],
      };
    },
  },

  'inkspace.generate': {
    id: 'inkspace.generate',
    section: 'InkSpace',
    authLevel: 'public',
    personalData: false,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: ASSISTANTS_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 30_000,
    maxOutputTokens: 1200,
    quotas: { perSubjectPerDay: 20, globalPerDay: 500, concurrency: 3 },
    rateLimitPerMinute: 8,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['prompt']);
      return { prompt: text(o, 'prompt', { max: 4000, required: true }) };
    },
    buildRequest: ({ prompt }: { prompt: string }) => ({ system: INKSPACE_SYSTEM, messages: userText(prompt) }),
    parseOutput: normalizeInkspaceOutput,
  },

  'novamind.diagram': {
    id: 'novamind.diagram',
    section: 'NovaMind',
    authLevel: 'public',
    personalData: false,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: ASSISTANTS_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 45_000,
    maxOutputTokens: 2400,
    quotas: { perSubjectPerDay: 15, globalPerDay: 400, concurrency: 3 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['prompt']);
      return { prompt: text(o, 'prompt', { max: 4000, required: true }) };
    },
    buildRequest: ({ prompt }: { prompt: string }) => ({
      system: NOVAMIND_SYSTEM,
      messages: userText(`Génère un diagramme sur : ${prompt}`),
    }),
    parseOutput: normalizeDiagramOutput,
  },
};

export function isFeatureId(value: string): value is FeatureId {
  return Object.prototype.hasOwnProperty.call(FEATURES, value);
}

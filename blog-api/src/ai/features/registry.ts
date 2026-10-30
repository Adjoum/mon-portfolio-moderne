// blog-api/src/ai/features/registry.ts
// Registre des fonctionnalités IA : identifiants techniques stables, définis dans le code.
// Pour chacune : niveau d'authentification, schéma d'entrée strict, prompt système serveur,
// limites (tokens, durée, taille du corps), quotas par défaut, capacités requises.
// Seule l'AFFECTATION (fournisseur, modèle), indépendante par fonctionnalité, sera
// modifiable depuis le dashboard (P1/P2) : données dans config/initial-assignments.json.
//
// Fonctionnalités IA existantes encore servies par leurs routes historiques (Groq),
// à durcir en P0.A3 puis à brancher sur cette passerelle en P1.D :
//   agent.chat (/api/agent/chat), inkspace.generate (/api/groq/generate),
//   novamind.diagram (/api/groq/generate-diagram)

import type { NormalizedRequest } from '../providers/types';
import { InputError, strictObject, text, oneOf, imageDataUrl } from './validate';
import {
  CV_PROMPT_VERSION, cvGenerateSystem, cvGenerateUser, CV_REVIEW_SYSTEM,
  CV_OCR_SYSTEM, CV_OCR_USER, CV_STRUCTURE_SYSTEM, type CvIntake,
} from './prompts/cv.v1';
import {
  LATEX_PROMPT_VERSION, LATEX_GENERATE_SYSTEM, LATEX_IMPROVE_SYSTEM,
  latexGenerateUser, latexImproveUser,
} from './prompts/latex.v1';

export const FEATURE_IDS = [
  'cv.generate', 'cv.review', 'cv.import.structure', 'cv.import.ocr',
  'latex.generate', 'latex.improve',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type Capability = 'text' | 'vision';

export interface FeatureQuotas {
  /** Requêtes par sujet (IP ou utilisateur) et par jour UTC */
  perSubjectPerDay: number;
  /** Requêtes totales par jour UTC (tous visiteurs) */
  globalPerDay: number;
  /** Requêtes simultanées en cours vers le fournisseur */
  concurrency: number;
}

export type BuiltRequest = Pick<NormalizedRequest, 'system' | 'messages'>;

export interface FeatureDefinition<Input = any> {
  id: string;
  section: string;
  authLevel: 'public' | 'admin';
  /** Données personnelles envoyées au fournisseur (pour la politique de confidentialité et le secours) */
  personalData: boolean;
  requiredCapabilities: Capability[];
  promptVersion: string;
  bodyLimit: 'small' | 'large';
  timeoutMs: number;
  maxOutputTokens: number;
  quotas: FeatureQuotas;
  parseInput(raw: unknown): Input;
  buildRequest(input: Input): BuiltRequest;
}

const userText = (value: string): BuiltRequest['messages'] => [{ role: 'user', content: [{ type: 'text', text: value }] }];

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
    requiredCapabilities: ['text'],
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 85_000,
    maxOutputTokens: 4500,
    quotas: { perSubjectPerDay: 3, globalPerDay: 150, concurrency: 3 },
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
    requiredCapabilities: ['text'],
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 30_000,
    maxOutputTokens: 800,
    quotas: { perSubjectPerDay: 5, globalPerDay: 200, concurrency: 4 },
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
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 45_000,
    maxOutputTokens: 2000,
    quotas: { perSubjectPerDay: 3, globalPerDay: 150, concurrency: 3 },
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
    promptVersion: CV_PROMPT_VERSION,
    bodyLimit: 'large',
    timeoutMs: 60_000,
    maxOutputTokens: 2000,
    quotas: { perSubjectPerDay: 1, globalPerDay: 50, concurrency: 2 },
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

  'latex.generate': {
    id: 'latex.generate',
    section: 'Éditeur LaTeX',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text'],
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 85_000,
    maxOutputTokens: 3000,
    quotas: { perSubjectPerDay: 3, globalPerDay: 100, concurrency: 2 },
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['info', 'template', 'existing']);
      return {
        info:     text(o, 'info', { max: 8000, required: true }),
        template: text(o, 'template', { max: 20_000 }),
        existing: text(o, 'existing', { max: 30_000 }),
      };
    },
    buildRequest: ({ info, template, existing }: { info: string; template: string; existing: string }) => ({
      system: LATEX_GENERATE_SYSTEM,
      messages: userText(latexGenerateUser(info, template, existing)),
    }),
  },

  'latex.improve': {
    id: 'latex.improve',
    section: 'Éditeur LaTeX',
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text'],
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 60_000,
    maxOutputTokens: 1800,
    quotas: { perSubjectPerDay: 15, globalPerDay: 400, concurrency: 4 },
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['selection', 'instruction', 'context']);
      return {
        selection:   text(o, 'selection', { max: 8000, required: true }),
        instruction: text(o, 'instruction', { max: 1000, required: true }),
        context:     text(o, 'context', { max: 4000 }),
      };
    },
    buildRequest: ({ selection, instruction, context }: { selection: string; instruction: string; context: string }) => ({
      system: LATEX_IMPROVE_SYSTEM,
      messages: userText(latexImproveUser(selection, instruction, context)),
    }),
  },
};

export function isFeatureId(value: string): value is FeatureId {
  return Object.prototype.hasOwnProperty.call(FEATURES, value);
}

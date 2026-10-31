// blog-api/src/ai/features/latexStudio.ts
// Fonctionnalités IA du studio LaTeX : génération, amélioration, correction, import, réécriture.
// Chacune est indépendante : fournisseur, modèle, paramètres, quotas et budget se règlent
// séparément dans le centre IA du dashboard.
//
// Garanties vérifiées ICI, côté serveur, quelle que soit la réponse du modèle :
//   - latex.fix : seulement des remplacements de lignes existantes, bornés en nombre et en taille ;
//     la compilation reste soumise à la politique de latex-runner ;
//   - latex.import.structure : données normalisées (schéma fermé, longueurs bornées) ;
//   - latex.rewrite : faits (employeurs, diplômes, dates, établissements) repris de l'entrée ;
//     tout texte reformulé contenant un chiffre absent du CV est écarté et signalé.

import { ProviderError } from '../providers/types';
import type { FeatureDefinition, BuiltRequest } from './registry';
import { InputError, strictObject, text, oneOf, imageDataUrl } from './validate';
import { normalizeCvData, numbersIn, type CvData } from './cvData';
import {
  LATEX_PROMPT_VERSION, LATEX_GENERATE_SYSTEM, LATEX_IMPROVE_SYSTEM, LATEX_FIX_SYSTEM,
  LATEX_IMPORT_STRUCTURE_SYSTEM, LATEX_IMPORT_OCR_SYSTEM, LATEX_IMPORT_OCR_USER, LATEX_REWRITE_SYSTEM,
  latexGenerateUser, latexImproveUser, latexFixUser, latexImportStructureUser, latexRewriteUser,
  type LatexTarget,
} from './prompts/latex.v2';
import { getRunnerPolicy } from '../../latex/policy';

const SECTION = 'Éditeur LaTeX';
const userText = (value: string): BuiltRequest['messages'] => [{ role: 'user', content: [{ type: 'text', text: value }] }];

/** Code LaTeX envoyé à la correction : un CV dépasse rarement 20 Ko */
export const MAX_FIX_CODE_CHARS = 60_000;
const MAX_EDITS = 20;
const MAX_REPLACEMENT_CHARS = 8000;

function stripFences(raw: string): string {
  return raw.replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '').trim();
}

function parseObject(raw: string, feature: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stripFences(raw));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* réponse non JSON */ }
  throw new ProviderError('invalid_response', undefined, feature);
}

/** Organisme visé obligatoire, poste facultatif (rédaction ciblée) */
export function parseTarget(raw: unknown): LatexTarget {
  const o = strictObject(raw, 'target', ['organization', 'role']);
  const organization = text(o, 'organization', { max: 200, required: true }).trim();
  if (organization.length < 2) throw new InputError('target.organization', 'requis');
  return { organization, role: text(o, 'role', { max: 200 }).trim() };
}

// ── latex.fix ─────────────────────────────────────────────────
export interface FixInput {
  code: string;
  lineCount: number;
  errors: { line?: number; message: string; context?: string }[];
  attempt: 1 | 2;
}
export interface FixEdit { start: number; end: number; replacement: string }

export function parseFixInput(raw: unknown): FixInput {
  const o = strictObject(raw, 'input', ['code', 'errors', 'attempt']);
  const code = text(o, 'code', { max: MAX_FIX_CODE_CHARS, required: true });
  if (!Array.isArray(o.errors) || o.errors.length === 0 || o.errors.length > 5) throw new InputError('errors', 'de 1 à 5 erreurs');
  const errors = o.errors.map((e, i) => {
    const item = strictObject(e, `errors[${i}]`, ['line', 'message', 'context']);
    const line = item.line === undefined || item.line === null ? undefined : Number(item.line);
    if (line !== undefined && (!Number.isInteger(line) || line < 1 || line > 100_000)) throw new InputError(`errors[${i}].line`, 'numéro de ligne invalide');
    return { line, message: text(item, 'message', { max: 300, required: true }), context: text(item, 'context', { max: 200 }) || undefined };
  });
  const attempt = o.attempt === undefined ? 1 : Number(o.attempt);
  if (attempt !== 1 && attempt !== 2) throw new InputError('attempt', 'deux tentatives au maximum');
  return { code, lineCount: code.split('\n').length, errors, attempt };
}

/** Modifications proposées : lignes existantes, sans chevauchement, nombre et taille bornés */
export function normalizeFixOutput(raw: string, input: FixInput): string {
  const parsed = parseObject(raw, 'latex.fix');
  if (!Array.isArray(parsed.edits)) throw new ProviderError('invalid_response', undefined, 'latex.fix');
  if (parsed.edits.length > MAX_EDITS) throw new ProviderError('invalid_response', undefined, 'latex.fix : trop de modifications');

  const edits: FixEdit[] = parsed.edits.map(item => {
    const e = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const start = Number(e.start);
    const end = Number(e.end);
    const replacement = typeof e.replacement === 'string' ? e.replacement.replace(/\r\n?/g, '\n') : null;
    const valid = Number.isInteger(start) && Number.isInteger(end)
      && start >= 1 && start <= input.lineCount + 1
      && end >= start - 1 && end <= input.lineCount
      && replacement !== null && replacement.length <= MAX_REPLACEMENT_CHARS
      // eslint-disable-next-line no-control-regex
      && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(replacement)
      && !replacement.includes('%%PHOTO%%') === !input.code.split('\n').slice(start - 1, end).join('\n').includes('%%PHOTO%%');
    if (!valid) throw new ProviderError('invalid_response', undefined, 'latex.fix : modification hors du document');
    return { start, end, replacement: replacement as string };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start <= edits[i - 1].end) throw new ProviderError('invalid_response', undefined, 'latex.fix : modifications qui se chevauchent');
  }
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
  return JSON.stringify({ edits, explanation });
}

// ── latex.rewrite ─────────────────────────────────────────────
export interface RewriteInput { cv: CvData; target: LatexTarget; lang: 'fr' | 'en' }
export interface RewriteFlag { path: string; reason: 'number' | 'unknown_skill' }

/**
 * Réponse du modèle fusionnée avec le CV d'origine : seuls les champs rédactionnels peuvent
 * changer. Un texte reformulé qui contient un nombre absent du CV est écarté (l'original est
 * conservé) et signalé, pour qu'aucun résultat chiffré ne soit inventé.
 */
export function normalizeRewriteOutput(raw: string, input: RewriteInput): string {
  const parsed = parseObject(raw, 'latex.rewrite');
  const source = input.cv;
  const known = new Set(numbersIn(JSON.stringify(source)));
  const flags: RewriteFlag[] = [];
  const cv: CvData = JSON.parse(JSON.stringify(source));

  const accept = (value: unknown, max: number, path: string): string | null => {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, max);
    if (!cleaned) return null;
    if (numbersIn(cleaned).some(n => !known.has(n))) {
      flags.push({ path, reason: 'number' });
      return null;
    }
    return cleaned;
  };

  cv.identity.headline = accept(parsed.headline, 200, 'identity.headline') ?? cv.identity.headline;
  cv.summary = accept(parsed.summary, 2000, 'summary') ?? cv.summary;

  const byId = <T extends { id?: unknown }>(value: unknown): Map<string, Record<string, unknown>> =>
    new Map((Array.isArray(value) ? value : [])
      .filter((x): x is T & Record<string, unknown> => typeof x === 'object' && x !== null && typeof (x as T).id === 'string')
      .map(x => [x.id as string, x]));

  const experiences = byId(parsed.experiences);
  for (const exp of cv.experiences) {
    const proposal = experiences.get(exp.id);
    if (!proposal || !Array.isArray(proposal.bullets)) continue;
    const bullets = proposal.bullets.slice(0, Math.max(exp.bullets.length, 1) + 1)
      .map((b, i) => accept(b, 600, `experiences.${exp.id}.bullets[${i}]`));
    // Une puce écartée annule la réécriture de l'expérience : l'original reste cohérent
    if (bullets.length && bullets.every(b => b !== null)) exp.bullets = bullets as string[];
  }

  const projects = byId(parsed.projects);
  for (const project of cv.projects) {
    const description = accept(projects.get(project.id)?.description, 600, `projects.${project.id}.description`);
    if (description) project.description = description;
  }

  // Compétences : réordonnées seulement, jamais ajoutées
  const skills = byId(parsed.skills);
  for (const group of cv.skills) {
    const proposed = skills.get(group.id)?.items;
    if (!Array.isArray(proposed)) continue;
    const original = new Map(group.items.map(item => [item.toLowerCase(), item]));
    const ordered: string[] = [];
    for (const item of proposed) {
      const match = typeof item === 'string' ? original.get(item.trim().toLowerCase()) : undefined;
      if (match && !ordered.includes(match)) ordered.push(match);
      else if (typeof item === 'string' && !match) flags.push({ path: `skills.${group.id}`, reason: 'unknown_skill' });
    }
    group.items = [...ordered, ...group.items.filter(item => !ordered.includes(item))];
  }

  const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .filter((s): s is string => typeof s === 'string')
    .map(s => s.replace(/\s+/g, ' ').trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 3);

  return JSON.stringify({ cv, flags, suggestions });
}

// ── Définitions ───────────────────────────────────────────────
export const LATEX_FEATURES = {
  'latex.generate': {
    id: 'latex.generate',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text'],
    output: 'text',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 85_000,
    maxOutputTokens: 3000,
    quotas: { perSubjectPerDay: 3, globalPerDay: 100, concurrency: 2 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['info', 'template', 'existing', 'target']);
      return {
        info:     text(o, 'info', { max: 8000, required: true }),
        template: text(o, 'template', { max: 20_000 }),
        existing: text(o, 'existing', { max: 30_000 }),
        target:   parseTarget(o.target),
      };
    },
    buildRequest: ({ info, template, existing, target }: { info: string; template: string; existing: string; target: LatexTarget }) => ({
      system: LATEX_GENERATE_SYSTEM,
      messages: userText(latexGenerateUser(info, template, existing, target)),
    }),
  },

  'latex.improve': {
    id: 'latex.improve',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text'],
    output: 'text',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 60_000,
    maxOutputTokens: 1800,
    quotas: { perSubjectPerDay: 15, globalPerDay: 400, concurrency: 4 },
    rateLimitPerMinute: 6,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['selection', 'instruction', 'context', 'target']);
      return {
        selection:   text(o, 'selection', { max: 8000, required: true }),
        instruction: text(o, 'instruction', { max: 1000, required: true }),
        context:     text(o, 'context', { max: 4000 }),
        target:      parseTarget(o.target),
      };
    },
    buildRequest: ({ selection, instruction, context, target }: { selection: string; instruction: string; context: string; target: LatexTarget }) => ({
      system: LATEX_IMPROVE_SYSTEM,
      messages: userText(latexImproveUser(selection, instruction, context, target)),
    }),
  },

  'latex.fix': {
    id: 'latex.fix',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 60_000,
    maxOutputTokens: 4000,
    quotas: { perSubjectPerDay: 10, globalPerDay: 300, concurrency: 2 },
    rateLimitPerMinute: 4,
    parseInput: parseFixInput,
    async buildRequest(input: FixInput) {
      const policy = await getRunnerPolicy();
      return { system: LATEX_FIX_SYSTEM, messages: userText(latexFixUser(input.code, input.errors, input.attempt, policy)) };
    },
    parseOutput: (content: string, input: FixInput) => normalizeFixOutput(content, input),
  },

  'latex.import.structure': {
    id: 'latex.import.structure',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 60_000,
    maxOutputTokens: 4000,
    quotas: { perSubjectPerDay: 5, globalPerDay: 150, concurrency: 2 },
    rateLimitPerMinute: 4,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['text', 'lang']);
      return {
        text: text(o, 'text', { max: 20_000, required: true }),
        lang: oneOf(o, 'lang', ['fr', 'en'] as const, 'fr'),
      };
    },
    buildRequest: ({ text: value, lang }: { text: string; lang: 'fr' | 'en' }) => ({
      system: LATEX_IMPORT_STRUCTURE_SYSTEM,
      messages: userText(latexImportStructureUser(value, lang)),
    }),
    parseOutput: (content: string) => JSON.stringify(normalizeCvData(parseObject(content, 'latex.import.structure'), 'lenient')),
  },

  'latex.import.ocr': {
    id: 'latex.import.ocr',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'vision'],
    output: 'text',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'large',
    timeoutMs: 60_000,
    maxOutputTokens: 3000,
    quotas: { perSubjectPerDay: 6, globalPerDay: 60, concurrency: 2 },
    rateLimitPerMinute: 4,
    parseInput(raw) {
      const o = strictObject(raw, 'input', ['image']);
      return { image: imageDataUrl(o, 'image', 4 * 1024 * 1024) };
    },
    buildRequest: ({ image }: { image: string }) => ({
      system: LATEX_IMPORT_OCR_SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', dataUrl: image, detail: 'high' },
        { type: 'text', text: LATEX_IMPORT_OCR_USER },
      ] }],
    }),
    parseOutput: (content: string) => stripFences(content).slice(0, 20_000),
  },

  'latex.rewrite': {
    id: 'latex.rewrite',
    section: SECTION,
    authLevel: 'public',
    personalData: true,
    requiredCapabilities: ['text', 'json'],
    output: 'json',
    promptVersion: LATEX_PROMPT_VERSION,
    bodyLimit: 'small',
    timeoutMs: 85_000,
    maxOutputTokens: 4000,
    quotas: { perSubjectPerDay: 5, globalPerDay: 150, concurrency: 2 },
    rateLimitPerMinute: 4,
    parseInput(raw): RewriteInput {
      const o = strictObject(raw, 'input', ['cv', 'target', 'lang']);
      const cv = normalizeCvData(o.cv, 'strict');
      if (!cv.identity.fullName && !cv.experiences.length && !cv.summary) throw new InputError('cv', 'CV vide');
      return { cv, target: parseTarget(o.target), lang: oneOf(o, 'lang', ['fr', 'en'] as const, 'fr') };
    },
    buildRequest: ({ cv, target, lang }: RewriteInput) => ({
      system: LATEX_REWRITE_SYSTEM,
      messages: userText(latexRewriteUser(JSON.stringify(cv), target, lang)),
    }),
    parseOutput: (content: string, input: RewriteInput) => normalizeRewriteOutput(content, input),
  },
} satisfies Record<string, FeatureDefinition>;

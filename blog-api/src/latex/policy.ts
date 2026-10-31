// blog-api/src/latex/policy.ts
// Politique de compilation de latex-runner (classes, paquets, commandes interdites), lue sur
// GET /policy : une seule source de vérité, transmise en LECTURE à l'assistant de correction.
// Elle est appliquée par le runner à chaque compilation : aucune réponse d'IA ne peut la modifier.

import { latexConfigFromEnv } from './compile';

export interface RunnerPolicy {
  classes: string[];
  packages: string[];
  forbiddenCommands: string[];
}

const CACHE_MS = 10 * 60 * 1000;

/** Repli si le runner ne répond pas : la liste du prompt latex.generate, toujours un sous-ensemble autorisé */
export const FALLBACK_POLICY: RunnerPolicy = {
  classes: ['article'],
  packages: ['array', 'babel', 'enumitem', 'fontenc', 'geometry', 'graphicx', 'hyperref', 'inputenc', 'lmodern', 'multicol', 'parskip', 'tabularx', 'titlesec', 'xcolor'],
  forbiddenCommands: ['\\write', '\\input', '\\include', '\\openin', '\\openout', '\\read', '\\csname', '\\catcode', '\\scantokens', '\\pdfobj', '\\pdffiledump', '\\directlua', '\\font', '\\special'],
};

const NAME = /^[A-Za-z][\w*@-]{0,40}$/;
const COMMAND = /^\\[A-Za-z]{1,40}$/;

function names(value: unknown, pattern: RegExp, max: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  return value.every(v => typeof v === 'string' && pattern.test(v)) ? value as string[] : null;
}

let cached: { policy: RunnerPolicy; at: number } | null = null;

export async function getRunnerPolicy(fetchImpl: typeof fetch = fetch): Promise<RunnerPolicy> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.policy;
  const config = latexConfigFromEnv();
  if (!config) return FALLBACK_POLICY;
  try {
    const res = await fetchImpl(`${config.runnerUrl}/policy`, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (!res.ok) return FALLBACK_POLICY;
    const body = await res.json() as Record<string, unknown>;
    const classes = names(body.classes, NAME, 10);
    const packages = names(body.packages, NAME, 200);
    const forbiddenCommands = names(body.forbiddenCommands, COMMAND, 200);
    if (!classes || !packages || !forbiddenCommands) return FALLBACK_POLICY;
    cached = { policy: { classes, packages, forbiddenCommands }, at: Date.now() };
    return cached.policy;
  } catch {
    return FALLBACK_POLICY;
  }
}

/** Tests : oublie la politique mise en cache */
export function resetRunnerPolicyCache(): void {
  cached = null;
}

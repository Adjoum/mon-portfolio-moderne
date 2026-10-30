// blog-api/src/ai/cli/checkModels.ts
// npm run ai:check-models — vérification gratuite (métadonnées) des modèles affectés.
// N'affiche jamais de clé. Code de sortie 1 si un modèle affecté n'est pas utilisable.

import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { checkConfiguredModels } from '../services/modelCheck';
import { PROVIDERS } from '../providers/registry';

/** Sous Linux, OpenAI_API_KEY et OPENAI_API_KEY sont deux variables différentes */
function misnamedKeys(): string[] {
  if (!fs.existsSync('.env')) return [];
  const names = fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map(l => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((n): n is string => !!n);
  return Object.values(PROVIDERS).flatMap(p => {
    const near = names.find(n => n !== p.apiKeyEnv && n.toUpperCase() === p.apiKeyEnv);
    return near && !names.includes(p.apiKeyEnv) ? [`${near} doit s'appeler ${p.apiKeyEnv}`] : [];
  });
}

async function main() {
  const rows = await checkConfiguredModels();
  console.log('Vérification par métadonnées uniquement : aucune génération, aucune facturation.\n');
  for (const r of rows) {
    const limits = [r.contextWindow && `contexte ${r.contextWindow}`, r.maxCompletionTokens && `sortie max ${r.maxCompletionTokens}`].filter(Boolean).join(', ');
    console.log(`${r.feature.padEnd(20)} ${`${r.provider}:${r.model}`.padEnd(30)} ${r.status.padEnd(12)} validée=${String(r.validated).padEnd(5)} en service=${r.effectiveModel ?? 'aucun'}${limits ? `  (${limits})` : ''}`);
  }
  const warnings = misnamedKeys();
  if (warnings.length) console.log(`\n⚠️  Nom de variable à corriger (ignoré sous Linux) : ${warnings.join(' ; ')}`);
  process.exitCode = rows.every(r => r.status === 'found') && warnings.length === 0 ? 0 : 1;
}

main().catch((err: Error) => {
  console.error('Vérification impossible :', err.name);
  process.exitCode = 2;
});

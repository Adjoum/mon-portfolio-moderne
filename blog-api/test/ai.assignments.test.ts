// P0.A2-bis — Affectations de modèles : données modifiables, indépendantes par fonctionnalité,
// jamais exécutées avant validation. Fournisseurs simulés : aucune requête payante.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import seed from '../src/ai/config/initial-assignments.json';
import { PROVIDERS } from '../src/ai/providers/registry';
import { PROVIDER_IDS } from '../src/ai/providers/types';
import { FEATURE_IDS } from '../src/ai/features/registry';
import { createMemoryQuotaService } from '../src/ai/services/quotas';
import { envAssignmentResolver, candidateFor } from '../src/ai/services/assignments';
import { checkConfiguredModels } from '../src/ai/services/modelCheck';
import { startFakeOpenAI, type FakeOpenAI } from './helpers/fakeOpenAI';
import { SECRET_CANARIES, findLeakedSecret } from './helpers/canaries';

const OPENAI_MODEL = seed['cv.generate'].model;
const GROQ_MODEL   = seed['agent.chat'].model;

const INPUT = { cv: { personal: { name: 'Awa' } }, lang: 'fr' };

let openai: FakeOpenAI;
let groq: FakeOpenAI;

const clearAiEnv = () => {
  for (const k of Object.keys(process.env)) {
    if (/^AI_ASSIGNMENT_|^AI_VALIDATED_ASSIGNMENTS$/.test(k)) delete process.env[k];
  }
};
const gateway = () => createApp({
  ai: { baseUrlOverrides: { openai: openai.url, groq: groq.url }, quotas: createMemoryQuotaService() },
});
const run = (feature: string, input: object) =>
  request(gateway()).post(`/api/ai/run/${feature}`).send({ input });

beforeAll(async () => {
  openai = await startFakeOpenAI();
  groq = await startFakeOpenAI();
});
afterAll(async () => {
  await openai.close();
  await groq.close();
});
beforeEach(() => {
  clearAiEnv();
  openai.calls.length = 0;
  groq.calls.length = 0;
  openai.behavior = { kind: 'ok' };
  groq.behavior = { kind: 'ok' };
});

describe('données initiales', () => {
  it('modèles initiaux demandés : OpenAI et Groq', () => {
    expect(OPENAI_MODEL).toBe('gpt-6-astra');
    expect(GROQ_MODEL).toBe('openai/gpt-oss-120b');
    expect(seed['cv.generate'].provider).toBe('openai');
    expect(seed['agent.chat'].provider).toBe('groq');
  });

  it('chaque fonctionnalité du registre a sa propre affectation', () => {
    for (const id of FEATURE_IDS) expect(candidateFor(id)?.provider, id).toBeDefined();
  });

  it('aucun identifiant de modèle dans le code : uniquement dans le fichier de données', () => {
    const src = path.join(__dirname, '..', 'src');
    const files = (function walk(d: string): string[] {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []);
    })(src);
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/gpt-\d|gpt-oss|llama-\d/);
  });

  it('les six fournisseurs disposent d’un adaptateur', () => {
    expect(PROVIDER_IDS).toHaveLength(6);
    for (const id of PROVIDER_IDS) expect(typeof PROVIDERS[id].createAdapter, id).toBe('function');
  });
});

describe('validation avant usage', () => {
  it('affectation non validée → 503 neutre, AUCUN appel au fournisseur', async () => {
    const res = await run('cv.review', INPUT);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_FEATURE_UNAVAILABLE');
    expect(openai.calls).toHaveLength(0);
  });

  it('clé présente mais non validée : fonctionnalité annoncée indisponible', async () => {
    const res = await request(gateway()).get('/api/ai/features');
    expect(res.body.features.every((f: { available: boolean }) => !f.available)).toBe(true);
  });

  it('validation par fonctionnalité : les autres restent bloquées', async () => {
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.review=openai:${OPENAI_MODEL}`;
    expect((await run('cv.review', INPUT)).status).toBe(200);
    expect((await run('cv.import.structure', { text: 'cv' })).status).toBe(503);
    expect(openai.calls).toHaveLength(1);
  });

  it('changer de modèle remet la fonctionnalité à « non validée »', async () => {
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.review=openai:${OPENAI_MODEL}`;
    process.env.AI_ASSIGNMENT_CV_REVIEW = 'openai:un-autre-modele';
    expect((await run('cv.review', INPUT)).status).toBe(503);
    expect(openai.calls).toHaveLength(0);
  });
});

describe('affectation indépendante par fonctionnalité', () => {
  it('une fonctionnalité sur Groq, une autre sur OpenAI', async () => {
    process.env.AI_ASSIGNMENT_CV_REVIEW = `groq:${GROQ_MODEL}`;
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.review=groq:${GROQ_MODEL},latex.improve=openai:${OPENAI_MODEL}`;

    expect((await run('cv.review', INPUT)).status).toBe(200);
    expect((await run('latex.improve', { selection: 'x', instruction: 'y' })).status).toBe(200);

    expect(groq.calls.map(c => c.body.model)).toEqual([GROQ_MODEL]);
    expect(openai.calls.map(c => c.body.model)).toEqual([OPENAI_MODEL]);
    expect(groq.calls[0].headers.authorization).toBe(`Bearer ${SECRET_CANARIES.GROQ_API_KEY}`);
    expect(openai.calls[0].headers.authorization).toBe(`Bearer ${SECRET_CANARIES.OPENAI_API_KEY}`);
  });

  it('fonctionnalité vision refusée sur un adaptateur sans image, aucun appel', async () => {
    process.env.AI_ASSIGNMENT_CV_IMPORT_OCR = `groq:${GROQ_MODEL}`;
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.import.ocr=groq:${GROQ_MODEL}`;
    const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(24).fill(0)]).toString('base64');
    expect((await run('cv.import.ocr', { image: png })).status).toBe(503);
    expect(groq.calls).toHaveLength(0);
  });

  it('paramètres d’affectation transmis et filtrés par adaptateur', async () => {
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.review=openai:${OPENAI_MODEL}`;
    await run('cv.review', INPUT);
    expect(openai.calls[0].body.reasoning_effort).toBe('low');
  });
});

describe('réponse vide d’un modèle à raisonnement', () => {
  it('limite épuisée par le raisonnement → erreur neutre, pas une réponse vide', async () => {
    process.env.AI_VALIDATED_ASSIGNMENTS = `cv.review=openai:${OPENAI_MODEL}`;
    openai.behavior = { kind: 'ok', content: '' };
    const res = await run('cv.review', INPUT);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_PROVIDER_ERROR');
  });
});

describe('assistants : plus aucun repli vers un modèle ancien', () => {
  it('non validée : aucun modèle en service, jamais un repli silencieux', () => {
    expect(envAssignmentResolver.resolve('agent.chat')).toMatchObject({ model: GROQ_MODEL, validated: false });
  });

  it('validation fonctionnalité par fonctionnalité', () => {
    process.env.AI_VALIDATED_ASSIGNMENTS = `agent.chat=groq:${GROQ_MODEL}`;
    expect(envAssignmentResolver.resolve('agent.chat')?.validated).toBe(true);
    expect(envAssignmentResolver.resolve('novamind.diagram')?.validated).toBe(false);
  });
});

describe('vérification gratuite par métadonnées', () => {
  beforeEach(() => {
    openai.models = [{ id: OPENAI_MODEL }];
    groq.models = [{ id: GROQ_MODEL, context_window: 131072, max_completion_tokens: 65536, active: true }];
    openai.modelListStatus = 200;
    groq.modelListStatus = 200;
    process.env.OPENAI_API_KEY = SECRET_CANARIES.OPENAI_API_KEY;
  });

  it('modèles trouvés, sans aucune génération', async () => {
    const rows = await checkConfiguredModels({ openai: openai.url, groq: groq.url });
    expect(rows).toHaveLength(9);
    expect(rows.every(r => r.status === 'found')).toBe(true);
    expect(rows.find(r => r.feature === 'agent.chat')).toMatchObject({ maxCompletionTokens: 65536, effectiveModel: null });
    expect(openai.calls).toHaveLength(0);
    expect(groq.calls).toHaveLength(0);
  });

  it('une seule requête par fournisseur', async () => {
    const before = openai.modelListCalls();
    await checkConfiguredModels({ openai: openai.url, groq: groq.url });
    expect(openai.modelListCalls() - before).toBe(1);
  });

  it('modèle absent, clé refusée, clé manquante', async () => {
    openai.models = [{ id: 'autre-modele' }];
    groq.modelListStatus = 401;
    let rows = await checkConfiguredModels({ openai: openai.url, groq: groq.url });
    expect(rows.find(r => r.feature === 'cv.review')?.status).toBe('not_found');
    expect(rows.find(r => r.feature === 'agent.chat')?.status).toBe('auth_error');

    delete process.env.OPENAI_API_KEY;
    process.env.AI_ASSIGNMENT_LATEX_GENERATE = 'gemini:modele';
    rows = await checkConfiguredModels({ openai: openai.url, groq: groq.url });
    expect(rows.find(r => r.feature === 'cv.review')?.status).toBe('no_key');
    expect(rows.find(r => r.feature === 'latex.generate')?.status).toBe('no_key');
  });

  it('le résultat ne contient aucune clé', async () => {
    expect(findLeakedSecret(JSON.stringify(await checkConfiguredModels({ openai: openai.url, groq: groq.url })))).toBeNull();
  });
});

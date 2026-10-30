// Centre d'administration multi-IA : /api/admin/ai/*
// Faux Supabase et faux fournisseurs locaux. Les règles SQL sont prouvées sur un vrai
// Postgres (supabase/tests/ai), le parcours complet sur la pile locale (supabase/tests/stack).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { PROVIDER_IDS, type ProviderId } from '../src/ai/providers/types';
import { startFakeSupabase, ANON_KEY, USER_ID, type FakeSupabase } from './helpers/fakeSupabase';
import { startFakeProvider, type FakeProvider } from './helpers/fakeProviders.mjs';
import { createMemoryStore } from './helpers/memoryStore';
import { allConsoleOutput, auditEvents } from './helpers/audit';

const NEW_KEY = 'CANARY_new_key_must_never_be_returned';
const STORED_KEY = 'CANARY_stored_key_must_never_be_returned';

let supabase: FakeSupabase;
const fakes = {} as Record<ProviderId, FakeProvider>;
let app: ReturnType<typeof createApp>;
const store = createMemoryStore();

const admin = () => supabase.token({ aal: 'aal2' });
const call = (method: 'get' | 'put' | 'post' | 'patch' | 'delete', path: string, token: string | null = admin()) => {
  const req = request(app)[method](`/api/admin/ai${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const fnCalled = (fn: string) => supabase.ai.calls.filter(c => c.fn === fn);

const ASSIGNMENT = { providerId: 'openai', modelId: 'modele-a', params: { temperature: 0.5 }, maxOutputTokens: 500, timeoutMs: 20_000, enabled: false, version: 1 };

const ROUTES: ['get' | 'put' | 'post' | 'patch' | 'delete', string][] = [
  ['get', '/overview'], ['get', '/providers/openai/models'], ['get', '/usage'], ['get', '/audit'],
  ['put', '/providers/openai/key'], ['delete', '/providers/openai/key'], ['post', '/providers/openai/test'],
  ['patch', '/providers/openai'], ['post', '/providers/openai/models/sync'], ['post', '/providers/openai/models'],
  ['patch', '/providers/openai/models'], ['delete', '/providers/openai/models?modelId=a'], ['post', '/providers/openai/models/restore'],
  ['put', '/providers/openai/models/pricing'], ['put', '/features/cv.generate/assignment'], ['post', '/features/cv.generate/test'],
  ['put', '/features/cv.generate/quotas'], ['put', '/budget'],
];

beforeAll(async () => {
  supabase = await startFakeSupabase();
  await Promise.all(PROVIDER_IDS.map(async id => { fakes[id] = await startFakeProvider(id); }));
  app = createApp({ ai: { store, baseUrlOverrides: Object.fromEntries(PROVIDER_IDS.map(id => [id, fakes[id].url])) } });
});
afterAll(async () => {
  await supabase.close();
  await Promise.all(PROVIDER_IDS.map(id => fakes[id].close()));
});
beforeEach(() => {
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  resetSupabaseAdminCaches();
  supabase.ai.reset();
  store.reset();
  store.invalidations = 0;
  store.keys.openai = STORED_KEY;
  for (const id of PROVIDER_IDS) {
    fakes[id].calls.length = 0;
    fakes[id].models = [{ id: 'modele-a' }, { id: 'modele-b' }];
    fakes[id].modelListStatus = 200;
    fakes[id].behavior = { kind: 'ok', content: '{"ok":true}' };
    fakes[id].queue = [];
    fakes[id].acceptedKeys = null;
  }
});

describe('contrôle d’accès', () => {
  it.each(ROUTES)('%s %s : anonyme → 401, sans toucher à la base', async (method, path) => {
    const res = await call(method, path, null).send({});
    expect(res.status).toBe(401);
    expect(supabase.ai.calls).toHaveLength(0);
  });

  it.each(ROUTES)('%s %s : utilisateur non administrateur → 403', async (method, path) => {
    const res = await call(method, path, supabase.token({ sub: USER_ID, aal: 'aal2' })).send({});
    expect(res.status).toBe(403);
    expect(supabase.ai.calls).toHaveLength(0);
  });

  it.each(ROUTES)('%s %s : administrateur sans MFA → 403 MFA_REQUIRED', async (method, path) => {
    const res = await call(method, path, supabase.token({ aal: 'aal1' })).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    expect(supabase.ai.calls).toHaveLength(0);
  });

  it('le jeton de l’administrateur est transmis à la base, qui revérifie ses droits', async () => {
    const token = admin();
    await call('get', '/overview', token);
    expect(fnCalled('ai_admin_overview')[0].token).toBe(token);
  });

  it('refus de la base (droits revérifiés) → 403', async () => {
    supabase.ai.responses.ai_admin_overview = { status: 403, body: { code: '42501', message: 'ai_forbidden' } };
    const res = await call('get', '/overview');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('migrations absentes : message explicite', async () => {
    supabase.ai.responses.ai_admin_overview = { status: 404, body: { code: 'PGRST202', message: 'not found' } };
    const res = await call('get', '/overview');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_NOT_MIGRATED');
  });

  it('corps trop volumineux refusé', async () => {
    const res = await call('put', '/budget').send({ dailyUsd: 1, monthlyUsd: 1, globalConcurrency: 1, x: 'y'.repeat(64 * 1024) });
    expect(res.status).toBe(413);
  });

  it('champ inconnu refusé', async () => {
    const res = await call('put', '/budget').send({ dailyUsd: 1, monthlyUsd: 1, globalConcurrency: 1, role: 'admin' });
    expect(res.status).toBe(400);
    expect(supabase.ai.calls).toHaveLength(0);
  });
});

describe('clés API', () => {
  beforeEach(() => {
    supabase.ai.responses.ai_admin_set_provider_key = { status: 200, body: { fingerprint: '0123456789abcdef' } };
    supabase.ai.responses.ai_admin_sync_models = { status: 200, body: { received: 2 } };
  });

  it('clé vérifiée chez le fournisseur, puis enregistrée, et confirmation sans la clé', async () => {
    const res = await call('put', '/providers/anthropic/key').send({ key: NEW_KEY });
    expect(res.status).toBe(200);
    expect(res.body.fingerprint).toBe('0123456789abcdef');
    expect(JSON.stringify(res.body)).not.toContain(NEW_KEY);
    expect(fakes.anthropic.modelListCalls()).toBeGreaterThan(0);
    const saved = fnCalled('ai_admin_set_provider_key')[0].args;
    expect(saved.p_key).toBe(NEW_KEY);
    expect(saved.p_fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(saved.p_fingerprint).not.toContain(NEW_KEY.slice(0, 8));
  });

  it('une clé valide alimente aussitôt le catalogue', async () => {
    await call('put', '/providers/groq/key').send({ key: NEW_KEY });
    expect(fnCalled('ai_admin_sync_models')[0].args.p_models).toHaveLength(2);
  });

  it('remplacement : même chemin, empreinte recalculée', async () => {
    await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    await call('put', '/providers/openai/key').send({ key: `${NEW_KEY}-2` });
    const [first, second] = fnCalled('ai_admin_set_provider_key');
    expect(first.args.p_fingerprint).not.toBe(second.args.p_fingerprint);
  });

  it('clé refusée par le fournisseur : rien n’est enregistré', async () => {
    fakes.openai.acceptedKeys = ['autre-cle'];
    const res = await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI_KEY_REJECTED');
    expect(fnCalled('ai_admin_set_provider_key')).toHaveLength(0);
  });

  it('fournisseur injoignable : rien n’est enregistré, aucune fausse confirmation', async () => {
    fakes.openai.modelListStatus = 503;
    const res = await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_PROVIDER_UNREACHABLE');
    expect(fnCalled('ai_admin_set_provider_key')).toHaveLength(0);
  });

  it('échec d’écriture en base : erreur explicite, jamais de succès', async () => {
    supabase.ai.responses.ai_admin_set_provider_key = { status: 500, body: { message: 'panne' } };
    const res = await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_STORE_ERROR');
  });

  it.each([['trop courte', 'abc'], ['avec espace', 'cle avec espace'], ['nombre', 12345678]])('format refusé : %s', async (_label, key) => {
    const before = fakes.openai.modelListCalls();
    const res = await call('put', '/providers/openai/key').send({ key });
    expect(res.status).toBe(400);
    expect(fakes.openai.modelListCalls()).toBe(before);
    expect(fnCalled('ai_admin_set_provider_key')).toHaveLength(0);
  });

  it('jamais de clé dans les réponses, les journaux ni l’audit', async () => {
    const res = await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    const overview = await call('get', '/overview');
    const logs = allConsoleOutput();
    expect(JSON.stringify([res.body, overview.body])).not.toContain('CANARY_');
    expect(logs).not.toContain(NEW_KEY);
    expect(JSON.stringify(auditEvents())).not.toContain(NEW_KEY);
  });

  it('cache invalidé dès la confirmation : la clé s’applique à la requête suivante', async () => {
    await call('put', '/providers/openai/key').send({ key: NEW_KEY });
    expect(store.invalidations).toBeGreaterThan(0);
  });

  it('suppression de clé', async () => {
    const res = await call('delete', '/providers/openai/key');
    expect(res.status).toBe(200);
    expect(fnCalled('ai_admin_delete_provider_key')).toHaveLength(1);
    expect(store.invalidations).toBe(1);
  });

  it('fournisseur inconnu', async () => {
    expect((await call('put', '/providers/mistral/key').send({ key: NEW_KEY })).status).toBe(404);
  });
});

describe('test de connexion', () => {
  it('catalogue lu avec la clé stockée, résultat enregistré, sans génération', async () => {
    const res = await call('post', '/providers/openai/test');
    expect(res.body).toMatchObject({ ok: true, modelCount: 2 });
    expect(fnCalled('ai_admin_record_provider_check')[0].args).toMatchObject({ p_provider: 'openai', p_ok: true });
    expect(fakes.openai.calls).toHaveLength(0);
  });

  it('clé refusée : état réel enregistré', async () => {
    fakes.openai.acceptedKeys = ['autre'];
    const res = await call('post', '/providers/openai/test');
    expect(res.body).toMatchObject({ ok: false, code: 'auth' });
    expect(fnCalled('ai_admin_record_provider_check')[0].args).toMatchObject({ p_ok: false, p_code: 'auth' });
  });

  it('sans clé stockée → 422', async () => {
    const res = await call('post', '/providers/gemini/test');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI_PROVIDER_WITHOUT_KEY');
  });
});

describe('catalogue', () => {
  it('actualisation : modèles du fournisseur transmis à la base', async () => {
    supabase.ai.responses.ai_admin_sync_models = { status: 200, body: { received: 2, added: 1 } };
    const res = await call('post', '/providers/openai/models/sync');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: 2, added: 1 });
    const models = fnCalled('ai_admin_sync_models')[0].args.p_models as { id: string }[];
    expect(models.map(m => m.id)).toEqual(['modele-a', 'modele-b']);
  });

  it('échec : tentative enregistrée, aucune fausse confirmation', async () => {
    fakes.openai.modelListStatus = 503;
    const res = await call('post', '/providers/openai/models/sync');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_SYNC_FAILED');
    expect(fnCalled('ai_admin_record_sync_failure')[0].args).toMatchObject({ p_provider: 'openai', p_code: 'unavailable' });
    expect(fnCalled('ai_admin_sync_models')).toHaveLength(0);
  });

  it('ajout manuel : identifiant libre, y compris avec une barre', async () => {
    const res = await call('post', '/providers/groq/models').send({ modelId: 'openai/gpt-oss-120b' });
    expect(res.status).toBe(200);
    expect(fnCalled('ai_admin_add_model')[0].args).toMatchObject({ p_provider: 'groq', p_model: 'openai/gpt-oss-120b' });
  });

  it.each(['../secret', 'a b', 'a?x=1', ''])('identifiant refusé avant la base : %j', async (modelId) => {
    const res = await call('post', '/providers/gemini/models').send({ modelId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AI_INVALID_MODEL_ID');
    expect(supabase.ai.calls).toHaveLength(0);
  });

  it('suppression : identifiant en paramètre de requête', async () => {
    const res = await call('delete', `/providers/groq/models?modelId=${encodeURIComponent('openai/gpt-oss-120b')}`);
    expect(res.status).toBe(200);
    expect(fnCalled('ai_admin_delete_model')[0].args).toMatchObject({ p_model: 'openai/gpt-oss-120b' });
  });

  it('modèle encore affecté : 409 et fonctionnalités concernées', async () => {
    supabase.ai.responses.ai_admin_delete_model = { status: 400, body: { message: 'ai_model_in_use', details: 'agent.chat,novamind.diagram' } };
    const res = await call('delete', '/providers/groq/models?modelId=x');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'AI_MODEL_IN_USE', features: ['agent.chat', 'novamind.diagram'] });
    expect(store.invalidations).toBe(0);
  });

  it('restauration et exclu réintroduit à la main', async () => {
    expect((await call('post', '/providers/openai/models/restore').send({ modelId: 'm' })).status).toBe(200);
    supabase.ai.responses.ai_admin_add_model = { status: 400, body: { message: 'ai_model_excluded' } };
    const res = await call('post', '/providers/openai/models').send({ modelId: 'm' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AI_MODEL_EXCLUDED');
  });

  it('activation et désactivation d’un modèle', async () => {
    await call('patch', '/providers/openai/models').send({ modelId: 'm', disabled: true });
    expect(fnCalled('ai_admin_set_model_disabled')[0].args).toMatchObject({ p_model: 'm', p_disabled: true });
  });

  it('tarif : USD saisis, micro-USD enregistrés', async () => {
    await call('put', '/providers/openai/models/pricing').send({ modelId: 'm', inputUsdPerMTok: 1.25, outputUsdPerMTok: 2.5 });
    expect(fnCalled('ai_admin_set_pricing')[0].args).toMatchObject({ p_input: 1_250_000, p_output: 2_500_000 });
  });

  it('tarif négatif refusé', async () => {
    const res = await call('put', '/providers/openai/models/pricing').send({ modelId: 'm', inputUsdPerMTok: -1, outputUsdPerMTok: 1 });
    expect(res.status).toBe(400);
  });
});

describe('affectations', () => {
  it('enregistrée par fonctionnalité, cache invalidé après confirmation', async () => {
    supabase.ai.responses.ai_admin_save_assignment = { status: 200, body: { version: 2 } };
    const res = await call('put', '/features/inkspace.generate/assignment').send(ASSIGNMENT);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: 2 });
    expect(fnCalled('ai_admin_save_assignment')[0].args).toMatchObject({
      p_feature: 'inkspace.generate', p_provider: 'openai', p_model: 'modele-a', p_params: { temperature: 0.5 },
      p_max_output_tokens: 500, p_timeout_ms: 20_000, p_enabled: false, p_expected_version: 1,
    });
    expect(store.invalidations).toBe(1);
  });

  it('échec : aucune invalidation, configuration précédente conservée', async () => {
    supabase.ai.responses.ai_admin_save_assignment = { status: 400, body: { message: 'ai_conflict' } };
    const res = await call('put', '/features/inkspace.generate/assignment').send(ASSIGNMENT);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AI_CONFLICT');
    expect(store.invalidations).toBe(0);
  });

  it.each([
    ['no_model', 'Choisissez'], ['key_missing', 'clé valide'], ['provider_disabled', 'désactivé'],
    ['not_validated', 'Testez'], ['unpriced', 'tarif'],
  ])('activation bloquée (%s) : raison explicite', async (blocker, message) => {
    supabase.ai.responses.ai_admin_save_assignment = { status: 400, body: { message: 'ai_activation_blocked', details: blocker } };
    const res = await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, enabled: true });
    expect(res.status).toBe(422);
    expect(res.body.blocker).toBe(blocker);
    expect(res.body.error).toContain(message);
  });

  it.each([
    ['paramètre hors liste blanche (Anthropic)', { providerId: 'anthropic', params: { temperature: 0.5 } }],
    ['température hors bornes', { params: { temperature: 3 } }],
    ['paramètre inconnu', { params: { logit_bias: 1 } }],
    ['paramètres non objet', { params: [1] }],
    ['tokens hors bornes', { maxOutputTokens: 0 }],
    ['délai hors bornes', { timeoutMs: 500 }],
    ['version absente', { version: undefined }],
  ])('%s → 400, rien en base', async (_label, over) => {
    const res = await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, ...over });
    expect(res.status).toBe(400);
    expect(supabase.ai.calls).toHaveLength(0);
  });

  it('fonctionnalité et fournisseur inconnus → 404', async () => {
    expect((await call('put', '/features/inconnue/assignment').send(ASSIGNMENT)).status).toBe(404);
    expect((await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, providerId: 'mistral' })).status).toBe(404);
  });
});

describe('test de compatibilité', () => {
  const TEST = { providerId: 'openai', modelId: 'modele-a', params: {}, confirmBilling: true };

  it('sans confirmation de facturation : aucun appel', async () => {
    const res = await call('post', '/features/cv.generate/test').send({ ...TEST, confirmBilling: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AI_BILLING_NOT_CONFIRMED');
    expect(fakes.openai.calls).toHaveLength(0);
  });

  it('capacités requises testées une à une, résultat enregistré', async () => {
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'compatible', capabilities: ['text', 'json'] });
    expect(fakes.openai.calls).toHaveLength(2);
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_feature: 'cv.generate', p_status: 'compatible', p_capabilities: ['text', 'json'] });
  });

  it('OCR : sonde vision avec une image', async () => {
    await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(JSON.stringify(fakes.openai.calls.at(-1)?.body)).toContain('image_url');
  });

  it('modèle qui refuse l’image : incompatible, capacités partielles enregistrées', async () => {
    // Première sonde (texte) acceptée, seconde (image) refusée
    fakes.openai.queue = [{ kind: 'ok', content: 'OK' }, { kind: 'error', status: 400, body: { error: { message: 'image non prise en charge' } } }];
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(fakes.openai.calls).toHaveLength(2);
    expect(res.body.status).toBe('incompatible');
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_status: 'incompatible', p_capabilities: ['text'] });
  });

  it('fournisseur sans entrée image (Groq) : OCR incompatible, sans aucun appel', async () => {
    store.keys.groq = STORED_KEY;
    fakes.groq.behavior = { kind: 'ok', content: 'rouge' };
    const res = await call('post', '/features/cv.import.ocr/test').send({ ...TEST, providerId: 'groq' });
    expect(res.body).toMatchObject({ status: 'incompatible', code: 'vision_unsupported', capabilities: [] });
    expect(fakes.groq.calls).toHaveLength(0);
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_status: 'incompatible' });
  });

  it('JSON invalide : incompatible avec une fonctionnalité JSON', async () => {
    fakes.openai.behavior = { kind: 'ok', content: 'pas du json' };
    const res = await call('post', '/features/inkspace.generate/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'incompatible', capabilities: ['text'] });
  });

  it('panne du fournisseur : sans conclusion, rien n’est enregistré', async () => {
    fakes.openai.behavior = { kind: 'error', status: 503, body: {} };
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_TEST_INCONCLUSIVE');
    expect(fnCalled('ai_admin_record_compat')).toHaveLength(0);
  });

  it('aucune donnée de visiteur dans une sonde', async () => {
    await call('post', '/features/cv.generate/test').send(TEST);
    expect(fakes.openai.calls.every(c => c.body.max_completion_tokens <= 256)).toBe(true);
  });

  it('sonde tracée dans l’historique', async () => {
    await call('post', '/features/cv.generate/test').send(TEST);
    expect(store.events.at(-1)).toMatchObject({ kind: 'probe', feature: 'cv.generate', provider: 'openai', outcome: 'ok' });
  });
});

describe('quotas et budget', () => {
  it('quotas et sous-budgets par fonctionnalité', async () => {
    supabase.ai.responses.ai_admin_save_quotas = { status: 200, body: { version: 2 } };
    const res = await call('put', '/features/cv.generate/quotas').send({
      perSubjectPerDay: 3, globalPerDay: 50, perMinute: 6, concurrency: 2, dailyBudgetUsd: 1.5, monthlyBudgetUsd: null, version: 1,
    });
    expect(res.status).toBe(200);
    expect(fnCalled('ai_admin_save_quotas')[0].args).toMatchObject({ p_daily_budget: 1_500_000, p_monthly_budget: null, p_per_minute: 6 });
  });

  it('budget global configurable', async () => {
    await call('put', '/budget').send({ dailyUsd: 5, monthlyUsd: 30, globalConcurrency: 8 });
    expect(fnCalled('ai_admin_save_budget')[0].args).toEqual({ p_daily: 5_000_000, p_monthly: 30_000_000, p_concurrency: 8 });
  });

  it.each([{ dailyUsd: -1, monthlyUsd: 1, globalConcurrency: 1 }, { dailyUsd: 1, monthlyUsd: 'x', globalConcurrency: 1 }, { dailyUsd: 1, monthlyUsd: 1, globalConcurrency: 0 }])('budget invalide refusé %#', async (body) => {
    expect((await call('put', '/budget').send(body)).status).toBe(400);
    expect(supabase.ai.calls).toHaveLength(0);
  });
});

describe('vue d’ensemble', () => {
  it('paramètres disponibles par fournisseur, état de la base', async () => {
    supabase.ai.responses.ai_admin_overview = { status: 200, body: { providers: [], features: [] } };
    const res = await call('get', '/overview');
    expect(res.body.runtime).toEqual({ databaseConfigured: true });
    expect(res.body.paramsByProvider.anthropic).not.toContain('temperature');
    expect(res.body.paramsByProvider.openai).toContain('temperature');
  });

  it('jamais mis en cache', async () => {
    expect((await call('get', '/audit')).headers['cache-control']).toBe('no-store');
  });
});

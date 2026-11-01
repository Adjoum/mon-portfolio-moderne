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

  it('OCR : sonde vision avec une image PNG synthétique valide, détail bas', async () => {
    fakes.openai.behavior = { kind: 'vision' };
    await call('post', '/features/cv.import.ocr/test').send(TEST);
    const part = fakes.openai.calls.at(-1)!.body.messages.at(-1).content.find((p: { type: string }) => p.type === 'image_url');
    expect(part.image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(part.image_url.detail).toBe('low');
    // Le code à lire n'est jamais écrit dans le texte de la requête
    const text = JSON.stringify(fakes.openai.calls.at(-1)!.body.messages.map((m: { content: unknown }) => m.content)).replace(/data:image[^"]+/g, '');
    expect(text).not.toMatch(/\b[ACEHKLPRTX3479]{3}\b/);
  });

  it.each(['cv.import.ocr', 'latex.import.ocr'])('%s : modèle réellement multimodal → vision confirmée, image vraiment lue', async featureId => {
    fakes.openai.behavior = { kind: 'vision' };
    const res = await call('post', `/features/${featureId}/test`).send(TEST);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'compatible', capabilities: ['text', 'vision'], failedCapability: null, code: null, recorded: true });
    expect(res.body.vision.received).toBe(res.body.vision.expected);
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({
      p_feature: featureId, p_status: 'compatible', p_capabilities: ['text', 'vision'], p_failed_capability: null,
      p_details: { matrixVersion: expect.any(String), vision: { expected: res.body.vision.expected } },
    });
  });

  it('chaque sonde tire un nouveau code : une réponse mémorisée échoue', async () => {
    fakes.openai.behavior = { kind: 'vision' };
    const first = (await call('post', '/features/cv.import.ocr/test').send(TEST)).body.vision.expected;
    fakes.openai.queue = [{ kind: 'ok', content: 'OK' }, { kind: 'ok', content: first }];
    let replayed;
    // Tirage identique possible (1 sur 2 184) : on recommence jusqu'à obtenir un autre code
    for (let i = 0; i < 5; i++) {
      replayed = (await call('post', '/features/cv.import.ocr/test').send(TEST)).body;
      if (replayed.vision.expected !== first) break;
      fakes.openai.queue = [{ kind: 'ok', content: 'OK' }, { kind: 'ok', content: first }];
    }
    expect(replayed).toMatchObject({ status: 'incompatible', failedCapability: 'vision', code: 'vision_misread' });
  });

  it('modèle sans vision : refus réel du fournisseur → incompatible confirmé, « texte uniquement »', async () => {
    fakes.openai.behavior = { kind: 'text-only' };
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(fakes.openai.calls).toHaveLength(2);
    expect(res.body).toMatchObject({ status: 'incompatible', capabilities: ['text'], failedCapability: 'vision', code: 'vision_unsupported' });
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_status: 'incompatible', p_capabilities: ['text'], p_failed_capability: 'vision', p_code: 'vision_unsupported' });
  });

  it('modèle qui répond sans lire l’image (réponse textuelle) → incompatible, jamais un succès', async () => {
    fakes.openai.behavior = { kind: 'ok', content: 'rouge' };
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'incompatible', failedCapability: 'vision', code: 'vision_misread', vision: { received: 'rouge' } });
  });

  it('modèle qui dit ne pas voir l’image → vision non prise en charge', async () => {
    fakes.openai.behavior = { kind: 'ok', content: 'I cannot see images, I am a text-only model.' };
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'incompatible', code: 'vision_unsupported' });
  });

  it('requête mal construite (image refusée) → erreur de configuration, aucune conclusion sur le modèle', async () => {
    fakes.openai.queue = [{ kind: 'ok', content: 'OK' }, { kind: 'error', status: 400, body: { error: { message: 'The image data you provided does not represent a valid image.', type: 'invalid_request_error', param: null, code: 'invalid_image_format' } } }];
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'config_error', capabilities: ['text'], failedCapability: 'vision', code: 'invalid_image' });
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_status: 'config_error' });
  });

  it('autres fournisseurs : même sonde, format propre à chaque API', async () => {
    for (const provider of ['groq', 'xai', 'gemini', 'openrouter', 'anthropic'] as const) {
      store.keys[provider] = STORED_KEY;
      fakes[provider].behavior = { kind: 'vision' };
      const res = await call('post', '/features/latex.import.ocr/test').send({ ...TEST, providerId: provider });
      expect(res.body, provider).toMatchObject({ status: 'compatible', capabilities: ['text', 'vision'] });
      fakes[provider].behavior = { kind: 'text-only' };
      const refused = await call('post', '/features/latex.import.ocr/test').send({ ...TEST, providerId: provider });
      expect(refused.body, provider).toMatchObject({ status: 'incompatible', failedCapability: 'vision', code: 'vision_unsupported' });
    }
    // Groq : pas de champ detail (non documenté)
    const groqImage = fakes.groq.calls.find(c => JSON.stringify(c.body).includes('image_url'))!.body.messages.at(-1).content.find((p: { type: string }) => p.type === 'image_url');
    expect(Object.keys(groqImage.image_url)).toEqual(['url']);
  });

  it('paramètre refusé par le fournisseur : retiré, réponse obtenue, puis signalé à retirer (pas de validation)', async () => {
    const refusal = { kind: 'error' as const, status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0.5 with this model. Only the default (1) value is supported.", type: 'invalid_request_error', param: 'temperature', code: 'unsupported_value' } } };
    fakes.openai.queue = [refusal, { kind: 'ok', content: 'OK' }, refusal, { kind: 'ok', content: '{"ok":true}' }];
    const res = await call('post', '/features/cv.generate/test').send({ ...TEST, params: { temperature: 0.5 } });
    expect(res.body).toMatchObject({ status: 'config_error', code: 'unsupported_parameter', param: 'temperature', rejectedParams: ['temperature'], capabilities: ['text', 'json'] });
    // Le nouvel essai ne contient plus le paramètre refusé
    expect(fakes.openai.calls[1].body.temperature).toBeUndefined();
    expect(fnCalled('ai_admin_record_compat')[0].args).toMatchObject({ p_status: 'config_error', p_details: { rejectedParams: ['temperature'] } });
  });

  it('champ de limite refusé (max_tokens) : corrigé automatiquement, test valide', async () => {
    store.keys.openrouter = STORED_KEY;
    const refusal = { kind: 'error' as const, status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: 'invalid_request_error', param: 'max_tokens', code: 'unsupported_parameter' } } };
    fakes.openrouter.queue = [refusal, { kind: 'ok', content: 'OK' }, refusal, { kind: 'ok', content: '{"ok":true}' }];
    const res = await call('post', '/features/cv.generate/test').send({ ...TEST, providerId: 'openrouter' });
    expect(res.body).toMatchObject({ status: 'compatible', capabilities: ['text', 'json'], adjustments: ['output_limit_field:max_completion_tokens'] });
    expect(fakes.openrouter.calls[0].body.max_tokens).toBeDefined();
    expect(fakes.openrouter.calls[1].body).toMatchObject({ max_completion_tokens: expect.any(Number) });
    expect(fakes.openrouter.calls[1].body.max_tokens).toBeUndefined();
  });

  it('modèle servi uniquement par l’API Responses : repli automatique, image en input_image', async () => {
    const refusal = { kind: 'error' as const, status: 404, body: { error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.', type: 'invalid_request_error', param: 'model', code: null } } };
    fakes.openai.queue = [refusal, { kind: 'vision' }, refusal, { kind: 'vision' }];
    const res = await call('post', '/features/cv.import.ocr/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'compatible', capabilities: ['text', 'vision'], adjustments: ['endpoint:responses'] });
    expect(fakes.openai.calls.map(c => c.url)).toEqual(['/v1/chat/completions', '/v1/responses', '/v1/chat/completions', '/v1/responses']);
    expect(JSON.stringify(fakes.openai.calls[3].body)).toContain('input_image');
    expect(fakes.openai.calls[3].body).toMatchObject({ store: false, max_output_tokens: expect.any(Number) });
  });

  it('réflexion qui épuise la limite : une relance plus large, puis conclusion', async () => {
    // Réponse vide avec finish_reason « length » : toute la limite est partie en réflexion
    const truncated = { kind: 'error' as const, status: 200, body: { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 2048 } } };
    fakes.openai.queue = [truncated, { kind: 'ok', content: 'OK' }, { kind: 'ok', content: '{"ok":true}' }];
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'compatible', adjustments: ['probe_output_limit:2048'] });
    expect(fakes.openai.calls[1].body.max_completion_tokens).toBe(2048);
  });

  it.each([
    [401, { error: { message: 'Incorrect API key provided: sk-...abcd', code: 'invalid_api_key' } }, 502, 'AI_TEST_INCONCLUSIVE', 'auth'],
    [429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } }, 502, 'AI_TEST_INCONCLUSIVE', 'quota_exceeded'],
    [429, { error: { message: 'credit', type: 'insufficient_quota', code: 'credit_balance_exhausted' } }, 502, 'AI_TEST_INCONCLUSIVE', 'quota_exceeded'],
    [429, { error: { message: 'Rate limit reached for requests', type: 'requests', code: 'rate_limit_exceeded' } }, 502, 'AI_TEST_INCONCLUSIVE', 'rate_limited'],
  ])('HTTP %s : cause distinguée, sans conclusion ni enregistrement', async (status, body, httpStatus, code, reason) => {
    fakes.openai.behavior = { kind: 'error', status, body };
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.status).toBe(httpStatus);
    expect(res.body).toMatchObject({ code, reason });
    expect(fnCalled('ai_admin_record_compat')).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain('sk-');
  });

  it.each([
    [404, { error: { message: 'The model `x` does not exist or you do not have access to it.', type: 'invalid_request_error', code: 'model_not_found' } }, 'model_not_found'],
    [400, { error: { message: 'Your organization must be verified to use the model `x`.', type: 'invalid_request_error', code: null } }, 'permission_denied'],
    [403, { error: { message: 'Country, region, or territory not supported', code: 'unsupported_country_region_territory' } }, 'permission_denied'],
    [400, { error: { message: "This model's maximum context length is 1000 tokens.", code: 'context_length_exceeded' } }, 'context_too_long'],
    [413, { error: { message: 'Request too large' } }, 'payload_too_large'],
    [400, { error: { message: 'Invalid JSON body' } }, 'bad_request'],
  ])('HTTP %s : %s → erreur de configuration, pas une incompatibilité du modèle', async (status, body, code) => {
    fakes.openai.behavior = { kind: 'error', status, body };
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.body).toMatchObject({ status: 'config_error', code, failedCapability: 'text' });
  });

  it('matrice : paramètre refusé par le modèle documenté → erreur de configuration, AUCUNE requête', async () => {
    fakes.openai.models = [{ id: 'gpt-5-nano' }];
    const res = await call('post', '/features/cv.import.ocr/test').send({ ...TEST, modelId: 'gpt-5-nano', params: { temperature: 0.2 } });
    expect(res.body).toMatchObject({ status: 'config_error', code: 'unsupported_parameter', param: 'temperature', recorded: false });
    expect(res.body.message).toContain('Température');
    expect(fakes.openai.calls).toHaveLength(0);
  });

  it('modèle absent du catalogue du compte : vérification gratuite, aucune génération ; « tester quand même » possible', async () => {
    const res = await call('post', '/features/cv.generate/test').send({ ...TEST, modelId: 'inconnu-xyz' });
    expect(res.body).toMatchObject({ status: 'config_error', code: 'model_not_listed', recorded: false });
    expect(fakes.openai.calls).toHaveLength(0);
    const forced = await call('post', '/features/cv.generate/test').send({ ...TEST, modelId: 'inconnu-xyz', allowUnlisted: true });
    expect(forced.body.status).toBe('compatible');
    expect(fakes.openai.calls.length).toBeGreaterThan(0);
  });

  it('budget du centre IA atteint : sonde refusée avant tout appel', async () => {
    supabase.ai.responses.ai_admin_models = { status: 200, body: { models: [{ modelId: 'modele-a', pricing: { inputPerMTok: 1_000_000, outputPerMTok: 2_000_000 } }] } };
    supabase.ai.responses.ai_admin_overview = { status: 200, body: { budget: { dailyLimitMicroUsd: 5_000_000, monthlyLimitMicroUsd: 30_000_000, dayCostMicroUsd: 4_999_990, monthCostMicroUsd: 10 }, features: [] } };
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(fakes.openai.calls).toHaveLength(0);
  });

  it('estimation gratuite avant autorisation : requêtes, tokens et coût maximal', async () => {
    supabase.ai.responses.ai_admin_models = { status: 200, body: { models: [{ modelId: 'gpt-5-nano', pricing: { inputPerMTok: 50_000, outputPerMTok: 400_000 } }] } };
    const res = await call('get', '/features/latex.import.ocr/test-estimate?providerId=openai&modelId=gpt-5-nano');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ requests: 2, maxRequests: 4, steps: ['text', 'vision'], priced: true, profile: { reasoning: true, visionDocumented: true } });
    // Entrée : 2 × (60 + 2 200) tokens à 0,05 $ / M ; sortie : 2 sondes × (1 024 + relance 2 048) à 0,40 $ / M
    expect(res.body).toMatchObject({ inputTokens: 4520, outputTokens: 6144 });
    expect(res.body.maxCostMicroUsd).toBe(Math.ceil((4520 * 50_000 + 6144 * 400_000) / 1_000_000));
    expect(fakes.openai.calls).toHaveLength(0);
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

  it('aucune donnée de visiteur dans une sonde ; limite de sortie bornée (prudente si le modèle est inconnu)', async () => {
    await call('post', '/features/cv.generate/test').send(TEST);
    expect(fakes.openai.calls.every(c => c.body.max_completion_tokens <= 1024)).toBe(true);
    expect(JSON.stringify(fakes.openai.calls.map(c => c.body.messages))).not.toMatch(/Awa|Konan|@/);
  });

  it('modèle sans raisonnement connu : limite courte (256)', async () => {
    fakes.openai.models = [{ id: 'gpt-5-chat-latest' }];
    await call('post', '/features/cv.generate/test').send({ ...TEST, modelId: 'gpt-5-chat-latest' });
    expect(fakes.openai.calls.every(c => c.body.max_completion_tokens === 256)).toBe(true);
  });

  it('sonde tracée dans l’historique', async () => {
    await call('post', '/features/cv.generate/test').send(TEST);
    expect(store.events.at(-1)).toMatchObject({ kind: 'probe', feature: 'cv.generate', provider: 'openai', outcome: 'ok' });
  });

  it('coût de la sonde compté au tarif du modèle testé, même non affecté', async () => {
    supabase.ai.responses.ai_admin_models = { status: 200, body: { models: [{ modelId: 'modele-a', pricing: { inputPerMTok: 1_000_000, outputPerMTok: 2_000_000 } }] } };
    const res = await call('post', '/features/cv.generate/test').send(TEST);
    // Deux sondes (texte, JSON) de 120 tokens en entrée et 40 en sortie chacune
    expect(res.body.estimatedCostMicroUsd).toBe(400);
    expect(store.events.at(-1)).toMatchObject({ kind: 'probe', costMicroUsd: 400 });
  });
});

describe('disponibilité et matrice de capacités', () => {
  it('disponibilité vérifiée gratuitement (catalogue), sans génération', async () => {
    const yes = await call('post', '/providers/openai/models/check').send({ modelId: 'modele-a' });
    expect(yes.body).toMatchObject({ status: 'available' });
    const no = await call('post', '/providers/openai/models/check').send({ modelId: 'gpt-5.6-luna' });
    expect(no.body).toMatchObject({ status: 'not_listed', profile: { visionDocumented: true, rule: 'openai:gpt-5.6-luna' } });
    expect(fakes.openai.calls).toHaveLength(0);
  });

  it('clé refusée lors de la vérification de disponibilité : cause « clé »', async () => {
    fakes.openai.acceptedKeys = ['autre-cle'];
    const res = await call('post', '/providers/openai/models/check').send({ modelId: 'modele-a' });
    fakes.openai.acceptedKeys = null;
    expect(res.body.status).toBe('key_rejected');
  });

  it('catalogue enrichi par la matrice : un indice, jamais une validation', async () => {
    supabase.ai.responses.ai_admin_models = { status: 200, body: { models: [{ modelId: 'gpt-5-nano' }, { modelId: 'gpt-4.1-mystere' }], excluded: [] } };
    const res = await call('get', '/providers/openai/models');
    expect(res.body.matrixVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(res.body.models[0].profile).toMatchObject({ visionDocumented: true, reasoning: true, rejectedParams: expect.arrayContaining(['temperature']) });
    // Famille GPT inconnue de la matrice : rien n'est supposé
    expect(res.body.models[1].profile).toMatchObject({ visionDocumented: null, reasoning: null, rule: null });
  });

  it.each([
    ['gpt-5-nano', { temperature: 0.3 }, 'model'],
    ['gpt-5-mini', { reasoning_effort: 'none' }, 'effort'],
    ['gpt-5.6-luna', { temperature: 0.3 }, 'reasoning'],
    ['gpt-6-astra', { reasoning_effort: 'none' }, 'effort'],
  ])('affectation %s %j refusée avec une explication (%s)', async (modelId, params, reason) => {
    const res = await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, modelId, params });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'AI_PARAM_REJECTED', reason });
    expect(fnCalled('ai_admin_save_assignment')).toHaveLength(0);
  });

  it('gpt-5.6-luna : température acceptée avec l’effort « none »', async () => {
    supabase.ai.responses.ai_admin_save_assignment = { status: 200, body: { version: 2 } };
    const res = await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, modelId: 'gpt-5.6-luna', params: { temperature: 0.3, reasoning_effort: 'none' } });
    expect(res.status).toBe(200);
  });

  it('identifiant inconnu saisi à la main : accepté, aucune capacité supposée', async () => {
    supabase.ai.responses.ai_admin_save_assignment = { status: 200, body: { version: 2 } };
    const res = await call('put', '/features/inkspace.generate/assignment').send({ ...ASSIGNMENT, modelId: 'gpt-9-inconnu-2027', params: {} });
    expect(res.status).toBe(200);
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

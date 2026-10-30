// P1.A — Contrat commun des six adaptateurs, contre un faux serveur au format réel de chaque API.
// Aucune requête payante : tout reste sur 127.0.0.1, avec des clés factices.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PROVIDERS } from '../src/ai/providers/registry';
import { PROVIDER_IDS, ProviderError, type NormalizedRequest, type ProviderAdapter, type ProviderId } from '../src/ai/providers/types';
import { isValidModelId } from '../src/ai/providers/modelId';
import { startFakeProvider, type FakeProvider } from './helpers/fakeProviders.mjs';

const KEY = 'CANARY_provider_key_should_never_leak';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const fakes = {} as Record<ProviderId, FakeProvider>;
const adapters = {} as Record<ProviderId, ProviderAdapter>;

const signal = () => AbortSignal.timeout(2000);
const ctx = (model = 'modele-test') => ({ apiKey: KEY, model, signal: signal() });

const request = (over: Partial<NormalizedRequest> = {}): NormalizedRequest => ({
  system: 'Consigne système',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'Bonjour' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Salut' }] },
    { role: 'user', content: [{ type: 'text', text: 'Suite' }] },
  ],
  maxOutputTokens: 321,
  params: {},
  ...over,
});

const expectCode = async (promise: Promise<unknown>, code: string) => {
  const err = await promise.then(() => null, e => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect((err as ProviderError).code).toBe(code);
  return err as ProviderError;
};

beforeAll(async () => {
  await Promise.all(PROVIDER_IDS.map(async id => {
    fakes[id] = await startFakeProvider(id);
    adapters[id] = PROVIDERS[id].createAdapter(fakes[id].url);
  }));
});
afterAll(async () => { await Promise.all(PROVIDER_IDS.map(id => fakes[id].close())); });
beforeEach(() => {
  for (const id of PROVIDER_IDS) {
    fakes[id].calls.length = 0;
    fakes[id].behavior = { kind: 'ok', content: 'Réponse simulée' };
    fakes[id].models = [];
    fakes[id].modelListStatus = 200;
  }
});

describe.each(PROVIDER_IDS)('contrat %s', (id) => {
  it('génère une réponse normalisée, avec consommation', async () => {
    const result = await adapters[id].generate(request(), ctx());
    expect(result.content).toBe('Réponse simulée');
    expect(result.usage?.inputTokens).toBe(120);
    expect(result.usage?.outputTokens).toBeGreaterThanOrEqual(40);
    expect(fakes[id].calls).toHaveLength(1);
  });

  it('la clé part en en-tête, jamais dans l’URL ni le corps', async () => {
    await adapters[id].generate(request(), ctx());
    await adapters[id].listModels({ apiKey: KEY, signal: signal() });
    const call = fakes[id].calls[0];
    expect(call.url).not.toContain(KEY);
    expect(JSON.stringify(call.body)).not.toContain(KEY);
    expect(JSON.stringify(call.headers)).toContain(KEY);
  });

  it('la clé n’apparaît jamais dans une erreur', async () => {
    fakes[id].behavior = { kind: 'error', status: 500, body: { error: { message: `erreur avec ${KEY}` } } };
    const err = await expectCode(adapters[id].generate(request(), ctx()), 'unavailable');
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain(KEY);
  });

  it('modèle, limite et consigne système transmis', async () => {
    await adapters[id].generate(request(), ctx('modele-precis'));
    expect(JSON.stringify(fakes[id].calls[0])).toContain('modele-precis');
    const body = JSON.stringify(fakes[id].calls[0].body);
    expect(body).toContain('321');
    expect(body).toContain('Consigne système');
  });

  it('un seul rôle système, jamais mélangé aux messages visiteurs', async () => {
    await adapters[id].generate(request(), ctx());
    const body = fakes[id].calls[0].body;
    const messages = body.messages ?? body.contents ?? body.input;
    const system = (messages as { role?: string }[]).filter(m => m.role === 'system');
    expect(system.length).toBeLessThanOrEqual(1);
  });

  it('paramètres hors liste blanche écartés', async () => {
    await adapters[id].generate(request({ params: { temperature: 0.2, frequency_penalty: 1.5, seed: 7 } }), ctx());
    const body = JSON.stringify(fakes[id].calls[0].body);
    if (!adapters[id].supportedParams.has('frequency_penalty')) expect(body).not.toContain('1.5');
    if (!adapters[id].supportedParams.has('temperature')) expect(body).not.toContain('0.2');
  });

  it('401 ou clé refusée → auth', async () => {
    fakes[id].acceptedKeys = ['autre-cle'];
    await expectCode(adapters[id].generate(request(), ctx()), 'auth');
    await expectCode(adapters[id].listModels({ apiKey: KEY, signal: signal() }), 'auth');
    fakes[id].acceptedKeys = null;
  });

  it.each([
    [404, 'model_not_found'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'bad_request'],
  ])('HTTP %i → %s', async (status, code) => {
    fakes[id].behavior = { kind: 'error', status, body: { error: { message: 'détail' } } };
    await expectCode(adapters[id].generate(request(), ctx()), code);
  });

  it('réponse vide → invalid_response, jamais un succès vide', async () => {
    fakes[id].behavior = { kind: 'ok', content: '   ' };
    await expectCode(adapters[id].generate(request(), ctx()), 'invalid_response');
  });

  it('corps illisible → invalid_response', async () => {
    fakes[id].behavior = { kind: 'malformed' };
    await expectCode(adapters[id].generate(request(), ctx()), 'invalid_response');
  });

  it('délai dépassé → timeout, appel interrompu', async () => {
    fakes[id].behavior = { kind: 'hang' };
    await expectCode(adapters[id].generate(request(), { apiKey: KEY, model: 'm', signal: AbortSignal.timeout(50) }), 'timeout');
  });

  it('annulation par le visiteur → aborted', async () => {
    fakes[id].behavior = { kind: 'hang' };
    const controller = new AbortController();
    const pending = adapters[id].generate(request(), { apiKey: KEY, model: 'm', signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expectCode(pending, 'aborted');
  });

  it('catalogue normalisé, sans aucune génération', async () => {
    fakes[id].models = [{ id: 'modele-a' }, { id: 'vendor/modele-b:free' }];
    const models = await adapters[id].listModels({ apiKey: KEY, signal: signal() });
    expect(models.map(m => m.id)).toEqual(['modele-a', 'vendor/modele-b:free']);
    expect(fakes[id].calls).toHaveLength(0);
  });

  it('panne du catalogue → erreur, jamais une liste vide', async () => {
    fakes[id].modelListStatus = 503;
    await expectCode(adapters[id].listModels({ apiKey: KEY, signal: signal() }), 'unavailable');
  });
});

describe('traductions propres à chaque fournisseur', () => {
  const image = request({ messages: [{ role: 'user', content: [{ type: 'image', dataUrl: PNG, detail: 'high' }, { type: 'text', text: 'Lis' }] }] });

  it('OpenAI : max_completion_tokens et image_url', async () => {
    await adapters.openai.generate(image, ctx());
    const { body } = fakes.openai.calls[0];
    expect(body.max_completion_tokens).toBe(321);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: PNG, detail: 'high' } });
  });

  it('mode JSON natif : OpenAI, Groq, OpenRouter, Gemini', async () => {
    const output = request({ output: 'json' });
    await Promise.all((['openai', 'groq', 'openrouter', 'gemini'] as const).map(id => adapters[id].generate(output, ctx())));
    for (const id of ['openai', 'groq', 'openrouter'] as const) {
      expect(fakes[id].calls[0].body.response_format).toEqual({ type: 'json_object' });
    }
    expect(fakes.gemini.calls[0].body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('OpenRouter : routage verrouillé, sans repli ni collecte', async () => {
    await adapters.openrouter.generate(request({ params: { reasoning_effort: 'low' } }), ctx());
    const { body } = fakes.openrouter.calls[0];
    expect(body.provider).toEqual({ allow_fallbacks: false, require_parameters: true, data_collection: 'deny' });
    expect(body.max_tokens).toBe(321);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('xAI : API Responses, sans stockage, image en input_image', async () => {
    await adapters.xai.generate({ ...image, params: { reasoning_effort: 'low' } }, ctx());
    const { body, url } = fakes.xai.calls[0];
    expect(url).toBe('/v1/responses');
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(321);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.input[0]).toEqual({ role: 'system', content: 'Consigne système' });
    expect(body.input[1].content[0]).toEqual({ type: 'input_image', image_url: PNG, detail: 'high' });
  });

  it('xAI : stop et pénalités non transmis (refusés par les modèles à raisonnement)', async () => {
    await adapters.xai.generate(request({ params: { stop: 'FIN', presence_penalty: 1 } }), ctx());
    expect(fakes.xai.calls[0].body.stop).toBeUndefined();
    expect(fakes.xai.calls[0].body.presence_penalty).toBeUndefined();
  });

  it('Anthropic : système séparé, max_tokens, en-têtes, image base64', async () => {
    await adapters.anthropic.generate({ ...image, params: { reasoning_effort: 'low', stop: 'FIN' } }, ctx());
    const { body, headers } = fakes.anthropic.calls[0];
    expect(body.system).toBe('Consigne système');
    expect(body.max_tokens).toBe(321);
    expect(body.messages.every((m: { role: string }) => m.role !== 'system')).toBe(true);
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.stop_sequences).toEqual(['FIN']);
    expect(headers['anthropic-version']).toBeTruthy();
    expect(headers.authorization).toBeUndefined();
  });

  it('Anthropic : temperature jamais envoyée (refusée par les modèles récents)', async () => {
    await adapters.anthropic.generate(request({ params: { temperature: 0.3, top_p: 0.5, top_k: 4 } }), ctx());
    const { body } = fakes.anthropic.calls[0];
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.top_k).toBeUndefined();
  });

  it('Anthropic : seuls les blocs texte sont repris, pas la réflexion', async () => {
    const result = await adapters.anthropic.generate(request(), ctx());
    expect(result.content).toBe('Réponse simulée');
  });

  it('Anthropic : refus de contenu et surcharge', async () => {
    fakes.anthropic.behavior = { kind: 'filtered' };
    await expectCode(adapters.anthropic.generate(request(), ctx()), 'content_filtered');
    fakes.anthropic.behavior = { kind: 'error', status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
    await expectCode(adapters.anthropic.generate(request(), ctx()), 'unavailable');
    fakes.anthropic.behavior = { kind: 'error', status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } } };
    await expectCode(adapters.anthropic.generate(request(), ctx()), 'quota_exceeded');
  });

  it('Gemini : URL du modèle encodée, système séparé, rôle model, inlineData', async () => {
    await adapters.gemini.generate({ ...image, params: { temperature: 0.2, top_p: 0.9, top_k: 5, stop: 'FIN' } }, ctx('gemini-x.y'));
    const { body, url } = fakes.gemini.calls[0];
    expect(url).toBe('/v1beta/models/gemini-x.y:generateContent');
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Consigne système' }] });
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 321, temperature: 0.2, topP: 0.9, topK: 5, stopSequences: ['FIN'] });
  });

  it('Gemini : assistant → model ; réflexion ignorée ; tokens de réflexion comptés', async () => {
    const result = await adapters.gemini.generate(request(), ctx());
    expect(fakes.gemini.calls[0].body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(result.content).toBe('Réponse simulée');
    expect(result.usage?.outputTokens).toBe(50);
  });

  it('Gemini : filtre de sécurité et clé invalide en HTTP 400', async () => {
    fakes.gemini.behavior = { kind: 'filtered' };
    await expectCode(adapters.gemini.generate(request(), ctx()), 'content_filtered');
    fakes.gemini.acceptedKeys = ['autre'];
    await expectCode(adapters.gemini.generate(request(), ctx()), 'auth');
    fakes.gemini.acceptedKeys = null;
  });
});

describe('catalogues : seules les informations publiées sont reprises', () => {
  const list = (id: ProviderId) => adapters[id].listModels({ apiKey: KEY, signal: signal() });

  it('OpenAI : date de retrait, ni vision ni tarif supposés', async () => {
    fakes.openai.models = [{ id: 'a', shutdownDate: '2027-01-01' }];
    expect((await list('openai'))[0]).toEqual({ id: 'a', shutdownDate: '2027-01-01' });
  });

  it('Groq : limites et état', async () => {
    fakes.groq.models = [{ id: 'a', active: false, contextWindow: 1000, maxCompletionTokens: 100 }];
    expect((await list('groq'))[0]).toMatchObject({ id: 'a', active: false, contextWindow: 1000, maxCompletionTokens: 100 });
  });

  it('xAI : modalités et tarifs convertis (cents pour 100 M de tokens)', async () => {
    fakes.xai.models = [{ id: 'grok', vision: true, inputPrice: 20000, outputPrice: 60000 }];
    expect((await list('xai'))[0]).toEqual({ id: 'grok', vision: true, pricing: { inputPerMTok: 2_000_000, outputPerMTok: 6_000_000 } });
  });

  it('OpenRouter : modalités, tarifs par token convertis, limites', async () => {
    fakes.openrouter.models = [{ id: 'v/m', vision: false, inputPrice: '0.000002', outputPrice: '0.000006', contextWindow: 9000, maxCompletionTokens: 800 }];
    expect((await list('openrouter'))[0]).toMatchObject({ id: 'v/m', vision: false, contextWindow: 9000, maxCompletionTokens: 800, pricing: { inputPerMTok: 2_000_000, outputPerMTok: 6_000_000 } });
  });

  it('Anthropic : vision et limites', async () => {
    fakes.anthropic.models = [{ id: 'c', vision: true, contextWindow: 1000, maxCompletionTokens: 200 }];
    expect((await list('anthropic'))[0]).toMatchObject({ id: 'c', vision: true, contextWindow: 1000, maxCompletionTokens: 200 });
  });

  it('Gemini : préfixe retiré, modèles non textuels écartés, vision inconnue', async () => {
    fakes.gemini.models = [{ id: 'gemini-x' }, { id: 'embedding-x', methods: ['embedContent'] }];
    const models = await list('gemini');
    expect(models.map(m => m.id)).toEqual(['gemini-x']);
    expect(models[0].vision).toBeUndefined();
  });
});

describe('identifiants de modèle', () => {
  it.each(['gpt-6-astra', 'openai/gpt-oss-120b', 'vendor/model:free', 'gemini-3.8-flash', 'claude-opus-5-5'])('%s accepté', (id) => {
    expect(isValidModelId(id)).toBe(true);
  });

  it.each(['', ' ', '../secret', 'a/../b', 'a//b', 'a/', '/a', 'a b', 'a?key=1', 'a#b', 'a\nb', 'é', 'x'.repeat(201), 12, null])('%j refusé', (id) => {
    expect(isValidModelId(id)).toBe(false);
  });
});

describe('registre', () => {
  it('six fournisseurs, tous dotés d’un adaptateur et d’une URL HTTPS fixe', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].baseUrl).toMatch(/^https:\/\//);
      expect(typeof PROVIDERS[id].createAdapter).toBe('function');
    }
  });
});

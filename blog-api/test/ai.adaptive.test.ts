// P1 : classement des erreurs des fournisseurs, matrice de capacités et construction adaptative des requêtes
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { classifyError, errorInfo } from '../src/ai/providers/http';
import { generateAdaptive, paramTarget, prefilter, MAX_ADJUSTMENTS } from '../src/ai/providers/adaptive';
import { CAPABILITY_MATRIX_VERSION, modelProfile, rejectedByProfile } from '../src/ai/providers/capabilities';
import { PROVIDERS } from '../src/ai/providers/registry';
import { PROVIDER_IDS, type NormalizedRequest, type ProviderId } from '../src/ai/providers/types';
import { startFakeProvider, type FakeProvider } from './helpers/fakeProviders.mjs';

const fakes = {} as Record<ProviderId, FakeProvider>;
beforeAll(async () => { await Promise.all(PROVIDER_IDS.map(async id => { fakes[id] = await startFakeProvider(id); })); });
afterAll(async () => { await Promise.all(PROVIDER_IDS.map(id => fakes[id].close())); });
beforeEach(() => { for (const id of PROVIDER_IDS) { fakes[id].calls.length = 0; fakes[id].queue = []; fakes[id].behavior = { kind: 'ok' }; } });

const adapter = (id: ProviderId) => PROVIDERS[id].createAdapter(fakes[id].url);
const ctx = (model = 'modele-a') => ({ apiKey: 'cle-factice', model, signal: AbortSignal.timeout(5000) });
const REQ: NormalizedRequest = {
  system: 'Système', maxOutputTokens: 100, params: {},
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }],
};

describe('classement des erreurs : chaque cause distinguée', () => {
  it.each([
    [401, { error: { message: 'Incorrect API key provided: sk-proj-abcd', code: 'invalid_api_key' } }, 'auth'],
    [404, { error: { message: 'The model `x` does not exist or you do not have access to it.', code: 'model_not_found' } }, 'model_not_found'],
    [400, { error: { message: 'Your organization must be verified to use the model `o3`.', code: null } }, 'permission_denied'],
    [403, { error: { type: 'permission_error', message: 'no access' } }, 'permission_denied'],
    [404, { error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.', param: 'model', code: null } }, 'endpoint_incompatible'],
    [404, { error: { message: 'This is not a chat model and thus not supported in the v1/chat/completions endpoint.', code: 'model_not_found' } }, 'endpoint_incompatible'],
    [400, { error: { message: 'Invalid content type. image_url is only supported by certain models.', param: 'messages.[1].content.[0].type', code: null } }, 'vision_unsupported'],
    [400, { error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model.", param: 'temperature', code: 'unsupported_value' } }, 'unsupported_parameter'],
    [400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: 'max_tokens', code: 'unsupported_parameter' } }, 'unsupported_parameter'],
    [400, { error: { message: 'The image data you provided does not represent a valid image.', code: 'invalid_image_format' } }, 'invalid_image'],
    [400, { error: { message: 'Bad JSON' } }, 'bad_request'],
    [400, { error: { message: "This model's maximum context length is 128000 tokens.", code: 'context_length_exceeded' } }, 'context_too_long'],
    [413, {}, 'payload_too_large'],
    [429, { error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } }, 'rate_limited'],
    [429, { error: { message: 'quota', type: 'insufficient_quota', code: 'insufficient_quota' } }, 'quota_exceeded'],
    [429, { error: { message: 'credit', code: 'credit_balance_exhausted' } }, 'quota_exceeded'],
    [429, { error: { message: 'spend', code: 'project_spend_limit_exceeded' } }, 'quota_exceeded'],
    [503, { error: { message: 'overloaded', code: 'server_is_overloaded' } }, 'unavailable'],
  ])('HTTP %i → %s', (status, body, expected) => {
    expect(classifyError(status, errorInfo(body)).code).toBe(expected);
  });

  it('paramètre fautif retenu (nom seulement), jamais le message ni une valeur', () => {
    const err = classifyError(400, errorInfo({ error: { message: "Unsupported value: 'temperature' does not support 0.2. Key sk-proj-SECRET", param: 'temperature', code: 'unsupported_value' } }));
    expect(err.param).toBe('temperature');
    expect(`${err.message} ${err.detail}`).not.toMatch(/sk-proj|SECRET|0\.2/);
  });

  it('paramètre retrouvé dans le message quand le champ param est absent (Anthropic)', () => {
    const err = classifyError(400, { type: 'invalid_request_error', message: 'output_config: Extra inputs are not permitted' });
    expect(err).toMatchObject({ code: 'unsupported_parameter', param: 'output_config' });
    expect(paramTarget(err.param)).toBe('reasoning_effort');
  });

  it('formats xAI (error en texte) et Gemini (status) reconnus', () => {
    expect(classifyError(400, errorInfo({ code: 'Client specified an invalid argument', error: 'Image inputs are not supported by this model.' })).code).toBe('vision_unsupported');
    expect(classifyError(400, { code: 'INVALID_ARGUMENT', message: 'Unable to process input image.' }).code).toBe('invalid_image');
  });
});

describe('matrice de capacités', () => {
  it('versionnée', () => {
    expect(CAPABILITY_MATRIX_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('vision documentée uniquement pour des pages officielles relues, jamais par famille', () => {
    expect(modelProfile('openai', 'gpt-5-nano').visionDocumented).toBe(true);
    expect(modelProfile('openai', 'gpt-5-nano-2025-08-07').visionDocumented).toBe(true);
    expect(modelProfile('openai', 'gpt-5.6-luna').visionDocumented).toBe(true);
    for (const model of ['gpt-5', 'gpt-5.4', 'gpt-6.1-sol', 'gpt-4o', 'gpt-9-inconnu']) {
      expect(modelProfile('openai', model).visionDocumented, model).toBeNull();
    }
    expect(modelProfile('groq', 'openai/gpt-oss-120b').visionDocumented).toBe(false);
  });

  it('forme de requête par fournisseur', () => {
    expect(modelProfile('openai', 'x').outputLimitField).toBe('max_completion_tokens');
    expect(modelProfile('openrouter', 'x').outputLimitField).toBe('max_tokens');
    expect(modelProfile('groq', 'x').imageDetail).toBe(false);
    expect(modelProfile('openai', 'gpt-5-pro').endpoint).toBe('responses');
    expect(modelProfile('openai', 'gpt-5.1-codex').endpoint).toBe('responses');
  });

  it('règles de paramètres des modèles à raisonnement', () => {
    expect(rejectedByProfile(modelProfile('openai', 'gpt-5-mini'), { top_p: 0.9 })).toEqual({ param: 'top_p', reason: 'model' });
    expect(rejectedByProfile(modelProfile('openai', 'gpt-5.6-luna'), { temperature: 0.2 })).toEqual({ param: 'temperature', reason: 'reasoning' });
    expect(rejectedByProfile(modelProfile('openai', 'gpt-5.6-luna'), { temperature: 0.2, reasoning_effort: 'none' })).toBeNull();
    expect(rejectedByProfile(modelProfile('openai', 'gpt-6-astra'), { reasoning_effort: 'none' })).toEqual({ param: 'reasoning_effort', reason: 'effort' });
    expect(rejectedByProfile(modelProfile('xai', 'grok-4'), { reasoning_effort: 'low' })).toEqual({ param: 'reasoning_effort', reason: 'model' });
    expect(rejectedByProfile(modelProfile('openai', 'gpt-9-inconnu'), { temperature: 0.2 })).toBeNull();
  });
});

describe('construction adaptative', () => {
  it('paramètre refusé par la matrice retiré avant l’envoi', async () => {
    const { request, adjustments } = prefilter(adapter('openai'), { ...REQ, params: { temperature: 0.5, seed: 1 } }, 'gpt-5-nano');
    expect(request.params).toEqual({ seed: 1 });
    expect(adjustments).toEqual(['param_removed:temperature']);
  });

  it('refus explicite d’un paramètre : retiré, nouvel essai, réponse obtenue', async () => {
    fakes.openai.queue = [{ kind: 'error', status: 400, body: { error: { message: "Unsupported parameter: 'top_p' is not supported with this model.", param: 'top_p', code: 'unsupported_parameter' } } }];
    const result = await generateAdaptive(adapter('openai'), { ...REQ, params: { top_p: 0.9 } }, ctx());
    expect(result.adjustments).toEqual(['param_removed:top_p']);
    expect(fakes.openai.calls[1].body.top_p).toBeUndefined();
  });

  it('nombre de corrections borné : pas de boucle', async () => {
    fakes.openai.behavior = { kind: 'error', status: 400, body: { error: { message: 'Unsupported parameter', param: 'max_tokens', code: 'unsupported_parameter' } } };
    await expect(generateAdaptive(adapter('openai'), REQ, ctx())).rejects.toMatchObject({ code: 'unsupported_parameter' });
    expect(fakes.openai.calls.length).toBeLessThanOrEqual(MAX_ADJUSTMENTS + 1);
  });

  it('refus non corrigeable : aucun nouvel essai', async () => {
    fakes.openai.behavior = { kind: 'error', status: 404, body: { error: { message: 'does not exist', code: 'model_not_found' } } };
    await expect(generateAdaptive(adapter('openai'), REQ, ctx())).rejects.toMatchObject({ code: 'model_not_found' });
    expect(fakes.openai.calls).toHaveLength(1);
  });

  it('mode JSON refusé : retiré, la sortie reste validée côté serveur', async () => {
    fakes.groq.queue = [{ kind: 'error', status: 400, body: { error: { message: "'response_format' is not supported with this model", param: 'response_format', code: 'unsupported_parameter' } } }];
    const result = await generateAdaptive(adapter('groq'), { ...REQ, output: 'json' }, ctx());
    expect(result.adjustments).toEqual(['json_mode_removed']);
    expect(fakes.groq.calls[1].body.response_format).toBeUndefined();
  });

  it('modèle réservé à l’API Responses : envoyé d’emblée au bon point d’accès', async () => {
    fakes.openai.behavior = { kind: 'ok', content: 'OK' };
    await generateAdaptive(adapter('openai'), REQ, ctx('gpt-5-pro'));
    expect(fakes.openai.calls[0].url).toBe('/v1/responses');
  });

  it('réponse vide après épuisement de la limite : cause « limite de sortie »', async () => {
    fakes.openai.behavior = { kind: 'error', status: 200, body: { choices: [{ message: { content: '' }, finish_reason: 'length' }] } };
    await expect(generateAdaptive(adapter('openai'), REQ, ctx())).rejects.toMatchObject({ code: 'output_truncated' });
  });
});

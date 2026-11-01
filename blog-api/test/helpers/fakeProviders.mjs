// Faux fournisseurs d'IA locaux (127.0.0.1) : aucune requête payante, aucune vraie clé.
// Chacun imite le format réel de son API, pour prouver la traduction des adaptateurs.
// Utilisé par les tests API (vitest) et par la pile locale (supabase/tests/stack).
//
//   const fake = await startFakeProvider('anthropic');
//   fake.behavior = { kind: 'ok', content: 'Bonjour' };
//   fake.models = [{ id: 'modele-a', vision: true }];
//   fake.calls  → requêtes de génération reçues (méthode, url, en-têtes, corps)
//   fake.queue  → réponses successives, consommées avant fake.behavior
//   { kind: 'vision' }    → modèle multimodal simulé : lit réellement l'image (PNG décodé), sinon répond au texte
//   { kind: 'text-only' } → modèle sans vision : refuse toute image avec l'erreur réelle du fournisseur

import http from 'node:http';
import { imageOf, visionAnswer } from './fakeVision.mjs';

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const USAGE = { input: 120, output: 40 };

/** Réponse de génération au format du fournisseur */
const ANSWERS = {
  chat: (content, finish = 'stop') => ({
    choices: [{ message: { role: 'assistant', content }, finish_reason: finish }],
    usage: { prompt_tokens: USAGE.input, completion_tokens: USAGE.output },
  }),
  responses: (content, status = 'completed') => ({
    id: 'resp_1',
    status,
    output: [
      { type: 'reasoning', encrypted_content: 'x' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] },
    ],
    usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
  }),
  messages: (content, stop = 'end_turn') => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'thinking', thinking: 'réflexion interne' }, { type: 'text', text: content }],
    stop_reason: stop,
    usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
  }),
  gemini: (content, finish = 'STOP') => ({
    candidates: [{ content: { parts: [{ text: 'réflexion interne', thought: true }, { text: content }], role: 'model' }, finishReason: finish }],
    usageMetadata: { promptTokenCount: USAGE.input, candidatesTokenCount: USAGE.output, thoughtsTokenCount: 10 },
  }),
};

/** Catalogue au format du fournisseur, à partir d'une description commune */
const CATALOGS = {
  openai: models => ({ object: 'list', data: models.map(m => ({ id: m.id, object: 'model', created: 1, owned_by: 'openai', shutdown_date: m.shutdownDate ?? null })) }),
  groq: models => ({ object: 'list', data: models.map(m => ({ id: m.id, object: 'model', active: m.active ?? true, context_window: m.contextWindow ?? 131072, max_completion_tokens: m.maxCompletionTokens ?? 65536 })) }),
  xai: models => ({ models: models.map(m => ({
    id: m.id,
    input_modalities: m.vision ? ['text', 'image'] : ['text'],
    output_modalities: ['text'],
    prompt_text_token_price: m.inputPrice ?? 20000,
    completion_text_token_price: m.outputPrice ?? 60000,
  })) }),
  openrouter: models => ({ data: models.map(m => ({
    id: m.id,
    name: m.displayName ?? m.id,
    context_length: m.contextWindow ?? 200000,
    architecture: { input_modalities: m.vision ? ['text', 'image'] : ['text'], output_modalities: ['text'] },
    pricing: { prompt: m.inputPrice ?? '0.000002', completion: m.outputPrice ?? '0.000006' },
    top_provider: { max_completion_tokens: m.maxCompletionTokens ?? 8192 },
    supported_parameters: ['temperature', 'top_p'],
  })) }),
  anthropic: models => ({ data: models.map(m => ({
    type: 'model',
    id: m.id,
    display_name: m.displayName ?? m.id,
    max_input_tokens: m.contextWindow ?? 1000000,
    max_tokens: m.maxCompletionTokens ?? 128000,
    capabilities: { image_input: { supported: m.vision ?? true }, structured_outputs: { supported: true } },
  })), has_more: false, first_id: models[0]?.id ?? null, last_id: models.at(-1)?.id ?? null }),
  gemini: models => ({ models: models.map(m => ({
    name: `models/${m.id}`,
    displayName: m.displayName ?? m.id,
    inputTokenLimit: m.contextWindow ?? 1000000,
    outputTokenLimit: m.maxCompletionTokens ?? 65536,
    supportedGenerationMethods: m.methods ?? ['generateContent'],
  })) }),
};

/** Erreur d'authentification au format du fournisseur */
const AUTH_ERRORS = {
  openai: [401, { error: { message: 'Incorrect API key', code: 'invalid_api_key' } }],
  groq: [401, { error: { message: 'Invalid API Key', code: 'invalid_api_key' } }],
  xai: [401, { code: 'unauthenticated', error: 'Incorrect API key' }],
  openrouter: [401, { error: { message: 'No auth credentials', code: 401 } }],
  anthropic: [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }],
  gemini: [400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } }],
};

/** Refus d'une image par un modèle sans vision, au format du fournisseur */
const VISION_ERRORS = {
  openai: [400, { error: { message: 'Invalid content type. image_url is only supported by certain models.', type: 'invalid_request_error', param: 'messages.[1].content.[0].type', code: null } }],
  groq: [400, { error: { message: 'messages[1].content must be a string', type: 'invalid_request_error', param: 'messages.[1].content.[0].type', code: null } }],
  openrouter: [404, { error: { message: 'No endpoints found that support image input', code: 404 } }],
  xai: [400, { code: 'Client specified an invalid argument', error: 'Image inputs are not supported by this model.' }],
  anthropic: [400, { type: 'error', error: { type: 'invalid_request_error', message: 'This model does not support image input.' } }],
  gemini: [400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Image input is not supported for this model.' } }],
};

/** Image indécodable, au format du fournisseur (OpenAI : invalid_image_format) */
const INVALID_IMAGE_ERRORS = {
  openai: [400, { error: { message: 'The image data you provided does not represent a valid image.', type: 'invalid_request_error', param: null, code: 'invalid_image_format' } }],
  groq: [400, { error: { message: 'Invalid image data', type: 'invalid_request_error', code: 'invalid_image' } }],
  openrouter: [400, { error: { message: 'Invalid image', code: 400 } }],
  xai: [400, { code: 'Client specified an invalid argument', error: 'Unable to process input image.' }],
  anthropic: [400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages.0.content.0.image.source.base64.data: The image does not appear to be a valid png image' } }],
  gemini: [400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting' } }],
};

const CHAT = ['POST', /^\/v1\/chat\/completions$/, 'chat'];
const RESPONSES = ['POST', /^\/v1\/responses$/, 'responses'];
const GENERATE_ROUTES = {
  openai: [CHAT, RESPONSES],
  groq: [CHAT],
  openrouter: [CHAT],
  xai: [RESPONSES],
  anthropic: [['POST', /^\/v1\/messages$/, 'messages']],
  gemini: [['POST', /^\/v1beta\/models\/[^/]+:generateContent$/, 'gemini']],
};

const LIST_ROUTES = {
  openai: /^\/v1\/models$/,
  groq: /^\/v1\/models$/,
  openrouter: /^\/v1\/models$/,
  xai: /^\/v1\/language-models$/,
  anthropic: /^\/v1\/models$/,
  gemini: /^\/v1beta\/models$/,
};

const keyOf = (id, req) => {
  if (id === 'anthropic') return req.headers['x-api-key'];
  if (id === 'gemini') return req.headers['x-goog-api-key'];
  return req.headers.authorization?.replace(/^Bearer /, '');
};

export async function startFakeProvider(id, { acceptedKeys = null } = {}) {
  const state = {
    calls: [],
    behavior: { kind: 'ok' },
    queue: [],
    models: [],
    modelListStatus: 200,
    modelListCalls: 0,
    acceptedKeys,
  };
  const pending = new Set();
  let aborted = 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const authorized = !state.acceptedKeys || state.acceptedKeys.includes(keyOf(id, req));

      if (req.method === 'GET' && LIST_ROUTES[id].test(url.pathname)) {
        state.modelListCalls++;
        if (!authorized) return json(res, ...AUTH_ERRORS[id]);
        if (state.modelListStatus !== 200) return json(res, state.modelListStatus, { error: { message: 'catalogue indisponible' } });
        return json(res, 200, CATALOGS[id](state.models));
      }

      const matched = GENERATE_ROUTES[id].find(([method, route]) => req.method === method && route.test(url.pathname));
      if (!matched) { res.writeHead(404).end(); return; }
      const format = matched[2];

      state.calls.push({ method: req.method, url: req.url, headers: req.headers, body: JSON.parse(raw || '{}') });
      if (!authorized) return json(res, ...AUTH_ERRORS[id]);

      const b = state.queue.length ? state.queue.shift() : state.behavior;
      if (b.kind === 'hang') {
        pending.add(res);
        res.on('close', () => { if (!res.writableEnded) aborted++; });
        return;
      }
      if (b.kind === 'error') return json(res, b.status, b.body);
      if (b.kind === 'text-only' && imageOf(state.calls.at(-1).body) !== null) return json(res, ...VISION_ERRORS[id]);
      if (b.kind === 'vision' || b.kind === 'text-only') {
        const answer = b.kind === 'vision' ? visionAnswer(state.calls.at(-1).body) : (JSON.stringify(state.calls.at(-1).body).includes('JSON') ? '{"ok":true}' : 'OK');
        if (answer === null) return json(res, ...INVALID_IMAGE_ERRORS[id]);
        return json(res, 200, ANSWERS[format](answer));
      }
      if (b.kind === 'malformed') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{not json'); return; }
      if (b.kind === 'filtered') return json(res, 200, ANSWERS[format]('', { chat: 'content_filter', messages: 'refusal', gemini: 'SAFETY' }[format]));

      const reply = () => json(res, 200, ANSWERS[format](b.content ?? 'Réponse simulée'));
      if (b.delayMs) setTimeout(reply, b.delayMs); else reply();
    });
  });

  // Plus long que l'inactivité côté client : pas de connexion fermée pendant sa réutilisation
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    id,
    url: `http://127.0.0.1:${port}`,
    calls: state.calls,
    get behavior() { return state.behavior; },
    set behavior(b) { state.behavior = b; },
    get queue() { return state.queue; },
    set queue(q) { state.queue = q; },
    get models() { return state.models; },
    set models(m) { state.models = m; },
    get modelListStatus() { return state.modelListStatus; },
    set modelListStatus(s) { state.modelListStatus = s; },
    get acceptedKeys() { return state.acceptedKeys; },
    set acceptedKeys(k) { state.acceptedKeys = k; },
    modelListCalls: () => state.modelListCalls,
    abortedCalls: () => aborted,
    close: () => new Promise(resolve => {
      for (const res of pending) res.destroy();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

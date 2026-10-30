// P0.A2 — Passerelle IA : délais maximaux et niveau d'authentification par fonctionnalité.
// Fonctionnalités de test injectées (délai court, niveau admin) pour ne pas attendre 30-85 s.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { createApp } from '../src/app';
import { createMemoryQuotaService } from '../src/ai/services/quotas';
import { strictObject, text } from '../src/ai/features/validate';
import type { FeatureDefinition } from '../src/ai/features/registry';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeOpenAI, type FakeOpenAI } from './helpers/fakeOpenAI';
import { startFakeSupabase, ANON_KEY, USER_ID, type FakeSupabase } from './helpers/fakeSupabase';

const base = (id: string, overrides: Partial<FeatureDefinition>): FeatureDefinition => ({
  id,
  section: 'Tests',
  authLevel: 'public',
  personalData: false,
  requiredCapabilities: ['text'],
  promptVersion: 'test.v1',
  bodyLimit: 'small',
  timeoutMs: 300,
  rateLimitPerMinute: 10_000,
  maxOutputTokens: 16,
  quotas: { perSubjectPerDay: 100, globalPerDay: 100, concurrency: 1 },
  parseInput: raw => ({ q: text(strictObject(raw, 'input', ['q']), 'q', { max: 100, required: true }) }),
  buildRequest: ({ q }: { q: string }) => ({ system: 'Système de test', messages: [{ role: 'user', content: [{ type: 'text', text: q }] }] }),
  ...overrides,
});

const features = {
  'test.slow':  base('test.slow', {}),
  'test.admin': base('test.admin', { authLevel: 'admin', timeoutMs: 5000 }),
  'test.admin-free': base('test.admin-free', { timeoutMs: 5000 }),
};

let fake: FakeOpenAI;
let supabase: FakeSupabase;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  fake = await startFakeOpenAI();
  supabase = await startFakeSupabase();
  app = createApp({
    ai: {
      features,
      resolver: { resolve: () => ({ provider: 'openai', model: 'modele-test', source: 'seed', validated: true }) },
      baseUrlOverrides: { openai: fake.url },
      quotas: createMemoryQuotaService(),
    },
  });
});
afterAll(async () => {
  await fake.close();
  await supabase.close();
});
beforeEach(() => {
  fake.calls.length = 0;
  fake.behavior = { kind: 'ok' };
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  resetSupabaseAdminCaches();
});

describe('délai maximal', () => {
  it('fournisseur bloqué → 504 AI_TIMEOUT dans le délai + 1 s', async () => {
    fake.behavior = { kind: 'hang' };
    const started = Date.now();
    const res = await request(app).post('/api/ai/run/test.slow').send({ input: { q: 'bonjour' } });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(504);
    expect(res.body.code).toBe('AI_TIMEOUT');
    expect(elapsed).toBeLessThan(300 + 1000);
  });

  it('fournisseur lent mais dans le délai → 200', async () => {
    fake.behavior = { kind: 'ok', delayMs: 100 };
    expect((await request(app).post('/api/ai/run/test.slow').send({ input: { q: 'bonjour' } })).status).toBe(200);
  });

  it('après un dépassement, la concurrence est libérée', async () => {
    fake.behavior = { kind: 'hang' };
    await request(app).post('/api/ai/run/test.slow').send({ input: { q: 'a' } });
    fake.behavior = { kind: 'ok' };
    expect((await request(app).post('/api/ai/run/test.slow').send({ input: { q: 'b' } })).status).toBe(200);
  });
});

describe('déconnexion du visiteur', () => {
  it('l’appel en cours vers le fournisseur est interrompu et la concurrence libérée', async () => {
    fake.behavior = { kind: 'hang' };
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    const before = fake.abortedCalls();
    const client = new AbortController();
    const pending = fetch(`http://127.0.0.1:${port}/api/ai/run/test.admin-free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { q: 'x' } }),
      signal: client.signal,
    }).catch(err => err);

    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    client.abort();
    await pending;

    // Bien avant le délai maximal de 5 s de cette fonctionnalité
    await vi.waitFor(() => expect(fake.abortedCalls()).toBe(before + 1), { timeout: 1500 });

    fake.behavior = { kind: 'ok' };
    const res = await request(app).post('/api/ai/run/test.admin-free').send({ input: { q: 'y' } });
    expect(res.status).toBe(200);
    await new Promise(resolve => server.close(resolve));
  });
});

describe('niveau d’authentification « admin » défini par le registre', () => {
  it('anonyme → 401, sans appel', async () => {
    const res = await request(app).post('/api/ai/run/test.admin').send({ input: { q: 'x' } });
    expect(res.status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });

  it('utilisateur Supabase ordinaire → 403', async () => {
    const res = await request(app).post('/api/ai/run/test.admin')
      .set('Authorization', `Bearer ${supabase.token({ sub: USER_ID })}`)
      .send({ input: { q: 'x' } });
    expect(res.status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it('administrateur → 200', async () => {
    const res = await request(app).post('/api/ai/run/test.admin')
      .set('Authorization', `Bearer ${supabase.token()}`)
      .send({ input: { q: 'x' } });
    expect(res.status).toBe(200);
    expect(fake.calls).toHaveLength(1);
  });
});

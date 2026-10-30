// P0.A2 — Limiteur par minute de la passerelle IA (seuil abaissé pour ce fichier)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { startFakeOpenAI, type FakeOpenAI } from './helpers/fakeOpenAI';

process.env.AI_RATE_LIMIT_PER_MINUTE = '3';
const { createApp } = await import('../src/app');
const { createMemoryQuotaService } = await import('../src/ai/services/quotas');

let fake: FakeOpenAI;
beforeAll(async () => { fake = await startFakeOpenAI(); });
afterAll(async () => { await fake.close(); });

describe('limiteur IA par IP', () => {
  it('4e requête de la minute → 429 avant tout traitement', async () => {
    const app = createApp({ ai: { baseUrlOverrides: { openai: fake.url }, quotas: createMemoryQuotaService(), requireValidatedAssignment: false } });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await request(app).post('/api/ai/run/latex.improve')
        .send({ input: { selection: 'x', instruction: 'y' } })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(fake.calls).toHaveLength(3);
  });
});

// P0.A1 — Limitation des requêtes sur les routes d'administration
// Seuils abaissés par variables d'environnement pour ce fichier uniquement
// (chaque fichier de test a son propre registre de modules).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { startFakeSupabase, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';

process.env.ADMIN_RATE_LIMIT_MAX = '5';
process.env.KNOWLEDGE_WRITE_RATE_LIMIT_MAX = '2';
const { createApp } = await import('../src/app');

let supabase: FakeSupabase;

beforeAll(async () => {
  supabase = await startFakeSupabase();
  process.env.SUPABASE_URL      = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  process.env.KNOWLEDGE_WRITE_ENABLED = 'true';
});
afterAll(async () => {
  await supabase.close();
});

describe('limiteurs', () => {
  it('anonyme : 429 après 5 tentatives sur /api/agent/knowledge (avant toute vérification)', async () => {
    const app = createApp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await request(app).get('/api/agent/knowledge/list')).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('écritures : 2 par heure et par administrateur', async () => {
    // nouvelle IP pour ne pas être bloqué par le test précédent
    const app = createApp();
    const token = supabase.token({ aal: 'aal2' });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .delete(`/api/agent/knowledge/manual_1700000000000_${i}`)
        .set('X-Forwarded-For', '203.0.113.10')
        .set('Authorization', `Bearer ${token}`);
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

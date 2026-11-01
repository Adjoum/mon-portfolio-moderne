// P2 — Verrouillage des sessions administrateur après 10 minutes d'inactivité, côté API.
// La logique de session (horloge, non-résurrection, isolation) est prouvée en base par
// supabase/tests/session ; ici : l'API consulte cet état pour toute requête admin en aal2,
// refuse une session close même avec un jeton encore valide, et ne la prolonge jamais.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ADMIN_ID, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';
import { seedRecord } from './helpers/fakePinecone';
import { auditEvents, allConsoleOutput } from './helpers/audit';

let supabase: FakeSupabase;
const app = createApp();

const read  = (token: string) => request(app).get('/api/agent/knowledge/list').set('Authorization', `Bearer ${token}`);
const write = (token: string) => request(app).post('/api/agent/knowledge/add-text').set('Authorization', `Bearer ${token}`).send({ text: 'x'.repeat(100) });
// Restauration d'une version du CV public : opération MFA réelle
const cvAdmin = (token: string) => request(app).post(`/api/admin/cv/${crypto.randomUUID()}/restore`).set('Authorization', `Bearer ${token}`).send({ expectedActive: null });

beforeAll(async () => { supabase = await startFakeSupabase(); });
afterAll(async () => { await supabase.close(); });
beforeEach(() => {
  process.env.SUPABASE_URL      = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.KNOWLEDGE_WRITE_ENABLED = 'true';
  supabase.mode = 'ok';
  supabase.admins.clear();
  supabase.admins.add(ADMIN_ID);
  supabase.sessions.reset();
  resetSupabaseAdminCaches();
  seedRecord({ id: 'manual_1700000000000_0', text: 'Contenu existant de la base', category: 'général' });
});
afterEach(() => { vi.useRealTimers(); });

describe('session administrateur active', () => {
  it('admin MFA, session active : lecture et écriture autorisées', async () => {
    const token = supabase.token({ aal: 'aal2' });
    expect((await read(token)).status).toBe(200);
    expect((await write(token)).status).toBe(200);
    expect(supabase.sessions.calls).toBeGreaterThan(0);
  });

  it('jeton aal1 : pas de contrôle de session (aucune session admin sans MFA)', async () => {
    const res = await read(supabase.token({ aal: 'aal1' }));
    expect(res.status).toBe(200);
    expect(supabase.sessions.calls).toBe(0);
  });
});

describe('session close, jeton encore techniquement valide', () => {
  it.each(['idle_timeout', 'logout'] as const)('%s : lecture, écriture et routes CV refusées (401 ADMIN_SESSION_EXPIRED)', async (reason) => {
    const sid = crypto.randomUUID();
    const token = supabase.token({ aal: 'aal2', sessionId: sid, expiresInSec: 3000 });
    supabase.sessions.expire(sid, reason);
    for (const res of [await read(token), await write(token), await cvAdmin(token)]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ADMIN_SESSION_EXPIRED');
      expect(res.body.error).toMatch(/10 minutes d’inactivité/);
    }
  });

  it('session jamais ouverte après la MFA → 401 ADMIN_SESSION_REQUIRED', async () => {
    const sid = crypto.randomUUID();
    supabase.sessions.states.set(sid, { active: false, remaining_seconds: 0, reason: 'not_started' });
    const res = await write(supabase.token({ aal: 'aal2', sessionId: sid }));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ADMIN_SESSION_REQUIRED');
  });

  it('une session close ne se rouvre pas : refus mis en cache jusqu’à l’expiration du jeton', async () => {
    const sid = crypto.randomUUID();
    const token = supabase.token({ aal: 'aal2', sessionId: sid });
    supabase.sessions.expire(sid);
    expect((await read(token)).status).toBe(401);
    supabase.sessions.states.delete(sid);   // même si l'état redevenait « actif » côté simulateur
    expect((await read(token)).status).toBe(401);
  });

  it('refus journalisé sans le jeton ni aucun secret', async () => {
    const sid = crypto.randomUUID();
    const token = supabase.token({ aal: 'aal2', sessionId: sid });
    supabase.sessions.expire(sid);
    await write(token);
    const denied = auditEvents().find(e => e.action === 'admin.access' && e.outcome === 'denied');
    expect(denied?.details).toMatchObject({ status: 401, code: 'ADMIN_SESSION_EXPIRED', reason: 'admin_session_idle_timeout' });
    expect(allConsoleOutput()).not.toContain(token);
    expect(allConsoleOutput()).not.toContain(token.split('.')[2]);
  });
});

describe('aucune fenêtre après la fermeture de la session', () => {
  it('déconnexion ou expiration prise en compte dès la requête suivante (état relu à chaque requête)', async () => {
    const sid = crypto.randomUUID();
    const token = supabase.token({ aal: 'aal2', sessionId: sid });
    expect((await read(token)).status).toBe(200);
    const before = supabase.sessions.calls;
    supabase.sessions.expire(sid, 'logout');
    const res = await read(token);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ADMIN_SESSION_EXPIRED');
    expect(supabase.sessions.calls).toBe(before + 1);
  });

  it('horloge simulée : expiration atteinte entre deux requêtes rapprochées → refus immédiat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const sid = crypto.randomUUID();
    const token = supabase.token({ aal: 'aal2', sessionId: sid });
    supabase.sessions.states.set(sid, { active: true, remaining_seconds: 1, reason: null });
    expect((await read(token)).status).toBe(200);
    vi.setSystemTime(Date.now() + 1_100);
    supabase.sessions.expire(sid);
    expect((await read(token)).status).toBe(401);
  });
});

describe('fail closed', () => {
  it('migration absente (fonction introuvable) → 503, aucun accès sans contrôle de session', async () => {
    supabase.sessions.mode = 'missing_function';
    const res = await write(supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_AUTH_UNAVAILABLE');
  });

  it('Supabase indisponible → 503', async () => {
    supabase.sessions.mode = 'down';
    expect((await read(supabase.token({ aal: 'aal2' }))).status).toBe(503);
  });
});

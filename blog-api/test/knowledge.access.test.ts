// P0.A1 — Contrôle d'accès de /api/agent/knowledge/* (faille S11)
// Matrice : anonyme 401 · jeton invalide 401 · utilisateur Supabase ordinaire 403 ·
//           admin sans MFA 403 sur les écritures · admin MFA 200 · fail closed (503)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, unsignedToken, ADMIN_ID, USER_ID, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';
import { seedRecord, storedRecords, fakeIndex } from './helpers/fakePinecone';
import { auditEvents } from './helpers/audit';
import { findLeakedSecret } from './helpers/canaries';

let supabase: FakeSupabase;
const app = createApp();

type Method = 'get' | 'post' | 'delete';
const ROUTES: { method: Method; path: string; body?: object; write: boolean }[] = [
  { method: 'get',    path: '/api/agent/knowledge/list',                                         write: false },
  { method: 'post',   path: '/api/agent/knowledge/search',      body: { query: 'React' },        write: false },
  { method: 'post',   path: '/api/agent/knowledge/add-text',    body: { text: 'x'.repeat(100) }, write: true },
  { method: 'post',   path: '/api/agent/knowledge/upload-file',                                  write: true },
  { method: 'delete', path: '/api/agent/knowledge/manual_1700000000000_0',                       write: true },
];

function send(route: (typeof ROUTES)[number], token?: string, extraHeaders: Record<string, string> = {}) {
  let req = request(app)[route.method](route.path);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  for (const [k, v] of Object.entries(extraHeaders)) req = req.set(k, v);
  return route.body ? req.send(route.body) : req;
}

beforeAll(async () => {
  supabase = await startFakeSupabase();
});
afterAll(async () => {
  await supabase.close();
});
beforeEach(() => {
  process.env.SUPABASE_URL      = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.KNOWLEDGE_WRITE_ENABLED = 'true';
  supabase.mode = 'ok';
  supabase.hs256Secret = null;
  supabase.admins.clear();
  supabase.admins.add(ADMIN_ID);
  resetSupabaseAdminCaches();
  seedRecord({ id: 'manual_1700000000000_0', text: 'Contenu existant de la base', category: 'général' });
});

describe('visiteur anonyme', () => {
  it.each(ROUTES)('$method $path → 401 sans jeton', async (route) => {
    const res = await send(route);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('aucune écriture ni suppression n’atteint Pinecone', async () => {
    for (const route of ROUTES) await send(route);
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
    expect(fakeIndex.deleteOne).not.toHaveBeenCalled();
    expect(storedRecords()).toHaveLength(1);
  });

  it('un rôle « admin » envoyé par le navigateur est ignoré', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/add-text?role=admin&isAdmin=true')
      .set('X-Role', 'admin')
      .set('X-User-Role', 'admin')
      .send({ text: 'x'.repeat(100), role: 'admin', isAdmin: true, aal: 'aal2' });
    expect(res.status).toBe(401);
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });

  it('un JWT du blog (HS256 signé avec JWT_SECRET) n’est pas accepté comme admin Supabase', async () => {
    const jwt = await import('jsonwebtoken');
    const blogToken = jwt.default.sign({ _id: 'x', role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const res = await send(ROUTES[0], blogToken);
    expect(res.status).toBe(401);
  });
});

describe('jetons invalides', () => {
  const cases: [string, () => string][] = [
    ['signé par une clé étrangère',      () => supabase.token({ signWith: 'foreign' })],
    ['kid inconnu',                       () => supabase.token({ kid: 'unknown-kid' })],
    ['expiré',                            () => supabase.token({ expiresInSec: -120 })],
    ['émetteur différent',                () => supabase.token({ iss: 'https://evil.example/auth/v1' })],
    ['audience différente',               () => supabase.token({ aud: 'service' })],
    ['rôle anon',                         () => supabase.token({ role: 'anon' })],
    ['utilisateur anonyme Supabase',      () => supabase.token({ isAnonymous: true })],
    ['sub non UUID',                      () => supabase.token({ sub: 'admin' })],
    ['HS256 forgé sans secret configuré', () => supabase.hs256Token('attacker-chosen-secret', { aal: 'aal2' })],
    ['alg none',                          () => unsignedToken({ sub: ADMIN_ID, role: 'authenticated', aal: 'aal2' })],
    ['chaîne quelconque',                 () => 'not-a-jwt'],
  ];

  it.each(cases)('%s → 401', async (_label, makeToken) => {
    const res = await send(ROUTES[0], makeToken());
    expect(res.status).toBe(401);
    expect(['UNAUTHORIZED', 'INVALID_TOKEN']).toContain(res.body.code);
  });

  it('un jeton forgé avec le sub d’un admin ne profite pas du cache du vrai jeton', async () => {
    const good = await send(ROUTES[0], supabase.token({ sub: ADMIN_ID }));
    expect(good.status).toBe(200);
    const forged = await send(ROUTES[0], supabase.hs256Token('attacker-chosen-secret', { sub: ADMIN_ID }));
    expect(forged.status).toBe(401);
  });
});

describe('utilisateur Supabase ordinaire (connecté, non admin)', () => {
  it.each(ROUTES)('$method $path → 403', async (route) => {
    const res = await send(route, supabase.token({ sub: USER_ID, aal: 'aal1' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('reste refusé même avec MFA (aal2)', async () => {
    const res = await send(ROUTES[2], supabase.token({ sub: USER_ID, aal: 'aal2' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });

  it('le refus est journalisé sans jeton', async () => {
    const token = supabase.token({ sub: USER_ID });
    await send(ROUTES[0], token);
    const denied = auditEvents().find(e => e.action === 'admin.access' && e.outcome === 'denied');
    expect(denied).toMatchObject({ actorType: 'supabase_user', actorId: USER_ID });
    expect(denied?.details).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(JSON.stringify(auditEvents())).not.toContain(token);
  });
});

describe('administrateur', () => {
  it('lecture (liste, recherche) autorisée en aal1', async () => {
    const token = supabase.token({ aal: 'aal1' });
    const list = await send(ROUTES[0], token);
    expect(list.status).toBe(200);
    expect(list.body.entries).toHaveLength(1);
    const search = await send(ROUTES[1], token);
    expect(search.status).toBe(200);
  });

  it.each(ROUTES.filter(r => r.write))('$method $path sans MFA (aal1) → 403 MFA_REQUIRED', async (route) => {
    const res = await send(route, supabase.token({ aal: 'aal1' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
    expect(fakeIndex.deleteOne).not.toHaveBeenCalled();
  });

  it('ajout de texte avec MFA (aal2) → 200 et audit', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/add-text')
      .set('Authorization', `Bearer ${supabase.token({ aal: 'aal2' })}`)
      .send({ text: 'Je développe des applications React et Node.js. '.repeat(5), category: 'compétences' });
    expect(res.status).toBe(200);
    expect(res.body.chunksIndexed).toBeGreaterThan(0);
    expect(fakeIndex.upsertRecords).toHaveBeenCalled();

    const event = auditEvents().find(e => e.action === 'knowledge.add_text');
    expect(event).toMatchObject({ outcome: 'success', actorType: 'supabase_admin', actorId: ADMIN_ID });
    expect(JSON.stringify(event)).not.toContain('React');  // jamais le contenu
  });

  it('suppression avec MFA (aal2) → 200 et audit de la cible', async () => {
    const res = await send(ROUTES[4], supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(200);
    expect(storedRecords()).toHaveLength(0);
    expect(auditEvents().find(e => e.action === 'knowledge.delete'))
      .toMatchObject({ outcome: 'success', target: 'manual_1700000000000_0' });
  });

  it('écritures coupées par KNOWLEDGE_WRITE_ENABLED (défaut : fermé) → 503', async () => {
    delete process.env.KNOWLEDGE_WRITE_ENABLED;
    for (const route of ROUTES.filter(r => r.write)) {
      const res = await send(route, supabase.token({ aal: 'aal2' }));
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('KNOWLEDGE_WRITE_DISABLED');
    }
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
    expect(fakeIndex.deleteOne).not.toHaveBeenCalled();
    // la lecture reste disponible
    expect((await send(ROUTES[0], supabase.token({ aal: 'aal1' }))).status).toBe(200);
  });

  it('retiré de admin_users → refusé (cache borné par jeton)', async () => {
    const token = supabase.token({ aal: 'aal2' });
    expect((await send(ROUTES[0], token)).status).toBe(200);
    supabase.admins.clear();
    resetSupabaseAdminCaches();
    expect((await send(ROUTES[0], token)).status).toBe(403);
  });

  it('projet HS256 avec SUPABASE_JWT_SECRET : vérification locale, autre secret refusé sans appel Supabase', async () => {
    const secret = 'project-legacy-jwt-secret-for-tests-only';
    process.env.SUPABASE_JWT_SECRET = secret;
    supabase.hs256Secret = secret;

    expect((await send(ROUTES[0], supabase.hs256Token(secret))).status).toBe(200);

    const rpcBefore = supabase.calls.rpc;
    const forged = await send(ROUTES[0], supabase.hs256Token('another-secret'));
    expect(forged.status).toBe(401);
    expect(supabase.calls.rpc).toBe(rpcBefore);   // rejeté localement
  });

  it('projet HS256 sans SUPABASE_JWT_SECRET : la signature est validée par Supabase', async () => {
    const secret = 'project-legacy-jwt-secret-for-tests-only';
    supabase.hs256Secret = secret;

    expect((await send(ROUTES[0], supabase.hs256Token(secret))).status).toBe(200);
    expect((await send(ROUTES[0], supabase.hs256Token('attacker-secret'))).status).toBe(401);
    // MFA lue dans un jeton validé par Supabase uniquement
    expect((await send(ROUTES[2], supabase.hs256Token('attacker-secret', { aal: 'aal2' }))).status).toBe(401);
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });
});

describe('fail closed', () => {
  it('Supabase non configuré → 503 avec jeton, 401 sans jeton, aucun accès', async () => {
    delete process.env.SUPABASE_URL;
    const res = await send(ROUTES[0], supabase.token());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_AUTH_NOT_CONFIGURED');
    expect((await send(ROUTES[2])).status).toBe(401);
  });

  it('SUPABASE_URL en http public refusée → 503', async () => {
    process.env.SUPABASE_URL = 'http://example.com';
    const res = await send(ROUTES[0], supabase.token());
    expect(res.status).toBe(503);
  });

  it('vérification admin indisponible (HTTP 500) → 503, jamais 200', async () => {
    supabase.mode = 'down';
    const res = await send(ROUTES[2], supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_AUTH_UNAVAILABLE');
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });

  it('fonction is_portfolio_admin absente (404) → 503', async () => {
    supabase.mode = 'missing_function';
    const res = await send(ROUTES[0], supabase.token());
    expect(res.status).toBe(503);
  });
});

describe('aucune fuite', () => {
  it('aucune réponse (succès ou erreur) ne contient de secret du serveur', async () => {
    const tokens = [undefined, 'garbage', supabase.token({ sub: USER_ID }), supabase.token({ aal: 'aal1' }), supabase.token({ aal: 'aal2' })];
    for (const route of ROUTES) {
      for (const token of tokens) {
        const res = await send(route, token);
        expect(findLeakedSecret(JSON.stringify(res.body) + JSON.stringify(res.headers))).toBeNull();
      }
    }
  });
});

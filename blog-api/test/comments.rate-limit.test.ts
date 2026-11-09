// Limitation des commentaires : un compteur par usage.
//   lecture (GET, HEAD)      300 / 15 min / IP
//   écritures publiques      10 / h / compte du blog, sinon IP : création, réponse, son propre commentaire
//   réactions                30 / 10 min / compte du blog, sinon IP
//   modération (admin + MFA) limiteur d'administration, session, audit — hors quota public
// Défauts corrigés : les GET consommaient le quota des écritures (plus aucun commentaire après
// 10 articles) ; les réactions et la modération aussi (10 réactions ou modérations par heure
// empêchaient de commenter ; plus de 10 modérations par heure impossibles).
// Aussi : adresse réelle du visiteur derrière nginx (src/lib/trustProxy.ts), en-têtes falsifiés.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { isLocalAddress, trustLocalProxy } from '../src/lib/trustProxy';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ADMIN_ID, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';
import { auditEvents } from './helpers/audit';

// Limiteur d'administration abaissé pour ce fichier (100 en production) : prouver qu'il s'applique
vi.hoisted(() => { process.env.ADMIN_RATE_LIMIT_MAX = '40'; });

// ── Modèles MongoDB simulés ──────────────────────────────────
// c<N> : commentaire d'un invité ; own<N> : commentaire du compte du blog « visitor1 »
const saves = vi.fn();
function stored(id: string) {
  return {
    _id: id, articleId: 'a1', parentId: null, depth: 0, path: id, guestName: 'Invité',
    content: 'Bonjour', isEdited: false, isDeleted: false, repliesCount: 0, reactions: {},
    createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
    ...(id.startsWith('own') ? { authorId: 'visitor1', guestName: undefined } : {}),
  };
}
class FakeComment {
  [key: string]: any;
  static find = vi.fn(() => ({ sort: () => ({ populate: () => ({ lean: async () => [stored('c1')] }) }) }));
  static findById = vi.fn(async (id: string) => (/^(c|own)\d+$/.test(id) ? new FakeComment({ ...stored(id), reactions: new Map() }) : null));
  static findByIdAndUpdate = vi.fn(async () => null);
  constructor(doc: Record<string, unknown>) { Object.assign(this, { _id: 'c-new', reactions: new Map(), ...doc }); }
  async save() { saves(); return this; }
  async populate() { return this; }
  toObject() { return { ...this }; }
}
vi.mock('../src/models/Comment', () => ({ Comment: FakeComment }));
vi.mock('../src/models/Article', () => ({ Article: { findByIdAndUpdate: vi.fn(async () => null) } }));
vi.mock('../src/models/User', () => {
  const users: Record<string, object> = Object.fromEntries(['visitor1', 'visitor2', 'visitor3']
    .map(id => [id, { _id: id, username: id, email: `${id}@x.test`, role: 'visitor' }]));
  return { User: { findById: (id: string) => ({ select: () => ({ lean: async () => users[id] ?? null }) }) } };
});

const { createApp } = await import('../src/app');
const app = createApp();
let server: http.Server;
let supabase: FakeSupabase;
let base: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  supabase = await startFakeSupabase();
});
afterAll(async () => {
  await new Promise(ok => server.close(ok));
  await supabase.close();
});
beforeEach(() => {
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  supabase.admins.clear();
  supabase.admins.add(ADMIN_ID);
  supabase.sessions.reset();
  resetSupabaseAdminCaches();
  saves.mockClear();
});

// nginx : `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` → adresse réelle à droite
const read = (articleId: string, xff: string) => request(base).get(`/api/comments/${articleId}`).set('X-Forwarded-For', xff);
const post = (xff: string) => request(base).post('/api/comments').set('X-Forwarded-For', xff)
  .send({ articleId: 'a1', content: 'Merci pour cet article', guestName: 'Invité', guestEmail: 'invite@example.test' });
const statusesOf = async (n: number, send: (i: number) => request.Test) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await send(i)).status);
  return out;
};
const times = (n: number, v: number) => Array<number>(n).fill(v);
const blogToken = (id: string) => jwt.sign({ _id: id, role: 'visitor' }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });
const react = (xff: string, comment = 'c1', body: object = { emoji: '🔥', sessionId: 'session-lecteur-1' }) =>
  request(base).post(`/api/comments/${comment}/react`).set('X-Forwarded-For', xff).send(body);

describe('lecture publique des commentaires', () => {
  it('un visiteur ouvre 25 articles d’affilée : aucun 429, limite de lecture propre (300 / 15 min)', async () => {
    const statuses = await statusesOf(24, i => read(`article-${i}`, '198.51.100.1'));
    const last = await read('article-24', '198.51.100.1');
    expect([...statuses, last.status]).toEqual(times(25, 200));
    expect(last.headers['ratelimit-limit']).toBe('300');
    expect(last.headers['ratelimit-remaining']).toBe('275');
    expect(last.body.comments).toHaveLength(1);
  });

  it('les lectures ne consomment pas le quota d’écriture', async () => {
    expect(await statusesOf(30, i => read(`article-${i}`, '198.51.100.2'))).toEqual(times(30, 200));
    expect(await statusesOf(10, () => post('198.51.100.2'))).toEqual(times(10, 201));
    const blocked = await post('198.51.100.2');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('COMMENT_RATE_LIMIT');
  });

  it('quota d’écriture épuisé : les commentaires restent lisibles (GET et HEAD)', async () => {
    expect(await statusesOf(11, () => post('198.51.100.3'))).toEqual([...times(10, 201), 429]);
    expect(await statusesOf(12, i => read(`article-${i}`, '198.51.100.3'))).toEqual(times(12, 200));
    expect((await request(base).head('/api/comments/a1').set('X-Forwarded-For', '198.51.100.3')).status).toBe(200);
  });

  describe('conditions de production (le limiteur global ignore les GET)', () => {
    let env: string | undefined;
    beforeEach(() => { env = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; });
    afterEach(() => { process.env.NODE_ENV = env; });

    it('au-delà de 300 lectures en 15 min, 429 générique ; les écritures et les autres IP ne sont pas touchées', async () => {
      const ip = '198.51.100.4';
      const statuses = await statusesOf(300, i => read(`article-${i % 40}`, ip));
      expect(statuses.every(s => s === 200)).toBe(true);
      const blocked = await read('article-0', ip);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(blocked.headers['retry-after']).toBeDefined();
      expect((await post(ip)).status).toBe(201);
      expect((await read('article-0', '198.51.100.5')).status).toBe(200);
    });
  });
});

describe('écritures : limitation stricte inchangée (10 par heure)', () => {
  it('par adresse : la 11e création est refusée, une autre adresse a son propre compteur', async () => {
    expect(await statusesOf(11, () => post('203.0.113.1'))).toEqual([...times(10, 201), 429]);
    expect(saves).toHaveBeenCalledTimes(10);
    expect((await post('203.0.113.2')).status).toBe(201);
  });

  it('par compte du blog : changer d’adresse ne remet pas le compteur à zéro', async () => {
    const token = blogToken('visitor2');
    const statuses = await statusesOf(11, i => request(base).post('/api/comments')
      .set('X-Forwarded-For', `203.0.113.${100 + i}`).set('Authorization', `Bearer ${token}`)
      .send({ articleId: 'a1', content: 'Commentaire du compte' }));
    expect(statuses).toEqual([...times(10, 201), 429]);
  });

  it('l’auteur qui modifie ou supprime son propre commentaire reste dans ce quota', async () => {
    const auth = { Authorization: `Bearer ${blogToken('visitor1')}` };
    const created = await statusesOf(6, i => request(base).post('/api/comments')
      .set('X-Forwarded-For', `203.0.113.${120 + i}`).set(auth).send({ articleId: 'a1', content: 'Mon commentaire' }));
    const edited = await statusesOf(4, i => request(base).put(`/api/comments/own${i}`)
      .set('X-Forwarded-For', '203.0.113.130').set(auth).send({ content: 'corrigé' }));
    const blocked = await request(base).delete('/api/comments/own9').set('X-Forwarded-For', '203.0.113.131').set(auth);
    expect([...created, ...edited]).toEqual([...times(6, 201), ...times(4, 200)]);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('COMMENT_RATE_LIMIT');
    expect(auditEvents().filter(e => e.action.startsWith('blog.comment'))).toHaveLength(0);
  });
});

describe('réactions : compteur propre (30 / 10 min)', () => {
  it('30 réactions n’empêchent pas de commenter ; la 31e est refusée, les commentaires restent possibles', async () => {
    const ip = '203.0.113.3';
    expect(await statusesOf(30, i => react(ip, `c${i % 5 + 1}`))).toEqual(times(30, 200));
    const blocked = await react(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('REACTION_RATE_LIMIT');
    expect(await statusesOf(11, () => post(ip))).toEqual([...times(10, 201), 429]);
    expect((await read('a1', ip)).status).toBe(200);
  });

  it('quota des commentaires épuisé : réagir reste possible', async () => {
    expect(await statusesOf(11, () => post('203.0.113.4'))).toEqual([...times(10, 201), 429]);
    expect((await react('203.0.113.4')).status).toBe(200);
  });

  it('par compte du blog : changer d’adresse ne remet pas le compteur à zéro', async () => {
    const token = blogToken('visitor3');
    const statuses = await statusesOf(31, i => react(`198.51.100.${100 + i}`).set('Authorization', `Bearer ${token}`));
    expect(statuses).toEqual([...times(30, 200), 429]);
  });

  it('réaction invalide refusée (400), rien n’est écrit', async () => {
    const ip = '203.0.113.5';
    const invalid = [
      { emoji: '💩', sessionId: 'session-lecteur-1' },
      { emoji: { $gt: '' }, sessionId: 'session-lecteur-1' },
      { emoji: '🔥', sessionId: 'court' },
      { emoji: '🔥', sessionId: 'x'.repeat(100_000) },
      { emoji: '🔥', sessionId: ['session-lecteur-1'] },
      { sessionId: 'session-lecteur-1' },
    ];
    for (const body of invalid) {
      const res = await react(ip, 'c1', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REACTION');
    }
    expect(saves).not.toHaveBeenCalled();
  });
});

describe('modération : administrateur Supabase + MFA, hors quota public', () => {
  const admin = () => ({ Authorization: `Bearer ${supabase.token({ aal: 'aal2' })}` });

  it('plus de 10 commentaires modérés d’affilée, audités ; le quota public de l’adresse reste intact', async () => {
    const ip = '203.0.113.40';
    const edits = await statusesOf(8, i => request(base).put(`/api/comments/c${i + 1}`)
      .set('X-Forwarded-For', ip).set(admin()).send({ content: 'modéré' }));
    const deletes = await statusesOf(8, i => request(base).delete(`/api/comments/c${i + 11}`)
      .set('X-Forwarded-For', ip).set(admin()));
    expect([...edits, ...deletes]).toEqual(times(16, 200));
    expect(saves).toHaveBeenCalledTimes(16);
    const audited = auditEvents().filter(e => e.action.startsWith('blog.comment'));
    expect(audited).toHaveLength(16);
    expect(audited.every(e => e.outcome === 'success' && e.actorType === 'supabase_admin' && e.actorId === ADMIN_ID)).toBe(true);
    expect(audited.filter(e => e.action === 'blog.comment.delete')).toHaveLength(8);
    expect(await statusesOf(11, () => post(ip))).toEqual([...times(10, 201), 429]);
  });

  it('limiteur d’administration conservé (abaissé à 40 ici) : 429 au-delà', async () => {
    const ip = '203.0.113.41';
    const statuses = await statusesOf(41, i => request(base).put(`/api/comments/c${i + 1}`)
      .set('X-Forwarded-For', ip).set(admin()).send({ content: 'modéré' }));
    expect(statuses).toEqual([...times(40, 200), 429]);
    expect(saves).toHaveBeenCalledTimes(40);
  });

  it('refus inchangés : aal1 403, anonyme 401, jeton du blog 401, session expirée 401 ; rien n’est écrit', async () => {
    const sid = '44444444-4444-4444-8444-444444444444';
    supabase.sessions.expire(sid, 'idle_timeout');
    const attempts: [request.Test, number, string][] = [
      [request(base).put('/api/comments/c1').set('Authorization', `Bearer ${supabase.token({ aal: 'aal1' })}`).send({ content: 'x' }), 403, 'MFA_REQUIRED'],
      [request(base).delete('/api/comments/c1'), 401, 'UNAUTHORIZED'],
      [request(base).delete('/api/comments/c1').set('Authorization', `Bearer ${blogToken('visitor1')}`), 401, 'INVALID_TOKEN'],
      [request(base).delete('/api/comments/c1').set('Authorization', `Bearer ${supabase.token({ aal: 'aal2', sessionId: sid })}`), 401, 'ADMIN_SESSION_EXPIRED'],
    ];
    for (const [i, [req, status, code]] of attempts.entries()) {
      const res = await req.set('X-Forwarded-For', `203.0.113.${50 + i}`);
      expect(res.status).toBe(status);
      if (code === 'INVALID_TOKEN') expect(['INVALID_TOKEN', 'UNAUTHORIZED']).toContain(res.body.code);
      else expect(res.body.code).toBe(code);
    }
    expect(saves).not.toHaveBeenCalled();
    expect(auditEvents().filter(e => e.action.startsWith('blog.comment') && e.outcome === 'success')).toHaveLength(0);
  });
});

describe('adresse du visiteur derrière nginx', () => {
  it('X-Forwarded-For falsifié par le visiteur : seule l’adresse ajoutée par nginx (à droite) compte', async () => {
    const real = '198.51.100.20';
    const statuses = await statusesOf(11, i => post(`203.0.113.${50 + i}, 10.0.0.${i + 1}, ${real}`));
    expect(statuses).toEqual([...times(10, 201), 429]);
    // même partie falsifiée, autre visiteur réel : compteur distinct
    expect((await post(`203.0.113.50, 10.0.0.1, 198.51.100.21`)).status).toBe(201);
  });

  it('X-Real-IP n’est jamais lu', async () => {
    const statuses = await statusesOf(11, i => post('198.51.100.30').set('X-Real-IP', `203.0.113.${150 + i}`));
    expect(statuses).toEqual([...times(10, 201), 429]);
  });

  /** req.ip calculé par Express pour un pair TCP donné, sans réseau */
  const ipSeen = (remoteAddress: string, xff?: string): string | undefined => {
    const req = Object.create(app.request);
    const socket = { remoteAddress };
    Object.assign(req, { headers: xff ? { 'x-forwarded-for': xff } : {}, socket, connection: socket });
    return req.ip;
  };

  it.each([
    ['passerelle Docker (nginx de l’hôte)', '172.18.0.1',        '203.0.113.9, 198.51.100.7',                '198.51.100.7'],
    ['passerelle, adresse IPv4 encapsulée', '::ffff:172.18.0.1', '198.51.100.7',                             '198.51.100.7'],
    ['boucle locale',                       '127.0.0.1',         '198.51.100.7',                             '198.51.100.7'],
    ['réseau privé IPv6',                   'fd00::1',           '198.51.100.7',                             '198.51.100.7'],
    ['adresse privée falsifiée à gauche',   '172.18.0.1',        '198.51.100.66, 10.0.0.5, 203.0.113.44',    '203.0.113.44'],
    ['pair local sans X-Forwarded-For',     '172.18.0.1',        undefined,                                  '172.18.0.1'],
    ['pair public : en-tête ignoré',        '198.51.100.99',     '203.0.113.9',                              '198.51.100.99'],
    ['pair public IPv6 : en-tête ignoré',   '2001:db8::1',       '203.0.113.9',                              '2001:db8::1'],
  ])('%s → req.ip = %s', (_label, peer, xff, expected) => {
    expect(ipSeen(peer, xff)).toBe(expected);
  });

  it('confiance limitée au premier saut local ; jamais « tout faire confiance »', () => {
    expect(app.get('trust proxy')).not.toBe(true);
    expect(trustLocalProxy('172.18.0.1', 0)).toBe(true);
    expect(trustLocalProxy('172.18.0.1', 1)).toBe(false);
    expect(trustLocalProxy('198.51.100.1', 0)).toBe(false);
    for (const bad of ['', 'inconnu', '172.18.0.1, 10.0.0.1', '100.64.0.1', '169.254.1.1']) {
      expect(isLocalAddress(bad)).toBe(false);
    }
  });
});

// Limitation des commentaires : lecture publique et écritures comptées séparément.
// Défaut corrigé : les GET consommaient le quota anti-spam des écritures (10 par heure et par IP) ;
// un visiteur qui ouvrait plus de 10 articles dans l'heure ne voyait plus aucun commentaire (429).
// Aussi : adresse réelle du visiteur derrière nginx (src/lib/trustProxy.ts), en-têtes falsifiés.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { isLocalAddress, trustLocalProxy } from '../src/lib/trustProxy';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';

// ── Modèles MongoDB simulés ──────────────────────────────────
const saves = vi.fn();
function stored(id: string) {
  return {
    _id: id, articleId: 'a1', parentId: null, depth: 0, path: id, guestName: 'Invité',
    content: 'Bonjour', isEdited: false, isDeleted: false, repliesCount: 0, reactions: {},
    createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
  };
}
class FakeComment {
  [key: string]: any;
  static find = vi.fn(() => ({ sort: () => ({ populate: () => ({ lean: async () => [stored('c1')] }) }) }));
  static findById = vi.fn(async (id: string) => (id === 'c1' ? new FakeComment({ ...stored('c1'), reactions: new Map() }) : null));
  static findByIdAndUpdate = vi.fn(async () => null);
  constructor(doc: Record<string, unknown>) { Object.assign(this, { _id: 'c-new', reactions: new Map(), ...doc }); }
  async save() { saves(); return this; }
  async populate() { return this; }
  toObject() { return { ...this }; }
}
vi.mock('../src/models/Comment', () => ({ Comment: FakeComment }));
vi.mock('../src/models/Article', () => ({ Article: { findByIdAndUpdate: vi.fn(async () => null) } }));
vi.mock('../src/models/User', () => {
  const users: Record<string, object> = { visitor1: { _id: 'visitor1', username: 'visiteur', email: 'v@x.test', role: 'visitor' } };
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
    const token = jwt.sign({ _id: 'visitor1', role: 'visitor' }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });
    const statuses = await statusesOf(11, i => request(base).post('/api/comments')
      .set('X-Forwarded-For', `203.0.113.${100 + i}`).set('Authorization', `Bearer ${token}`)
      .send({ articleId: 'a1', content: 'Commentaire du compte' }));
    expect(statuses).toEqual([...times(10, 201), 429]);
  });

  it('réactions, modifications et suppressions comptent comme écritures, même refusées', async () => {
    const ip = '203.0.113.3';
    const attempts = [
      ...[0, 1, 2, 3].map(() => request(base).post('/api/comments/c1/react').set('X-Forwarded-For', ip).send({ emoji: '👍', sessionId: 's1' })),
      ...[0, 1, 2].map(() => request(base).put('/api/comments/c1').set('X-Forwarded-For', ip).send({ content: 'modifié' })),
      ...[0, 1, 2].map(() => request(base).delete('/api/comments/c1').set('X-Forwarded-For', ip)),
    ];
    const statuses: number[] = [];
    for (const a of attempts) statuses.push((await a).status);
    expect(statuses).toEqual([...times(4, 200), ...times(6, 401)]);
    expect((await post(ip)).status).toBe(429);
    expect((await read('a1', ip)).status).toBe(200);
  });
});

describe('routes protégées : contrôles d’administration et MFA intacts', () => {
  it('modération sans MFA (aal1) refusée, anonyme refusé, rien n’est écrit', async () => {
    const aal1 = await request(base).put('/api/comments/c1').set('X-Forwarded-For', '203.0.113.20')
      .set('Authorization', `Bearer ${supabase.token({ aal: 'aal1' })}`).send({ content: 'modéré' });
    expect(aal1.status).toBe(403);
    expect(aal1.body.code).toBe('MFA_REQUIRED');
    const anonymous = await request(base).delete('/api/comments/c1').set('X-Forwarded-For', '203.0.113.21');
    expect(anonymous.status).toBe(401);
    expect(saves).not.toHaveBeenCalled();
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

// P0.A2 — Correctif de confidentialité des commentaires
// Les réponses publiques ne contiennent plus l'e-mail des invités ni les identifiants
// de session des réactions (liste blanche, src/lib/publicComment.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { toPublicComment } from '../src/lib/publicComment';

const GUEST_EMAIL   = 'invite.prive@example.test';
const SESSION_IDS   = ['session-secret-aaa', 'session-secret-bbb'];
const PRIVATE_BITS  = [GUEST_EMAIL, 'guestEmail', 'example.test', ...SESSION_IDS];

function storedComments() {
  return [
    {
      _id: 'c1', articleId: 'a1', parentId: null, depth: 0, path: 'c1',
      guestName: 'Invité Test', guestEmail: GUEST_EMAIL,
      content: 'Bonjour', isEdited: false, isDeleted: false, repliesCount: 1,
      reactions: { '❤️': [...SESSION_IDS], '👍': ['session-secret-ccc'] },
      createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
      ipAddress: '203.0.113.7', internalNote: 'ne doit jamais sortir',
    },
    {
      _id: 'c2', articleId: 'a1', parentId: 'c1', depth: 1, path: 'c1/c2',
      authorId: { _id: 'u1', username: 'admin', avatar: '', role: 'admin', email: 'admin@example.test', password: 'hash' },
      content: 'Réponse', isEdited: false, isDeleted: false, repliesCount: 0, reactions: {},
      createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02'),
    },
  ];
}

class FakeComment {
  [key: string]: any;
  static find = vi.fn(() => ({ sort: () => ({ populate: () => ({ lean: async () => storedComments() }) }) }));
  static findById = vi.fn(async (id: string) => {
    const doc = storedComments().find(c => c._id === id);
    return doc ? new FakeComment({ ...doc, reactions: new Map(Object.entries(doc.reactions)) }) : null;
  });
  static findByIdAndUpdate = vi.fn(async () => null);
  constructor(doc: Record<string, unknown>) { Object.assign(this, { _id: 'c-new', reactions: new Map(), ...doc }); }
  async save() { return this; }
  async populate() { return this; }
  get(key: string) { return this[key]; }
  toObject() { return { ...this }; }
}

vi.mock('../src/models/Comment', () => ({ Comment: FakeComment }));
vi.mock('../src/models/Article', () => ({ Article: { findByIdAndUpdate: vi.fn(async () => null) } }));
vi.mock('../src/models/User', () => {
  const users: Record<string, object> = { admin1: { _id: 'admin1', username: 'admin', email: 'a@x.test', role: 'admin' } };
  return { User: { findById: (id: string) => ({ select: () => ({ lean: async () => users[id] ?? null }) }) } };
});

const { createApp } = await import('../src/app');
const app = createApp();

function expectNoPrivateData(body: unknown) {
  const json = JSON.stringify(body);
  for (const bit of PRIVATE_BITS) expect(json).not.toContain(bit);
  expect(json).not.toMatch(/"email"|ipAddress|internalNote|password|203\.0\.113\.7/);
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/comments/:articleId (public)', () => {
  it('ne contient aucun e-mail ni identifiant de session', async () => {
    const res = await request(app).get('/api/comments/a1');
    expect(res.status).toBe(200);
    expectNoPrivateData(res.body);
  });

  it('conserve ce que la page affiche : nom de l’invité, auteur, arbre, compteurs de réactions', async () => {
    const res = await request(app).get('/api/comments/a1');
    const [root] = res.body.comments;
    expect(root.author).toEqual({ name: 'Invité Test' });
    expect(root.reactions).toEqual({ '❤️': 2, '👍': 1 });
    expect(root.replies[0].author).toEqual({ _id: 'u1', username: 'admin', avatar: '', role: 'admin' });
    expect(res.body.total).toBe(2);
  });
});

describe('autres réponses publiques', () => {
  it('POST /api/comments (invité) ne renvoie pas l’e-mail saisi', async () => {
    const res = await request(app).post('/api/comments')
      .send({ articleId: 'a1', content: 'Nouveau commentaire', guestName: 'Visiteur', guestEmail: GUEST_EMAIL });
    expect(res.status).toBe(201);
    expect(res.body.author).toEqual({ name: 'Visiteur' });
    expectNoPrivateData(res.body);
  });

  it('POST /api/comments/:id/react renvoie des compteurs, pas les sessions', async () => {
    const res = await request(app).post('/api/comments/c1/react').send({ emoji: '❤️', sessionId: 'session-new' });
    expect(res.status).toBe(200);
    expect(res.body.reactions['❤️']).toBe(3);
    expectNoPrivateData(res.body);
    expect(JSON.stringify(res.body)).not.toContain('session-new');
  });

  it('PUT /api/comments/:id (admin) ne renvoie pas l’e-mail de l’invité', async () => {
    const token = jwt.sign({ _id: 'admin1', role: 'admin' }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
    const res = await request(app).put('/api/comments/c1').set('Authorization', `Bearer ${token}`).send({ content: 'Modéré' });
    expect(res.status).toBe(200);
    expectNoPrivateData(res.body);
  });
});

describe('toPublicComment (liste blanche)', () => {
  it('ignore tout champ non prévu, y compris futur', () => {
    const out = toPublicComment({ ...storedComments()[0], futureSecretField: 'x' } as any);
    expect(Object.keys(out).sort()).toEqual([
      '_id', 'articleId', 'author', 'content', 'createdAt', 'depth', 'editedAt', 'isDeleted',
      'isEdited', 'parentId', 'path', 'reactions', 'repliesCount', 'updatedAt',
    ]);
  });

  it('un commentaire supprimé ne renvoie plus son contenu', () => {
    expect(toPublicComment({ _id: 'x', content: 'texte effacé', isDeleted: true }).content).toBe('');
  });
});

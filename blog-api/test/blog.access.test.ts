// P0.A1 — Contrôles d'accès des routes d'administration du blog (JWT du blog)
//  - POST /api/tags : réservé à l'admin (était public)
//  - PUT/DELETE /api/comments/:id : un anonyme n'est plus « propriétaire » d'un commentaire invité
//  - POST /api/auth/admin : route d'amorçage fermée par défaut

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Modèles MongoDB simulés (aucune base pendant les tests) ───
const users: Record<string, { _id: string; username: string; email: string; role: 'admin' | 'visitor' }> = {
  admin1:   { _id: 'admin1',   username: 'admin',   email: 'a@x.test', role: 'admin' },
  visitor1: { _id: 'visitor1', username: 'visitor', email: 'v@x.test', role: 'visitor' },
};
vi.mock('../src/models/User', () => {
  const User: any = function () {};
  User.findById = (id: string) => ({ select: () => ({ lean: async () => users[id] ?? null }) });
  User.findOne = vi.fn(async () => null);
  return { User };
});

const guestComment = { authorId: undefined, content: 'Commentaire invité', isDeleted: false, save: vi.fn(), articleId: 'a1' };
vi.mock('../src/models/Comment', () => ({
  Comment: { findById: vi.fn(async () => guestComment), find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('../src/models/Article', () => ({ Article: { findByIdAndUpdate: vi.fn(async () => null) } }));

const tagCreate = vi.fn(async (doc: object) => ({ _id: 't1', ...doc }));
vi.mock('../src/models/Tag', () => ({ Tag: { create: tagCreate, find: vi.fn() } }));

const { createApp } = await import('../src/app');
const app = createApp();

const blogToken = (id: string, role: 'admin' | 'visitor') =>
  jwt.sign({ _id: id, role }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });

beforeEach(() => {
  guestComment.save.mockClear();
  guestComment.content = 'Commentaire invité';
  tagCreate.mockClear();
});

describe('POST /api/tags', () => {
  it('anonyme → 401', async () => {
    const res = await request(app).post('/api/tags').send({ name: 'spam' });
    expect(res.status).toBe(401);
    expect(tagCreate).not.toHaveBeenCalled();
  });

  it('visiteur connecté → 403', async () => {
    const res = await request(app).post('/api/tags')
      .set('Authorization', `Bearer ${blogToken('visitor1', 'visitor')}`)
      .send({ name: 'spam' });
    expect(res.status).toBe(403);
  });

  it('jeton visiteur affirmant role=admin → 403 (le rôle vient de la base)', async () => {
    const res = await request(app).post('/api/tags')
      .set('Authorization', `Bearer ${blogToken('visitor1', 'admin')}`)
      .send({ name: 'spam' });
    expect(res.status).toBe(403);
  });

  it('jeton signé avec un autre secret → 401', async () => {
    const forged = jwt.sign({ _id: 'admin1', role: 'admin' }, 'attacker-secret');
    const res = await request(app).post('/api/tags').set('Authorization', `Bearer ${forged}`).send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('admin du blog → 201', async () => {
    const res = await request(app).post('/api/tags')
      .set('Authorization', `Bearer ${blogToken('admin1', 'admin')}`)
      .send({ name: 'Sécurité' });
    expect(res.status).toBe(201);
    expect(tagCreate).toHaveBeenCalledWith(expect.objectContaining({ slug: 'securite' }));
  });
});

describe('PUT / DELETE /api/comments/:id sur un commentaire invité', () => {
  it('anonyme ne peut pas modifier → 403', async () => {
    const res = await request(app).put('/api/comments/c1').send({ content: 'défacé' });
    expect(res.status).toBe(403);
    expect(guestComment.save).not.toHaveBeenCalled();
    expect(guestComment.content).toBe('Commentaire invité');
  });

  it('anonyme ne peut pas supprimer → 403', async () => {
    const res = await request(app).delete('/api/comments/c1');
    expect(res.status).toBe(403);
    expect(guestComment.save).not.toHaveBeenCalled();
  });

  it('visiteur connecté non auteur → 403', async () => {
    const res = await request(app).delete('/api/comments/c1')
      .set('Authorization', `Bearer ${blogToken('visitor1', 'visitor')}`);
    expect(res.status).toBe(403);
  });

  it('admin du blog → autorisé', async () => {
    const res = await request(app).delete('/api/comments/c1')
      .set('Authorization', `Bearer ${blogToken('admin1', 'admin')}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/admin (amorçage)', () => {
  it('fermée par défaut, même avec le bon secret → 404', async () => {
    delete process.env.ADMIN_BOOTSTRAP_ENABLED;
    const res = await request(app).post('/api/auth/admin')
      .send({ username: 'evil', email: 'e@x.test', password: 'Password123', adminSecret: process.env.ADMIN_SECRET });
    expect(res.status).toBe(404);
  });

  it('activée : secret absent → 403 (plus de contournement undefined === undefined)', async () => {
    process.env.ADMIN_BOOTSTRAP_ENABLED = 'true';
    const res = await request(app).post('/api/auth/admin')
      .send({ username: 'evil', email: 'e@x.test', password: 'Password123' });
    expect(res.status).toBe(403);
    delete process.env.ADMIN_BOOTSTRAP_ENABLED;
  });

  it('activée mais ADMIN_SECRET trop court → 404', async () => {
    process.env.ADMIN_BOOTSTRAP_ENABLED = 'true';
    const saved = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = 'short';
    const res = await request(app).post('/api/auth/admin').send({ adminSecret: 'short' });
    expect(res.status).toBe(404);
    process.env.ADMIN_SECRET = saved;
    delete process.env.ADMIN_BOOTSTRAP_ENABLED;
  });
});

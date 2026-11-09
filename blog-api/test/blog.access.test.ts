// P0.A1 — Route d'amorçage d'un compte administrateur du blog : fermée par défaut.
// Les écritures d'administration du blog (articles, tags, images, modération) exigent désormais
// l'administrateur Supabase avec MFA : test/blog.admin-mfa.test.ts.

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/models/User', () => {
  const User: any = function () {};
  User.findById = () => ({ select: () => ({ lean: async () => null }) });
  User.findOne = vi.fn(async () => null);
  return { User };
});

const { createApp } = await import('../src/app');
const app = createApp();

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

// P0.A3 — Durcissements hors IA : hash de mot de passe, envoi d'images, limites de corps, CORS.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const admin = { _id: 'admin1', username: 'admin', email: 'a@x.test', role: 'admin' as const };

const populate = vi.fn(async function (this: unknown) { return { _id: 'a1', title: 'Titre' }; });

vi.mock('../src/models/User', async (original) => {
  const actual = await original<typeof import('../src/models/User')>();
  const User: any = Object.create(actual.User);
  User.schema = actual.User.schema;
  User.findById = (id: string) => ({ select: () => ({ lean: async () => (id === 'admin1' ? admin : null) }) });
  return { User };
});

vi.mock('../src/models/Article', () => {
  function Article(this: any, doc: object) {
    Object.assign(this, doc);
    this.save = vi.fn(async () => this);
    this.populate = populate;
  }
  (Article as any).findOne = vi.fn(async () => null);
  (Article as any).findByIdAndUpdate = vi.fn(() => ({ populate }));
  return { Article };
});

vi.mock('../src/models/Tag', () => ({ Tag: { updateMany: vi.fn() } }));

const uploadStream = vi.fn();
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload_stream: uploadStream } } }));

const { createApp } = await import('../src/app');
const { User } = await import('../src/models/User');

const adminToken = () => jwt.sign({ _id: 'admin1', role: 'admin' }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function cloudinaryAnswers(result: object | null, error: Error | null = null) {
  uploadStream.mockImplementation((_options, callback) => ({ end: () => callback(error, result) }));
}

beforeEach(() => {
  populate.mockClear();
  uploadStream.mockReset();
});

describe('hash du mot de passe', () => {
  it('le champ n’est jamais sélectionné par défaut', () => {
    expect((User.schema.path('password') as any).options.select).toBe(false);
  });

  it.each([
    ['POST', () => request(createApp()).post('/api/articles').send({ title: 'Titre', content: 'x' })],
    ['PUT', () => request(createApp()).put('/api/articles/a1').send({ title: 'Titre' })],
  ])('%s /api/articles : auteur limité aux champs publics', async (_label, send) => {
    await send().set('Authorization', `Bearer ${adminToken()}`);
    const [population] = populate.mock.calls[0] as unknown as [{ path?: string; select?: string }[]];
    expect(population[0]).toEqual({ path: 'author', select: 'username avatar bio role' });
  });
});

describe('envoi d’images', () => {
  it('refuse un anonyme sans contacter Cloudinary', async () => {
    const res = await request(createApp()).post('/api/upload').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
    expect(uploadStream).not.toHaveBeenCalled();
  });

  it('administrateur : URL sécurisée renvoyée', async () => {
    cloudinaryAnswers({ secure_url: 'https://res.cloudinary.test/a.png', public_id: 'adjoumani-blog/a' });
    const res = await request(createApp()).post('/api/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://res.cloudinary.test/a.png', public_id: 'adjoumani-blog/a' });
  });

  it('type interdit : aucune transmission', async () => {
    const res = await request(createApp()).post('/api/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', Buffer.from('<html>'), { filename: 'a.html', contentType: 'text/html' });
    expect(res.status).toBe(400);
    expect(uploadStream).not.toHaveBeenCalled();
  });

  it('panne Cloudinary : message neutre', async () => {
    cloudinaryAnswers(null, new Error('détail interne Cloudinary'));
    const res = await request(createApp()).post('/api/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('UPLOAD_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('détail interne');
  });
});

describe('exploitation', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it('corps JSON global limité à 2 Mo (10 Mo auparavant)', async () => {
    const res = await request(createApp()).post('/api/comments/x').send({ content: 'x'.repeat(3 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });

  it('origine locale refusée par CORS en production, acceptée en développement', async () => {
    const origin = 'http://localhost:5173';
    delete process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'production';
    const prod = await request(createApp()).get('/api/health').set('Origin', origin);
    expect(prod.headers['access-control-allow-origin']).toBeUndefined();
    process.env.NODE_ENV = 'test';
    const dev = await request(createApp()).get('/api/health').set('Origin', origin);
    expect(dev.headers['access-control-allow-origin']).toBe(origin);
  });

  it('/api/health/ready signale l’absence de base sans détail interne', async () => {
    expect(mongoose.connection.readyState).not.toBe(1);
    const res = await request(createApp()).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'starting' });
  });
});

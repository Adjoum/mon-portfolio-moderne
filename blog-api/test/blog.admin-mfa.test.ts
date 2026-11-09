// Écritures d'administration du blog : administrateur Supabase + MFA (aal2) + session serveur.
// Faille fermée : le jeton du blog (compte MongoDB « admin », mot de passe seul) publiait, modifiait,
// supprimait des articles, créait des tags, téléversait sur Cloudinary et modérait les commentaires.
// Matrice : anonyme · jeton admin du blog · visiteur · utilisateur Supabase · admin sans MFA ·
//           session expirée · Supabase non configuré · admin MFA (succès, écriture, audit).

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ADMIN_ID, USER_ID, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';
import { auditEvents } from './helpers/audit';

/** Requête Mongoose simulée : chaînable, attendable, .lean() */
function chain<T>(result: T): any {
  const proxy: any = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'then') return (ok: any, ko: any) => Promise.resolve(result).then(ok, ko);
      if (prop === 'lean') return async () => result;
      return () => proxy;
    },
  });
  return proxy;
}

// ── Modèles MongoDB simulés ──────────────────────────────────
const users: Record<string, { _id: string; username: string; email: string; role: 'admin' | 'visitor' }> = {
  blogadmin: { _id: 'blogadmin', username: 'admin',   email: 'a@x.test', role: 'admin' },
  visitor1:  { _id: 'visitor1',  username: 'visitor', email: 'v@x.test', role: 'visitor' },
};
const state = { authorPresent: true };
vi.mock('../src/models/User', () => {
  const User: any = function () {};
  User.findById = (id: string) => ({ select: () => ({ lean: async () => users[id] ?? null }) });
  User.findOne = vi.fn(() => chain(state.authorPresent ? { _id: 'blogadmin' } : null));
  return { User };
});

const draft = { _id: 'a1', title: 'Brouillon', status: 'draft', tags: [] as string[] };
const articleSave = vi.fn();
const articleUpdate = vi.fn(() => chain({ ...draft, title: 'Modifié' }));
const articleDelete = vi.fn(async () => ({ ...draft }));
vi.mock('../src/models/Article', () => {
  function Article(this: any, doc: object) {
    Object.assign(this, doc, { _id: 'new1' });
    this.save = articleSave.mockImplementation(async () => this);
    this.populate = async () => this;
  }
  Object.assign(Article, {
    findOne: vi.fn(async () => null),
    findById: vi.fn(() => chain(draft)),
    findByIdAndUpdate: articleUpdate,
    findByIdAndDelete: articleDelete,
    find: vi.fn(() => chain([])),
    countDocuments: vi.fn(async () => 0),
  });
  return { Article };
});

const tagCreate = vi.fn(async (doc: object) => ({ _id: 't1', ...doc }));
vi.mock('../src/models/Tag', () => ({ Tag: { create: tagCreate, updateMany: vi.fn(), find: vi.fn(() => chain([])) } }));

function comment(id: string, authorId?: string) {
  return {
    _id: id, articleId: 'a1', content: 'Texte', isDeleted: false,
    authorId: authorId ? { toString: () => authorId } : undefined,
    save: vi.fn(async () => undefined),
    populate: async () => undefined,
    toObject() { return { _id: id, content: this.content, authorId: undefined, reactions: {} }; },
  };
}
const comments: Record<string, ReturnType<typeof comment>> = {};
vi.mock('../src/models/Comment', () => ({
  Comment: { findById: vi.fn(async (id: string) => comments[id] ?? null), find: vi.fn() },
}));

const uploadStream = vi.fn((_options: unknown, callback: (e: Error | null, r: object) => void) => ({
  end: () => callback(null, { secure_url: 'https://res.cloudinary.test/a.png', public_id: 'adjoumani-blog/a' }),
}));
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload_stream: uploadStream } } }));

const { createApp } = await import('../src/app');
const app = createApp();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const blogToken = (id: string, role: 'admin' | 'visitor') =>
  jwt.sign({ _id: id, role }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });

type Route = { name: string; send: (token?: string) => request.Test; writes: () => number; action: string | null; ok: number };
// Une adresse par requête : la limite des commentaires (10 par heure et par adresse) ne s'en mêle pas
let requests = 0;
const ip = () => { requests++; return `10.0.${Math.floor(requests / 250) % 250}.${(requests % 250) + 1}`; };
const withToken = (req: request.Test, token?: string) => {
  req.set('X-Forwarded-For', ip());
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const ROUTES: Route[] = [
  { name: 'POST /api/articles', ok: 201, action: 'blog.article.create',
    send: t => withToken(request(app).post('/api/articles'), t).send({ title: 'Titre', content: 'x' }),
    writes: () => articleSave.mock.calls.length },
  { name: 'PUT /api/articles/a1', ok: 200, action: 'blog.article.update',
    send: t => withToken(request(app).put('/api/articles/a1'), t).send({ title: 'Modifié' }),
    writes: () => articleUpdate.mock.calls.length },
  { name: 'DELETE /api/articles/a1', ok: 200, action: 'blog.article.delete',
    send: t => withToken(request(app).delete('/api/articles/a1'), t),
    writes: () => articleDelete.mock.calls.length },
  { name: 'GET /api/articles/id/a1 (brouillon)', ok: 200, action: null,
    send: t => withToken(request(app).get('/api/articles/id/a1'), t),
    writes: () => 0 },
  { name: 'POST /api/tags', ok: 201, action: 'blog.tag.create',
    send: t => withToken(request(app).post('/api/tags'), t).send({ name: 'Sécurité' }),
    writes: () => tagCreate.mock.calls.length },
  { name: 'POST /api/upload', ok: 200, action: 'blog.image.upload',
    send: t => withToken(request(app).post('/api/upload'), t).attach('image', PNG, { filename: 'a.png', contentType: 'image/png' }),
    writes: () => uploadStream.mock.calls.length },
  { name: 'POST /api/upload/multiple', ok: 200, action: 'blog.image.upload',
    send: t => withToken(request(app).post('/api/upload/multiple'), t).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' }),
    writes: () => uploadStream.mock.calls.length },
  { name: 'PUT /api/comments/c-guest (modération)', ok: 200, action: 'blog.comment.moderate',
    send: t => withToken(request(app).put('/api/comments/c-guest'), t).send({ content: 'modéré' }),
    writes: () => comments['c-guest'].save.mock.calls.length },
  { name: 'DELETE /api/comments/c-other (modération)', ok: 200, action: 'blog.comment.delete',
    send: t => withToken(request(app).delete('/api/comments/c-other'), t),
    writes: () => comments['c-other'].save.mock.calls.length },
];

let supabase: FakeSupabase;
beforeAll(async () => { supabase = await startFakeSupabase(); });
afterAll(async () => { await supabase.close(); });
beforeEach(() => {
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  delete process.env.SUPABASE_JWT_SECRET;
  supabase.mode = 'ok';
  supabase.hs256Secret = null;
  supabase.admins.clear();
  supabase.admins.add(ADMIN_ID);
  supabase.sessions.reset();
  resetSupabaseAdminCaches();
  state.authorPresent = true;
  for (const spy of [articleSave, articleUpdate, articleDelete, tagCreate, uploadStream]) spy.mockClear();
  comments['c-guest'] = comment('c-guest');
  comments['c-visitor'] = comment('c-visitor', 'visitor1');
  comments['c-blogadmin'] = comment('c-blogadmin', 'blogadmin');
  comments['c-other'] = comment('c-other', 'other1');
});

describe('refus, sans aucune écriture', () => {
  const refusals: [string, () => string | undefined, number, string][] = [
    ['anonyme',                                         () => undefined,                                          401, 'UNAUTHORIZED'],
    ['jeton admin du blog (mot de passe seul)',         () => blogToken('blogadmin', 'admin'),                    401, 'INVALID_TOKEN'],
    ['jeton visiteur du blog',                          () => blogToken('visitor1', 'visitor'),                   401, 'INVALID_TOKEN'],
    ['utilisateur Supabase ordinaire, même en aal2',    () => supabase.token({ sub: USER_ID, aal: 'aal2' }),      403, 'FORBIDDEN'],
    ['administrateur sans MFA (aal1)',                  () => supabase.token({ aal: 'aal1' }),                    403, 'MFA_REQUIRED'],
  ];
  for (const [label, token, status, code] of refusals) {
    it.each(ROUTES)(`${label} : $name → ${status}`, async (route) => {
      const res = await route.send(token());
      expect(res.status).toBe(status);
      if (status === 401 && code === 'INVALID_TOKEN') expect(['INVALID_TOKEN', 'UNAUTHORIZED']).toContain(res.body.code);
      else expect(res.body.code).toBe(code);
      expect(route.writes()).toBe(0);
    });
  }

  it.each(ROUTES)('session administrateur expirée : $name → 401', async (route) => {
    const sid = '33333333-3333-4333-8333-333333333333';
    supabase.sessions.expire(sid, 'idle_timeout');
    const res = await route.send(supabase.token({ aal: 'aal2', sessionId: sid }));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ADMIN_SESSION_EXPIRED');
    expect(route.writes()).toBe(0);
  });

  it.each(ROUTES)('Supabase non configuré (lancement isolé) : $name → 503', async (route) => {
    delete process.env.SUPABASE_URL;
    const res = await route.send(supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ADMIN_AUTH_NOT_CONFIGURED');
    expect(route.writes()).toBe(0);
  });
});

describe('administrateur avec MFA (aal2) et session active', () => {
  it.each(ROUTES)('$name → succès, écriture et audit', async (route) => {
    const res = await route.send(supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(route.ok);
    if (route.action) {
      expect(route.writes()).toBeGreaterThan(0);
      expect(auditEvents()).toContainEqual(expect.objectContaining({
        action: route.action, outcome: 'success', actorType: 'supabase_admin', actorId: ADMIN_ID,
      }));
    } else {
      expect(res.body.title).toBe('Brouillon');
    }
  });

  it('création sans compte auteur MongoDB : 503 explicite, rien n’est écrit', async () => {
    state.authorPresent = false;
    const res = await ROUTES[0].send(supabase.token({ aal: 'aal2' }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BLOG_AUTHOR_MISSING');
    expect(articleSave).not.toHaveBeenCalled();
  });

  it('l’article créé a pour auteur le compte admin du blog, jamais une valeur du corps', async () => {
    await request(app).post('/api/articles')
      .set('Authorization', `Bearer ${supabase.token({ aal: 'aal2' })}`)
      .send({ title: 'Titre', content: 'x', author: 'visitor1' });
    expect(articleSave.mock.instances[0] ?? articleSave.mock.contexts?.[0]).toBeDefined();
    const created = (articleSave.mock.contexts?.[0] ?? {}) as { author?: string };
    expect(created.author).toBe('blogadmin');
  });
});

describe('ce qui ne change pas', () => {
  it('l’auteur modifie et supprime son propre commentaire avec le jeton du blog', async () => {
    const edit = await withToken(request(app).put('/api/comments/c-visitor'))
      .set('Authorization', `Bearer ${blogToken('visitor1', 'visitor')}`).send({ content: 'corrigé' });
    expect(edit.status).toBe(200);
    const del = await withToken(request(app).delete('/api/comments/c-blogadmin'))
      .set('Authorization', `Bearer ${blogToken('blogadmin', 'admin')}`);
    expect(del.status).toBe(200);
    expect(auditEvents().filter(e => e.action.startsWith('blog.comment'))).toHaveLength(0);
  });

  it('commentaire introuvable : 404 avant tout contrôle d’administration', async () => {
    const res = await withToken(request(app).delete('/api/comments/absent'));
    expect(res.status).toBe(404);
  });

  it('lectures publiques sans jeton : liste des articles et des tags', async () => {
    expect((await request(app).get('/api/articles')).status).toBe(200);
    expect((await request(app).get('/api/tags')).status).toBe(200);
  });
});

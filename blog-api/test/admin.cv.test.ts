// P0.CV — Remplacement du CV public (/api/admin/cv) avec pannes injectées
// Faux Supabase local. La pile réelle est testée par supabase/tests/stack/run.mjs.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ANON_KEY, USER_ID, type FakeSupabase } from './helpers/fakeSupabase';
import { makePdf } from './helpers/pdf';
import { auditEvents } from './helpers/audit';
import { findLeakedSecret } from './helpers/canaries';

let supabase: FakeSupabase;
const app = createApp();
const PDF_A = makePdf('Curriculum vitae version A');
const PDF_B = makePdf('Curriculum vitae version B');

const post = (file: Buffer | null, token?: string, fields: Record<string, string> = {}, filename = 'cv.pdf') => {
  let req = request(app).post('/api/admin/cv');
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return file ? req.attach('file', file, { filename, contentType: 'application/pdf' }) : req;
};
const adminMfa = () => supabase.token({ aal: 'aal2' });

beforeAll(async () => { supabase = await startFakeSupabase(); });
afterAll(async () => { await supabase.close(); });
beforeEach(() => {
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  supabase.mode = 'ok';
  supabase.cv.reset();
  resetSupabaseAdminCaches();
});

describe('contrôle d’accès', () => {
  it('remplacement anonyme → 401, aucun objet', async () => {
    const res = await post(PDF_A);
    expect(res.status).toBe(401);
    expect(supabase.cv.uploadedPaths).toHaveLength(0);
  });

  it('utilisateur connecté non administrateur → 403', async () => {
    const res = await post(PDF_A, supabase.token({ sub: USER_ID, aal: 'aal2' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(supabase.cv.uploadedPaths).toHaveLength(0);
  });

  it('administrateur sans MFA → 403 MFA_REQUIRED', async () => {
    const res = await post(PDF_A, supabase.token({ aal: 'aal1' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    expect(supabase.cv.uploadedPaths).toHaveLength(0);
  });

  it('restauration : anonyme 401, sans MFA 403', async () => {
    const id = crypto.randomUUID();
    expect((await request(app).post(`/api/admin/cv/${id}/restore`)).status).toBe(401);
    const noMfa = await request(app).post(`/api/admin/cv/${id}/restore`).set('Authorization', `Bearer ${supabase.token({ aal: 'aal1' })}`);
    expect(noMfa.body.code).toBe('MFA_REQUIRED');
  });

  it('un rôle envoyé par le navigateur est ignoré', async () => {
    const res = await post(PDF_A, supabase.token({ sub: USER_ID }), { role: 'admin' });
    expect(res.status).toBe(403);
  });
});

describe('validation du fichier', () => {
  it.each([
    ['fichier non PDF',            Buffer.from('MZ exécutable déguisé'),                                 415, 'CV_NOT_PDF'],
    ['HTML renommé en .pdf',       Buffer.from('<script>alert(1)</script>'),                             415, 'CV_NOT_PDF'],
    ['PDF tronqué',                PDF_A.subarray(0, 200),                                               422, 'CV_INVALID_PDF'],
    ['structure corrompue',        Buffer.from('%PDF-1.4\nrien de lisible\n%%EOF\n'),                    422, 'CV_INVALID_PDF'],
    ['PDF avec JavaScript',        makePdf('x', '/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'),   422, 'CV_ACTIVE_CONTENT'],
    ['PDF avec fichier embarqué',  makePdf('x', '/Names << /EmbeddedFile 5 0 R >>'),                     422, 'CV_ACTIVE_CONTENT'],
  ])('%s → %i %s', async (_label, file, status, code) => {
    const res = await post(file, adminMfa());
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(supabase.cv.uploadedPaths).toHaveLength(0);
    expect(supabase.cv.active).toBeNull();
  });

  it('fichier > 10 Mo → 413', async () => {
    const res = await post(Buffer.alloc(10 * 1024 * 1024 + 1, 0x25), adminMfa());
    expect(res.status).toBe(413);
  });

  it('aucun fichier → 400', async () => {
    const res = await post(null, adminMfa()).field('expectedActive', '');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CV_FILE_REQUIRED');
  });

  it('version attendue mal formée → 400', async () => {
    const res = await post(PDF_A, adminMfa(), { expectedActive: 'pas-un-uuid' });
    expect(res.status).toBe(400);
  });
});

describe('publication', () => {
  it('nouvelle version : chemin unique, empreinte serveur, version renvoyée', async () => {
    const res = await post(PDF_A, adminMfa());
    expect(res.status).toBe(201);
    expect(res.body.version.storage_path).toMatch(/^cv\/versions\/[0-9a-f-]{36}\.pdf$/);
    expect(res.body.version.sha256).toBe(crypto.createHash('sha256').update(PDF_A).digest('hex'));
    expect(supabase.cv.active?.id).toBe(res.body.version.id);
    expect(supabase.cv.objects.get(res.body.version.storage_path)).toBe(PDF_A.length);
  });

  it('un remplacement n’écrase jamais l’ancien fichier', async () => {
    const first = await post(PDF_A, adminMfa());
    const second = await post(PDF_B, adminMfa(), { expectedActive: first.body.version.id });
    expect(second.status).toBe(201);
    expect(second.body.version.storage_path).not.toBe(first.body.version.storage_path);
    expect(supabase.cv.objects.size).toBe(2);
  });

  it('fichier identique au CV actif → 409, aucun nouvel objet', async () => {
    const first = await post(PDF_A, adminMfa());
    const res = await post(PDF_A, adminMfa(), { expectedActive: first.body.version.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CV_ALREADY_ACTIVE');
    expect(supabase.cv.objects.size).toBe(1);
  });

  it('audit sans jeton ni contenu', async () => {
    const token = adminMfa();
    const res = await post(PDF_A, token, {}, 'CV-prive.pdf');
    const event = auditEvents().find(e => e.action === 'cv.publish');
    expect(event).toMatchObject({ outcome: 'success', actorType: 'supabase_admin', target: res.body.version.id });
    expect(JSON.stringify(auditEvents())).not.toContain(token);
  });
});

describe('en cas d’échec, l’ancienne version reste active', () => {
  let activeId: string;
  beforeEach(async () => {
    activeId = (await post(PDF_A, adminMfa())).body.version.id;
    resetSupabaseAdminCaches();
  });

  it('téléversement refusé → 502, version active inchangée, aucune publication', async () => {
    supabase.cv.failUpload = true;
    const res = await post(PDF_B, adminMfa(), { expectedActive: activeId });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('CV_STORAGE_ERROR');
    expect(supabase.cv.active?.id).toBe(activeId);
    expect(supabase.cv.objects.size).toBe(1);
  });

  it('écriture en base impossible → 502, nouvel objet retiré', async () => {
    supabase.cv.publishFailure = 'down';
    const res = await post(PDF_B, adminMfa(), { expectedActive: activeId });
    expect(res.status).toBe(502);
    expect(supabase.cv.active?.id).toBe(activeId);
    expect(supabase.cv.objects.size).toBe(1);
  });

  it('un upload réussi sans mise à jour de la base n’est jamais annoncé comme réussi', async () => {
    supabase.cv.publishFailure = 'down';
    const res = await post(PDF_B, adminMfa(), { expectedActive: activeId });
    expect(res.body.version).toBeUndefined();
    expect(res.body.error).toMatch(/inchangée/);
  });

  it('remplacement concurrent → 409 CV_CONFLICT, nouvel objet retiré', async () => {
    const res = await post(PDF_B, adminMfa(), { expectedActive: crypto.randomUUID() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CV_CONFLICT');
    expect(supabase.cv.active?.id).toBe(activeId);
    expect(supabase.cv.objects.size).toBe(1);
  });

  it('nettoyage impossible → objet orphelin journalisé, version active inchangée', async () => {
    supabase.cv.publishFailure = 'down';
    supabase.cv.failDelete = true;
    await post(PDF_B, adminMfa(), { expectedActive: activeId });
    expect(supabase.cv.active?.id).toBe(activeId);
    expect(auditEvents().find(e => e.action === 'cv.orphan_object')?.target).toMatch(/^cv\/versions\//);
  });

  it('migration absente → 503 explicite, aucun objet créé', async () => {
    supabase.cv.publishFailure = 'not_migrated';
    const res = await post(PDF_B, adminMfa(), { expectedActive: activeId });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('CV_NOT_MIGRATED');
    expect(supabase.cv.objects.size).toBe(1);
  });
});

describe('restauration', () => {
  it('réactive une version archivée', async () => {
    const a = (await post(PDF_A, adminMfa())).body.version;
    const b = (await post(PDF_B, adminMfa(), { expectedActive: a.id })).body.version;
    const res = await request(app).post(`/api/admin/cv/${a.id}/restore`)
      .set('Authorization', `Bearer ${adminMfa()}`).send({ expectedActive: b.id });
    expect(res.status).toBe(200);
    expect(supabase.cv.active?.id).toBe(a.id);
    expect(supabase.cv.objects.size).toBe(2);
  });

  it('identifiant invalide → 400 ; version inconnue → 404', async () => {
    const token = adminMfa();
    expect((await request(app).post('/api/admin/cv/abc/restore').set('Authorization', `Bearer ${token}`)).status).toBe(400);
    const res = await request(app).post(`/api/admin/cv/${crypto.randomUUID()}/restore`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CV_VERSION_NOT_FOUND');
  });
});

describe('secrets', () => {
  it('aucune réponse ne contient de secret du serveur', async () => {
    supabase.cv.failUpload = true;
    for (const token of [undefined, 'garbage', supabase.token({ sub: USER_ID }), adminMfa()]) {
      const res = await post(PDF_A, token);
      expect(findLeakedSecret(JSON.stringify(res.body) + JSON.stringify(res.headers))).toBeNull();
    }
  });

  it('aucune clé service_role dans le code de l’API', () => {
    const src = path.join(__dirname, '..', 'src');
    const files = (function walk(d: string): string[] {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []);
    })(src);
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/service_role/i);
    }
  });
});

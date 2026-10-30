// P0.A1 — Validation des contenus et des fichiers de la base de connaissances
// (administrateur authentifié avec MFA : on teste ce que le serveur accepte réellement)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { detectFileKind } from '../src/routes/knowledge';
import { resetSupabaseAdminCaches } from '../src/middleware/supabaseAdmin';
import { startFakeSupabase, ANON_KEY, type FakeSupabase } from './helpers/fakeSupabase';
import { fakeIndex, storedRecords } from './helpers/fakePinecone';
import { auditEvents, allConsoleOutput } from './helpers/audit';

let supabase: FakeSupabase;
let adminToken: string;
const app = createApp();

const SENTENCE = 'Je suis développeur Full Stack et je travaille avec React, Node.js et Python. ';

/** PDF minimal valide (une page, police standard) contenant `text` */
function makePdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function upload(file: Buffer, filename: string, contentType: string, fields: Record<string, string> = {}) {
  let req = request(app)
    .post('/api/agent/knowledge/upload-file')
    .set('Authorization', `Bearer ${adminToken}`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', file, { filename, contentType });
}

function addText(body: object) {
  return request(app)
    .post('/api/agent/knowledge/add-text')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
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
  process.env.KNOWLEDGE_WRITE_ENABLED = 'true';
  resetSupabaseAdminCaches();
  adminToken = supabase.token({ aal: 'aal2' });
});

describe('ajout de texte', () => {
  it('texte valide → indexé avec catégorie et source nettoyées', async () => {
    const res = await addText({ text: SENTENCE.repeat(3), category: 'projets', source: '  dashboard\u0007 ' });
    expect(res.status).toBe(200);
    expect(storedRecords()[0]).toMatchObject({ category: 'projets', source: 'dashboard' });
  });

  it.each([
    ['texte absent',           { category: 'projets' },                          400],
    ['texte non textuel',      { text: { $ne: '' } },                            400],
    ['texte vide',             { text: '   ' },                                  400],
    ['catégorie inconnue',     { text: SENTENCE, category: '<script>' },         400],
    ['catégorie non textuelle',{ text: SENTENCE, category: ['projets'] },        400],
    ['source trop longue',     { text: SENTENCE, source: 's'.repeat(201) },      400],
    ['texte > 20 000 car.',    { text: 'a'.repeat(20_001) },                     413],
  ])('%s → %i', async (_label, body, status) => {
    const res = await addText(body);
    expect(res.status).toBe(status);
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });

  it('corps JSON > 128 Ko refusé avant tout traitement (même anonyme)', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/add-text')
      .send({ text: 'a'.repeat(140_000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('les journaux ne contiennent jamais le contenu ajouté', async () => {
    const marker = 'MARQUEUR_CONTENU_PRIVE_42';
    await addText({ text: `${SENTENCE} ${marker} ${SENTENCE}` });
    expect(allConsoleOutput()).not.toContain(marker);
  });
});

describe('téléversement de fichiers', () => {
  it('TXT valide → indexé', async () => {
    const res = await upload(Buffer.from(SENTENCE.repeat(4), 'utf-8'), 'profil.txt', 'text/plain', { category: 'biographie' });
    expect(res.status).toBe(200);
    expect(res.body.chunksIndexed).toBeGreaterThan(0);
    expect(storedRecords()[0]).toMatchObject({ category: 'biographie', filename: 'profil.txt' });
  });

  it('Markdown envoyé en application/octet-stream (Windows) → accepté', async () => {
    const res = await upload(Buffer.from(`# Profil\n\n${SENTENCE.repeat(2)}`), 'profil.md', 'application/octet-stream');
    expect(res.status).toBe(200);
  });

  it('PDF valide → texte extrait et indexé', async () => {
    const res = await upload(makePdf('Developpeur Full Stack React Node.js Python Supabase MongoDB'), 'cv.pdf', 'application/pdf');
    expect(res.status).toBe(200);
    expect(String(storedRecords()[0]?.text)).toContain('React');
  });

  it.each([
    ['exécutable renommé en .pdf', Buffer.from('MZ\x90\x00\x03\x00\x00\x00binary'), 'cv.pdf',      'application/pdf'],
    ['exécutable .exe',            Buffer.from('MZ\x90\x00\x03\x00'),               'setup.exe',   'application/x-msdownload'],
    ['page HTML',                  Buffer.from('<script>alert(1)</script>'),         'page.html',   'text/html'],
    ['SVG',                        Buffer.from('<svg onload="alert(1)"/>'),          'image.svg',   'image/svg+xml'],
    ['binaire renommé en .txt',    Buffer.from([0x41, 0x00, 0x42, 0x00]),             'notes.txt',   'text/plain'],
    ['texte non UTF-8 en .txt',    Buffer.from([0xff, 0xfe, 0xfd, 0x41]),             'notes.txt',   'text/plain'],
    ['faux DOCX (pas une archive)',Buffer.from('not a zip archive'),                  'cv.docx',     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['PDF annoncé en text/html',   makePdf('Contenu suffisamment long pour etre indexe correctement'), 'cv.pdf', 'text/html'],
    ['double extension',           Buffer.from(SENTENCE),                             'notes.txt.exe','application/octet-stream'],
  ])('%s → 415', async (_label, buffer, filename, type) => {
    const res = await upload(buffer, filename, type);
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });

  it('fichier > 5 Mo → 413', async () => {
    const res = await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 0x61), 'gros.txt', 'text/plain');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('plusieurs fichiers → 400', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/upload-file')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(SENTENCE), 'a.txt')
      .attach('file', Buffer.from(SENTENCE), 'b.txt');
    expect(res.status).toBe(400);
  });

  it('aucun fichier → 400', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/upload-file')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('category', 'document');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_REQUIRED');
  });

  it('catégorie inconnue → 400', async () => {
    const res = await upload(Buffer.from(SENTENCE.repeat(2)), 'a.txt', 'text/plain', { category: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY');
  });

  it('nom de fichier avec chemin → réduit au nom de base', async () => {
    const res = await upload(Buffer.from(SENTENCE.repeat(2)), '..\\..\\etc\\passwd.txt', 'text/plain');
    expect(res.status).toBe(200);
    expect(res.body.filename).not.toMatch(/[\\/]/);
  });

  it('un fichier refusé est journalisé', async () => {
    await upload(Buffer.from('MZ'), 'x.exe', 'application/x-msdownload');
    expect(auditEvents().find(e => e.action === 'knowledge.upload_file'))
      .toMatchObject({ outcome: 'denied', details: { reason: 'unsupported_type' } });
  });

  it('un upload anonyme n’est jamais lu ni analysé', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/upload-file')
      .attach('file', makePdf('x'), 'cv.pdf');
    expect(res.status).toBe(401);
    expect(fakeIndex.upsertRecords).not.toHaveBeenCalled();
  });
});

describe('détection du type de fichier', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  it.each([
    ['cv.pdf',  'application/pdf', Buffer.from('%PDF-1.7\n'), 'pdf'],
    ['cv.PDF',  '',                Buffer.from('%PDF-1.7\n'), 'pdf'],
    ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip, 'docx'],
    ['a.md',    'text/markdown',   Buffer.from('# Titre'),    'text'],
    ['a.txt',   'text/plain',      Buffer.from('é à ü'),      'text'],
    ['cv.docx', 'text/html',       zip,                       null],
    ['cv.zip',  'application/zip', zip,                       null],
    ['cv.pdf',  'application/pdf', Buffer.from('%PDX'),       null],
    ['a',       'text/plain',      Buffer.from('texte'),      null],
  ])('%s (%s) → %s', (name, mime, buf, expected) => {
    expect(detectFileKind(name, mime, buf)).toBe(expected);
  });
});

describe('recherche et suppression', () => {
  it('requête > 500 caractères → 400', async () => {
    const res = await request(app)
      .post('/api/agent/knowledge/search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ query: 'q'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('la requête de recherche n’est pas journalisée', async () => {
    const marker = 'RECHERCHE_PRIVEE_77';
    await request(app)
      .post('/api/agent/knowledge/search')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ query: marker });
    expect(allConsoleOutput()).not.toContain(marker);
  });

  it.each(['..%2F..%2Fetc', 'a%20b', 'x'.repeat(129), '%3Cscript%3E'])('identifiant invalide %s → 400', async (id) => {
    const res = await request(app)
      .delete(`/api/agent/knowledge/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(fakeIndex.deleteOne).not.toHaveBeenCalled();
  });

  it('erreur Pinecone → message neutre, sans détail interne', async () => {
    fakeIndex.searchRecords.mockRejectedValueOnce(new Error('pinecone internal: host=xyz.svc apiKey=CANARY_x'));
    const res = await request(app)
      .get('/api/agent/knowledge/list')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/pinecone internal|CANARY|xyz\.svc/);
  });
});

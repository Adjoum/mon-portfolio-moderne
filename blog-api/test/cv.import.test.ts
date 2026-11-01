// P2 — POST /api/cv/import : l'API n'analyse jamais le fichier ; elle vérifie type et signature,
// applique quotas et concurrence, transmet uniquement les octets et le format au service isolé
// cv-extractor (ici un faux service local), puis revérifie la réponse. Rien n'est écrit ni journalisé.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { findLeakedSecret } from './helpers/canaries';

const { createApp } = await import('../src/app');
const { createImporter, MAX_IMPORT_BYTES } = await import('../src/latex/import');

const PDF = Buffer.from('%PDF-1.7\nCV Awa Konan\n%%EOF');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('contenu docx')]);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SECRET_TEXT = 'Texte du CV : Awa Konan, née le 12/03/1995, passeport 123456';

interface Received { headers: http.IncomingHttpHeaders; body: Buffer }
const received: Received[] = [];
let reply: (res: http.ServerResponse) => void = res => json(res, 200, { text: SECRET_TEXT, truncated: false, pages: 1, needsOcr: false });
let extractor: http.Server;
let url = '';
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  extractor = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks) }); reply(res); });
  });
  await new Promise<void>(r => extractor.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(extractor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => extractor.close(() => r())));
beforeEach(() => {
  received.length = 0;
  reply = res => json(res, 200, { text: SECRET_TEXT, truncated: false, pages: 1, needsOcr: false });
});

let ip = 0;
const appWith = (over: Partial<Parameters<typeof createImporter>[0]> = {}, now?: () => number) =>
  createApp({ latex: { importer: createImporter({ extractorUrl: url, timeoutMs: 2000, maxConcurrency: 4, perSubjectPerDay: 100, globalPerDay: 1000, ...over }, { now }) } });
const upload = (app: ReturnType<typeof createApp>, body: Buffer, type: string, addr = `203.0.113.${++ip}`) =>
  request(app).post('/api/cv/import').set('X-Forwarded-For', addr).set('Content-Type', 'application/octet-stream').set('X-File-Type', type).send(body);

describe('POST /api/cv/import', () => {
  it('sans extracteur configuré → 503 IMPORT_DISABLED', async () => {
    const res = await upload(createApp(), PDF, 'application/pdf');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IMPORT_DISABLED');
  });

  it('texte extrait renvoyé ; seuls les octets et le format sont transmis', async () => {
    const res = await request(appWith()).post('/api/cv/import')
      .set('X-Forwarded-For', '198.51.100.9').set('Cookie', 'session=abc').set('Authorization', 'Bearer x')
      .set('X-File-Name', 'cv-awa-konan.pdf').set('Content-Type', 'application/octet-stream').set('X-File-Type', 'application/pdf')
      .send(PDF);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ text: SECRET_TEXT, truncated: false, pages: 1, needsOcr: false });
    const [call] = received;
    expect(Buffer.compare(call.body, PDF)).toBe(0);
    expect(call.headers['x-file-kind']).toBe('pdf');
    for (const h of ['cookie', 'authorization', 'x-file-name', 'x-forwarded-for', 'x-file-type']) expect(call.headers[h], h).toBeUndefined();
    expect(JSON.stringify(call.headers)).not.toContain('198.51.100.9');
  });

  it.each([
    ['application/pdf', 'pdf'], [DOCX_TYPE, 'docx'], ['text/plain; charset=utf-8', 'txt'], ['application/rtf', 'rtf'], ['text/rtf', 'rtf'],
  ])('type %s → format %s', async (type, kind) => {
    const body = kind === 'pdf' ? PDF : kind === 'docx' ? DOCX : kind === 'rtf' ? Buffer.from('{\\rtf1 x}') : Buffer.from('Awa Konan');
    expect((await upload(appWith(), body, type)).status).toBe(200);
    expect(received[0].headers['x-file-kind']).toBe(kind);
  });

  it.each([
    ['HTML', Buffer.from('<html>'), 'text/html', 415, 'IMPORT_UNSUPPORTED_TYPE'],
    ['image (lue par l’IA, pas par l’extracteur)', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg', 415, 'IMPORT_UNSUPPORTED_TYPE'],
    ['PDF annoncé DOCX', PDF, DOCX_TYPE, 415, 'IMPORT_TYPE_MISMATCH'],
    ['exécutable annoncé PDF', Buffer.from('MZ\x90\x00'), 'application/pdf', 415, 'IMPORT_TYPE_MISMATCH'],
    ['binaire annoncé texte', Buffer.from([0x41, 0x00, 0x42]), 'text/plain', 415, 'IMPORT_TYPE_MISMATCH'],
    ['fichier vide', Buffer.alloc(0), 'application/pdf', 400, 'IMPORT_EMPTY'],
  ])('%s → %i %s, sans appel à l’extracteur', async (_label, body, type, status, code) => {
    const res = await upload(appWith(), body, type);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(received).toHaveLength(0);
  });

  it('corps JSON (formulaire, script) refusé : seuls les octets bruts sont acceptés', async () => {
    const res = await request(appWith()).post('/api/cv/import').set('X-File-Type', 'application/pdf').send({ file: PDF.toString('base64') });
    expect(res.status).toBe(415);
    expect(received).toHaveLength(0);
  });

  it('fichier > 10 Mo → 413 avant tout traitement', async () => {
    const res = await upload(appWith(), Buffer.concat([PDF, Buffer.alloc(MAX_IMPORT_BYTES)]), 'application/pdf');
    expect(res.status).toBe(413);
    expect(received).toHaveLength(0);
  });

  it.each([
    [422, { code: 'EXTRACT_ACTIVE_CONTENT' }, 422, 'IMPORT_ACTIVE_CONTENT'],
    [422, { code: 'EXTRACT_TOO_COMPLEX' }, 422, 'IMPORT_TOO_COMPLEX'],
    [422, { code: 'EXTRACT_PROTECTED' }, 422, 'IMPORT_PROTECTED'],
    [422, { code: 'EXTRACT_SECRET_INTERNE', stack: '/app/src/parsers.mjs' }, 502, 'IMPORT_EXTRACTOR_ERROR'],
    [503, { code: 'EXTRACT_BUSY' }, 503, 'IMPORT_BUSY'],
    [500, { code: 'EXTRACT_INTERNAL' }, 502, 'IMPORT_EXTRACTOR_ERROR'],
  ])('réponse %i %j de l’extracteur → %i %s, rien d’autre relayé', async (status, body, expectedStatus, code) => {
    reply = res => json(res, status, body);
    const res = await upload(appWith(), PDF, 'application/pdf');
    expect(res.status).toBe(expectedStatus);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'error']);
    expect(res.body.code).toBe(code);
  });

  it('réponse revérifiée : texte borné à 20 000 caractères, champs inconnus retirés', async () => {
    reply = res => json(res, 200, { text: 'x'.repeat(25_000), truncated: false, pages: 'deux', needsOcr: 'oui', env: process.env });
    const res = await upload(appWith(), PDF, 'application/pdf');
    expect(res.body.text).toHaveLength(20_000);
    expect(res.body).toEqual({ text: res.body.text, truncated: true, pages: null, needsOcr: false });
    expect(findLeakedSecret(JSON.stringify(res.body))).toBeNull();
  });

  it('extracteur trop lent → 504 ; injoignable → 503', async () => {
    reply = () => { /* aucune réponse */ };
    expect((await upload(appWith({ timeoutMs: 300 }), PDF, 'application/pdf')).body.code).toBe('IMPORT_TIMEOUT');
    const closed = createApp({ latex: { importer: createImporter({ extractorUrl: 'http://127.0.0.1:1', timeoutMs: 2000, maxConcurrency: 2, perSubjectPerDay: 10, globalPerDay: 10 }) } });
    const res = await upload(closed, PDF, 'application/pdf');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('IMPORT_UNAVAILABLE');
  });

  it('quota journalier par visiteur', async () => {
    const app = appWith({ perSubjectPerDay: 2 });
    for (let i = 0; i < 2; i++) expect((await upload(app, PDF, 'application/pdf', '203.0.113.250')).status).toBe(200);
    const res = await upload(app, PDF, 'application/pdf', '203.0.113.250');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('IMPORT_QUOTA_EXCEEDED');
  });

  it('aucun fichier écrit, aucun contenu ni nom de fichier journalisé', async () => {
    const write = vi.spyOn(fs.promises, 'writeFile');
    const writeSync = vi.spyOn(fs, 'writeFileSync');
    const log = console.log as unknown as ReturnType<typeof vi.fn>;
    const error = console.error as unknown as ReturnType<typeof vi.fn>;
    log.mockClear();
    error.mockClear();
    reply = res => json(res, 422, { code: 'EXTRACT_ACTIVE_CONTENT' });
    await request(appWith()).post('/api/cv/import').set('X-File-Name', 'cv-awa-konan.pdf').set('Content-Type', 'application/octet-stream').set('X-File-Type', 'application/pdf').send(PDF);
    reply = res => json(res, 200, { text: SECRET_TEXT, truncated: false, pages: 1, needsOcr: false });
    await upload(appWith(), PDF, 'application/pdf');
    expect(write).not.toHaveBeenCalled();
    expect(writeSync).not.toHaveBeenCalled();
    const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    expect(logged).not.toMatch(/Awa|Konan|passeport|cv-awa|CV Awa/);
    write.mockRestore();
    writeSync.mockRestore();
  });

  it('GET → 405', async () => {
    expect((await request(appWith()).get('/api/cv/import')).status).toBe(405);
  });
});

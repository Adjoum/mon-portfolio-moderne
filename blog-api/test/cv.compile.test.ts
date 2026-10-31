// Compilation LaTeX (faille S2) :
//  - sans LATEX_RUNNER_URL, la route reste fermée (503), comme depuis P0.A1 ;
//  - aucun processus TeX n'est jamais lancé par l'API (garde statique sur tout src/) ;
//  - avec le runner, l'API ne transmet que { tex, photo }, filtre les réponses et applique
//    limites de taille, quotas et concurrence. Le runner est ici un faux serveur HTTP local.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import request from 'supertest';
import { findLeakedSecret } from './helpers/canaries';

const spawnSpy = vi.fn();
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: spawnSpy, exec: spawnSpy, execFile: spawnSpy, fork: spawnSpy };
});

const { createApp } = await import('../src/app');
const { createLatexCompiler, latexConfigFromEnv, MAX_TEX_BYTES } = await import('../src/latex/compile');

const MALICIOUS_TEX = String.raw`\documentclass{article}\begin{document}\input{/etc/passwd}\immediate\write18{env}\end{document}`;
const VALID_TEX = String.raw`\documentclass{article}\begin{document}Bonjour\end{document}`;
const FAKE_PDF = Buffer.concat([Buffer.from('%PDF-1.5\n'), Buffer.alloc(200, 0x20), Buffer.from('\n%%EOF\n')]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// ── Faux runner ───────────────────────────────────────────────
interface Received { headers: http.IncomingHttpHeaders; body: string; closedEarly: boolean }
type Behaviour = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void | Promise<void>;
const received: Received[] = [];
let behaviour: Behaviour = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAKE_PDF); };
let runner: http.Server;
let runnerUrl = '';

beforeAll(async () => {
  runner = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const entry: Received = { headers: req.headers, body: Buffer.concat(chunks).toString('utf8'), closedEarly: false };
      res.on('close', () => { if (!res.writableEnded) entry.closedEarly = true; });
      received.push(entry);
      void behaviour(req, res, entry.body);
    });
  });
  await new Promise<void>(r => runner.listen(0, '127.0.0.1', r));
  runnerUrl = `http://127.0.0.1:${(runner.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => runner.close(() => r())));
beforeEach(() => {
  received.length = 0;
  behaviour = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAKE_PDF); };
});

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

let ipCounter = 0;
const freshIp = () => `203.0.113.${++ipCounter}`;

function appWith(overrides: Partial<Parameters<typeof createLatexCompiler>[0]> = {}, now?: () => number) {
  const compiler = createLatexCompiler({
    runnerUrl, timeoutMs: 2000, maxConcurrency: 4, perSubjectPerDay: 100, globalPerDay: 1000, ...overrides,
  }, { now });
  return createApp({ latex: { compiler } });
}

const compile = (app: ReturnType<typeof createApp>, body: unknown, ip = freshIp()) =>
  request(app).post('/api/cv/compile').set('X-Forwarded-For', ip).send(body as object);

// ── Sans runner : fermée ──────────────────────────────────────
describe('POST /api/cv/compile sans latex-runner configuré', () => {
  const app = createApp();

  it('visiteur anonyme → 503 LATEX_COMPILE_DISABLED', async () => {
    const res = await request(app).post('/api/cv/compile').send({ code: MALICIOUS_TEX });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('LATEX_COMPILE_DISABLED');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('reste fermée même si un drapeau tente de la réactiver', async () => {
    process.env.LATEX_COMPILE_ENABLED = 'true';
    const res = await request(createApp()).post('/api/cv/compile').send({ code: MALICIOUS_TEX, photo: 'data:image/jpeg;base64,AAAA' });
    expect(res.status).toBe(503);
    delete process.env.LATEX_COMPILE_ENABLED;
  });

  it.each(['get', 'put', 'delete'] as const)('%s /api/cv/compile → 503', async (method) => {
    expect((await request(app)[method]('/api/cv/compile')).status).toBe(503);
  });

  it('aucun processus enfant n’est lancé', async () => {
    await request(app).post('/api/cv/compile').send({ code: MALICIOUS_TEX });
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('aucun fichier temporaire n’est écrit', async () => {
    const writeSpy = vi.spyOn(fs.promises, 'writeFile');
    await request(app).post('/api/cv/compile').send({ code: MALICIOUS_TEX });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

describe('LATEX_RUNNER_URL', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['pas une url', null],
    ['file:///etc/passwd', null],
    ['http://utilisateur:motdepasse@latex-runner:3000', null],
    ['http://latex-runner:3000/?redirection=1', null],
    ['http://latex-runner:3000', 'http://latex-runner:3000'],
    ['http://latex-runner:3000/', 'http://latex-runner:3000'],
  ])('%s → %s', (value, expected) => {
    expect(latexConfigFromEnv({ LATEX_RUNNER_URL: value })?.runnerUrl ?? null).toBe(expected);
  });

  it('valeurs par défaut : 2 compilations simultanées, 300 par visiteur et par jour', () => {
    expect(latexConfigFromEnv({ LATEX_RUNNER_URL: 'http://latex-runner:3000' })).toEqual({
      runnerUrl: 'http://latex-runner:3000', timeoutMs: 30_000, maxConcurrency: 2, perSubjectPerDay: 300, globalPerDay: 5000,
    });
  });
});

// ── Avec runner ───────────────────────────────────────────────
describe('POST /api/cv/compile avec latex-runner', () => {
  it('renvoie le PDF du runner, sans cache ni interprétation par le navigateur', async () => {
    const res = await compile(appWith(), { code: VALID_TEX });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline; filename="cv.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(res.body as Buffer, FAKE_PDF)).toBe(0);
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('transmet uniquement { tex, photo } : ni cookie, ni jeton, ni adresse IP, ni secret', async () => {
    const res = await request(appWith()).post('/api/cv/compile')
      .set('Cookie', 'token=session-du-visiteur')
      .set('Authorization', 'Bearer jeton-admin')
      .set('X-Forwarded-For', '198.51.100.7')
      .set('X-Custom', 'valeur')
      .send({ code: VALID_TEX, photo: `data:image/jpeg;base64,${JPEG.toString('base64')}` });
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    const [{ headers, body }] = received;
    expect(JSON.parse(body)).toEqual({ tex: VALID_TEX, photo: JPEG.toString('base64') });
    for (const name of ['cookie', 'authorization', 'x-forwarded-for', 'x-real-ip', 'x-custom', 'forwarded']) expect(headers[name], name).toBeUndefined();
    const everything = `${JSON.stringify(headers)}${body}`;
    expect(everything).not.toContain('198.51.100.7');
    expect(findLeakedSecret(everything)).toBeNull();
  });

  it('sans photo, le runner ne reçoit que le source', async () => {
    await compile(appWith(), { code: VALID_TEX });
    expect(Object.keys(JSON.parse(received[0].body))).toEqual(['tex']);
  });

  it.each([
    ['corps vide', {}, 400, 'LATEX_INVALID_REQUEST'],
    ['source vide', { code: '   ' }, 400, 'LATEX_EMPTY_SOURCE'],
    ['champ inconnu', { code: VALID_TEX, engine: 'lualatex' }, 400, 'LATEX_INVALID_REQUEST'],
    ['source non textuel', { code: ['x'] }, 400, 'LATEX_INVALID_REQUEST'],
    ['source > 200 Ko', { code: `${VALID_TEX}%${'x'.repeat(MAX_TEX_BYTES)}` }, 413, 'LATEX_TOO_LARGE'],
    ['photo PNG', { code: VALID_TEX, photo: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}` }, 400, 'LATEX_INVALID_PHOTO'],
    ['photo non JPEG déclarée JPEG', { code: VALID_TEX, photo: `data:image/jpeg;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` }, 400, 'LATEX_INVALID_PHOTO'],
    ['photo > 2 Mo', { code: VALID_TEX, photo: `data:image/jpeg;base64,${Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]).toString('base64')}` }, 413, 'LATEX_PHOTO_TOO_LARGE'],
  ])('%s → %i %s, sans appel au runner', async (_label, body, status, code) => {
    const res = await compile(appWith(), body);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(received).toHaveLength(0);
  });

  it('corps > 3 Mo → 413 avant toute lecture', async () => {
    const res = await compile(appWith(), { code: VALID_TEX, photo: `data:image/jpeg;base64,${'A'.repeat(3.2 * 1024 * 1024)}` });
    expect(res.status).toBe(413);
    expect(received).toHaveLength(0);
  });

  it('formulaire HTML (text/plain) refusé : seul JSON est accepté', async () => {
    const res = await request(appWith()).post('/api/cv/compile').set('Content-Type', 'text/plain').send(`code=${VALID_TEX}`);
    expect(res.status).toBe(415);
    expect(received).toHaveLength(0);
  });

  it('GET → 405', async () => {
    expect((await request(appWith()).get('/api/cv/compile')).status).toBe(405);
  });

  it('commande refusée par le runner : message clair, commande nommée', async () => {
    behaviour = (_req, res) => json(res, 422, { code: 'LATEX_FORBIDDEN_COMMAND', subject: '\\write', line: 3 });
    const res = await compile(appWith(), { code: MALICIOUS_TEX });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'LATEX_FORBIDDEN_COMMAND', line: 3 });
    expect(res.body.error).toContain('\\write');
  });

  it('erreurs de compilation filtrées une seconde fois : 5 au plus, sans chemin ni caractère de contrôle', async () => {
    behaviour = (_req, res) => json(res, 422, {
      code: 'LATEX_COMPILE_ERROR',
      errors: Array.from({ length: 9 }, (_, i) => ({
        line: i + 1,
        message: `Erreur dans /usr/share/texlive/texmf-dist/tex/latex/x.sty et /work/job-AbC/main.tex\u001b[31m ${'y'.repeat(400)}`,
        context: '\\foo',
        secret: process.env.JWT_SECRET,
      })),
    });
    const res = await compile(appWith(), { code: VALID_TEX });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LATEX_COMPILE_ERROR');
    expect(res.body.details).toHaveLength(5);
    expect(Object.keys(res.body.details[0]).sort()).toEqual(['context', 'line', 'message']);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\/usr\/share|\/work\/|job-AbC|\\u001b/);
    expect(res.body.details[0].message.length).toBeLessThanOrEqual(240);
    expect(findLeakedSecret(text)).toBeNull();
  });

  it.each([
    ['code inconnu', 422, { code: 'LATEX_EXEC', output: 'root:x:0:0 /etc/passwd' }],
    ['erreur interne avec trace', 500, { code: 'LATEX_INTERNAL', stack: 'Error at /app/src/compile.mjs' }],
  ])('réponse inattendue du runner (%s) → 502 générique, rien n’est relayé', async (_label, status, body) => {
    behaviour = (_req, res) => json(res, status, body);
    const res = await compile(appWith(), { code: VALID_TEX });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ code: 'LATEX_RUNNER_ERROR', error: expect.any(String) });
  });

  it.each([
    ['HTML déguisé en PDF', 'application/pdf', '<html><script>alert(document.cookie)</script></html>'],
    ['HTML', 'text/html', '<html></html>'],
    ['PDF tronqué (sans %%EOF)', 'application/pdf', `%PDF-1.5\n${' '.repeat(200)}`],
  ])('contenu non PDF (%s) → 502, jamais transmis au navigateur', async (_label, type, content) => {
    behaviour = (_req, res) => { res.writeHead(200, { 'Content-Type': type }); res.end(content); };
    const res = await compile(appWith(), { code: VALID_TEX });
    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(JSON.stringify(res.body)).not.toContain('script');
  });

  it('PDF > 10 Mo → 422 LATEX_RESOURCE_LIMIT', async () => {
    behaviour = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(Buffer.concat([Buffer.from('%PDF-1.5\n'), Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from('%%EOF')]));
    };
    const res = await compile(appWith(), { code: VALID_TEX });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LATEX_RESOURCE_LIMIT');
  });

  it('runner injoignable → 503 LATEX_RUNNER_UNAVAILABLE', async () => {
    const closed = http.createServer();
    await new Promise<void>(r => closed.listen(0, '127.0.0.1', r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(r => closed.close(() => r()));
    const compiler = createLatexCompiler({ runnerUrl: `http://127.0.0.1:${port}`, timeoutMs: 2000, maxConcurrency: 2, perSubjectPerDay: 10, globalPerDay: 10 });
    const res = await compile(createApp({ latex: { compiler } }), { code: VALID_TEX });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('LATEX_RUNNER_UNAVAILABLE');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('runner trop lent → 504 LATEX_TIMEOUT, requête au runner abandonnée', async () => {
    behaviour = () => { /* aucune réponse */ };
    const res = await compile(appWith({ timeoutMs: 300 }), { code: VALID_TEX });
    expect(res.status).toBe(504);
    expect(res.body.code).toBe('LATEX_TIMEOUT');
    await new Promise(r => setTimeout(r, 100));
    expect(received[0].closedEarly).toBe(true);
  });

  it('abandon par le visiteur : la requête au runner est annulée (TeX arrêté)', async () => {
    behaviour = () => { /* compilation en cours */ };
    const compiler = createLatexCompiler({ runnerUrl, timeoutMs: 5000, maxConcurrency: 2, perSubjectPerDay: 10, globalPerDay: 10 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);
    await expect(compiler.compile('ip:x', { tex: VALID_TEX }, controller.signal)).rejects.toMatchObject({ code: 'LATEX_ABORTED' });
    await new Promise(r => setTimeout(r, 100));
    expect(received[0].closedEarly).toBe(true);
    // La place est libérée : une nouvelle compilation passe
    behaviour = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAKE_PDF); };
    await expect(compiler.compile('ip:x', { tex: VALID_TEX }, new AbortController().signal)).resolves.toBeInstanceOf(Buffer);
  });
});

describe('quotas et concurrence', () => {
  const slow: Behaviour = (_req, res) => { setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAKE_PDF); }, 250); };

  it('concurrence globale : au-delà de la limite → 503 LATEX_BUSY avec Retry-After', async () => {
    behaviour = slow;
    const app = appWith({ maxConcurrency: 1 });
    const [a, b] = await Promise.all([compile(app, { code: VALID_TEX }), compile(app, { code: VALID_TEX })]);
    expect([a.status, b.status].sort()).toEqual([200, 503]);
    const busy = a.status === 503 ? a : b;
    expect(busy.body.code).toBe('LATEX_BUSY');
    expect(busy.headers['retry-after']).toBeDefined();
    expect(received).toHaveLength(1);
  });

  it('un visiteur : une compilation à la fois → 429 LATEX_BUSY', async () => {
    behaviour = slow;
    const app = appWith({ maxConcurrency: 4 });
    const ip = freshIp();
    const [a, b] = await Promise.all([compile(app, { code: VALID_TEX }, ip), compile(app, { code: VALID_TEX }, ip)]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
  });

  it('quota journalier par visiteur, puis global ; remis à zéro le jour suivant (UTC)', async () => {
    let t = Date.UTC(2026, 9, 31, 23, 0, 0);
    const app = appWith({ perSubjectPerDay: 2, globalPerDay: 3 }, () => t);
    const ip = freshIp();
    expect((await compile(app, { code: VALID_TEX }, ip)).status).toBe(200);
    expect((await compile(app, { code: VALID_TEX }, ip)).status).toBe(200);
    const third = await compile(app, { code: VALID_TEX }, ip);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('LATEX_QUOTA_EXCEEDED');
    expect(Number(third.headers['retry-after'])).toBe(3600);
    // Autre visiteur : 3e compilation du jour au total, puis quota global atteint
    expect((await compile(app, { code: VALID_TEX })).status).toBe(200);
    expect((await compile(app, { code: VALID_TEX })).body.code).toBe('LATEX_QUOTA_EXCEEDED');
    t += 2 * 3600 * 1000;
    expect((await compile(app, { code: VALID_TEX }, ip)).status).toBe(200);
    expect(received).toHaveLength(4);
  });

  it('refus de validation : aucune consommation de quota', async () => {
    const app = appWith({ perSubjectPerDay: 1 });
    const ip = freshIp();
    expect((await compile(app, { code: '' }, ip)).status).toBe(400);
    expect((await compile(app, { code: VALID_TEX }, ip)).status).toBe(200);
  });

  it('limite par IP sur 10 minutes (LATEX_COMPILE_PER_10MIN)', async () => {
    process.env.LATEX_COMPILE_PER_10MIN = '3';
    try {
      const app = appWith();
      const ip = freshIp();
      for (let i = 0; i < 3; i++) expect((await compile(app, { code: VALID_TEX }, ip)).status).toBe(200);
      const res = await compile(app, { code: VALID_TEX }, ip);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    } finally {
      delete process.env.LATEX_COMPILE_PER_10MIN;
    }
  });
});

describe('garde statique : aucune exécution de processus dans l’API', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = (function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []);
  })(srcDir);

  it.each(files.map(f => [path.relative(srcDir, f), f]))('%s n’importe pas child_process', (_rel, file) => {
    const code = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // blocs commentés
      .replace(/^\s*\/\/.*$/gm, '');      // lignes commentées
    expect(code).not.toMatch(/['"](node:)?child_process['"]/);
    // Appels de lancement de processus (les noms de moteurs TeX peuvent figurer dans des prompts)
    expect(code).not.toMatch(/\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\s*\(/);
    // Aucun moteur TeX invoqué depuis l'API
    expect(code).not.toMatch(/['"`](pdflatex|latexmk|xelatex|lualatex)['"`]/);
  });

  it('le module de compilation n’écrit aucun fichier', () => {
    const code = fs.readFileSync(path.join(srcDir, 'latex', 'compile.ts'), 'utf8');
    expect(code).not.toMatch(/\bfs\b|writeFile|mkdtemp|tmpdir/);
  });
});

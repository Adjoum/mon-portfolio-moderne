// P0.A1 — Compilation LaTeX publique fermée (faille S2)
// La route répond 503 pour tout le monde et aucun processus TeX ne peut être lancé
// depuis le processus API, quel que soit l'environnement.

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';

const spawnSpy = vi.fn();
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: spawnSpy, exec: spawnSpy, execFile: spawnSpy, fork: spawnSpy };
});

const { createApp } = await import('../src/app');
const app = createApp();

const MALICIOUS_TEX = String.raw`\documentclass{article}\begin{document}\input{/etc/passwd}\immediate\write18{env}\end{document}`;

describe('POST /api/cv/compile', () => {
  it('visiteur anonyme → 503 LATEX_COMPILE_DISABLED', async () => {
    const res = await request(app).post('/api/cv/compile').send({ code: MALICIOUS_TEX });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('LATEX_COMPILE_DISABLED');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('reste fermée même si un drapeau tente de la réactiver', async () => {
    process.env.LATEX_COMPILE_ENABLED = 'true';
    const res = await request(app).post('/api/cv/compile').send({ code: MALICIOUS_TEX, photo: 'data:image/jpeg;base64,AAAA' });
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
  });
});

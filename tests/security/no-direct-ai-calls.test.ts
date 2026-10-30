// P0.A2 — Aucun appel direct à un fournisseur IA ni aucune clé privée dans le code servi au navigateur
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'secret-patterns.json'), 'utf8'))

/** Code mort non routé (décision D12 en attente) : vérifié non importé ci-dessous */
const DEAD_FILES = ['src/pages/CVBuilder/LaTeXEditor1.tsx']

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
}

const browserFiles = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'public')).filter(f => /\.(js|mjs|html|json)$/.test(f)),
  path.join(ROOT, 'index.html'),
].filter(f => /\.(tsx?|jsx?|mjs|html|json)$/.test(f) && !f.endsWith('.test.ts'))
  .map(f => path.relative(ROOT, f).replace(/\\/g, '/'))

describe('sources servies au navigateur', () => {
  it.each(browserFiles.filter(f => !DEAD_FILES.includes(f)))('%s : aucun hôte de fournisseur IA ni variable de clé', (file) => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const host of CONFIG.providerHosts) expect(code, host).not.toContain(host)
    expect(code).not.toMatch(/VITE_[A-Z_]*(OPENAI|ANTHROPIC|GROQ|GEMINI|XAI|OPENROUTER|PINECONE|SECRET|PRIVATE|SERVICE_ROLE)/)
    for (const { name, regex } of CONFIG.keyPatterns) expect(code, name).not.toMatch(new RegExp(regex))
    // Le navigateur ne connaît aucun identifiant de modèle : ils sont résolus côté serveur
    expect(code).not.toMatch(/['"`]gpt-\d|gpt-oss|llama-\d/)
  })

  it.each(DEAD_FILES)('%s (code mort) n’est importé nulle part', (dead) => {
    const base = path.basename(dead).replace(/\.tsx?$/, '')
    const importers = browserFiles.filter(f => f !== dead &&
      new RegExp(`from\\s+['"][^'"]*/${base}['"]|import\\(['"][^'"]*/${base}['"]\\)`).test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    expect(importers).toEqual([])
  })

  it('les fonctionnalités IA passent par le client unique src/lib/aiClient.ts', () => {
    const users = browserFiles.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('runAiFeature('))
    expect(users.sort()).toEqual([
      'src/lib/aiClient.ts',
      'src/pages/CVBuilder/CVGeneratorPro_part1.tsx',
      'src/pages/CVBuilder/LaTeXEditor.tsx',
    ])
  })
})

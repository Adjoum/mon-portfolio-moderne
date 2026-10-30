// P0.A2 — Configurations Docker : aucun secret dans les arguments de build ni dans les images
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Seules variables VITE_* autorisées : publiques par nature */
const PUBLIC_VITE = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|PRIVATE/i

describe('docker-compose.yml', () => {
  const compose = read('docker-compose.yml')
  // Bloc du service frontend : jusqu'au service suivant de premier niveau (2 espaces d'indentation)
  const start = compose.indexOf('\n  frontend:')
  const frontendBlock = compose.slice(start, compose.indexOf('\n  mongo:', start))

  it('le build frontend ne reçoit que des variables publiques', () => {
    const args = [...frontendBlock.matchAll(/^\s+(VITE_[A-Z_]+):/gm)].map(m => m[1])
    expect(args.length).toBeGreaterThan(0)
    for (const name of args) expect(PUBLIC_VITE, name).toContain(name)
  })

  it('aucune référence à VITE_OPENAI_API_KEY', () => {
    expect(compose).not.toMatch(/^[^#\n]*VITE_OPENAI/m)
  })

  it('les secrets de l’API viennent d’un fichier d’environnement non versionné', () => {
    expect(compose).toMatch(/env_file:\s*\.env\.docker/)
    expect(read('.gitignore')).toMatch(/^\.env\.docker$/m)
  })
})

describe('Dockerfiles', () => {
  it.each(['Dockerfile.frontend', 'blog-api/Dockerfile'])('%s : aucun ARG/ENV secret (hors clé publique Supabase)', (file) => {
    const declared = [...read(file).matchAll(/^\s*(?:ARG|ENV)\s+([A-Z_][A-Z0-9_]*)/gm)].map(m => m[1])
    for (const name of declared) {
      if (SECRET_NAME.test(name)) expect(PUBLIC_VITE, `${file}: ${name}`).toContain(name)
    }
    expect(read(file)).not.toMatch(/OPENAI|GROQ_API_KEY|PINECONE_API_KEY|JWT_SECRET|MONGODB_URI/)
  })
})

describe('.dockerignore', () => {
  it.each(['.dockerignore', 'blog-api/.dockerignore'])('%s exclut les fichiers .env', (file) => {
    const lines = read(file).split(/\r?\n/).map(l => l.trim())
    expect(lines).toContain('.env')
    expect(lines.some(l => l === '.env.*' || l === '.env*')).toBe(true)
  })

  it('le contexte frontend exclut le backend', () => {
    expect(read('.dockerignore').split(/\r?\n/).map(l => l.trim())).toContain('blog-api')
  })
})

describe('variables attendues documentées', () => {
  it('blog-api/.env.example déclare les variables IA sans valeur', () => {
    const example = read('blog-api/.env.example')
    for (const name of ['OPENAI_API_KEY', 'AI_LOG_HMAC_SECRET', 'AI_ENABLED', 'AI_DISABLED_FEATURES']) {
      expect(example, name).toMatch(new RegExp(`^#?\\s*${name}=\\s*(false|true)?\\s*$`, 'm'))
    }
  })

  it('.env.example frontend : variables publiques uniquement', () => {
    const names = [...read('.env.example').matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map(m => m[1])
    expect(names.sort()).toEqual([...PUBLIC_VITE].sort())
  })
})

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
    for (const name of ['AI_DATABASE_URL', 'AI_DATABASE_CA_FILE', 'AI_LOG_HMAC_SECRET', 'AI_ENABLED', 'AI_DISABLED_FEATURES']) {
      expect(example, name).toMatch(new RegExp(`^#?\\s*${name}=\\s*(false|true)?\\s*$`, 'm'))
    }
  })

  it('aucune clé de fournisseur IA attendue dans l’environnement : elles vivent dans Vault', () => {
    for (const file of ['blog-api/.env.example', '.env.docker.example', 'docker-compose.yml']) {
      expect(read(file), file).not.toMatch(/^\s*-?\s*(OPENAI|GROQ|XAI|GEMINI|OPENROUTER|ANTHROPIC)_API_KEY\s*[=:]/m)
    }
    expect(read('.env.docker.example')).toMatch(/^AI_DATABASE_URL=$/m)
  })

  it('.env.example frontend : variables publiques uniquement', () => {
    const names = [...read('.env.example').matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map(m => m[1])
    expect(names.sort()).toEqual([...PUBLIC_VITE].sort())
  })
})

describe('exploitation (P0.A3)', () => {
  const compose = read('docker-compose.yml')
  const api = read('blog-api/Dockerfile')
  const front = read('Dockerfile.frontend')

  it('toutes les images de base sont épinglées par empreinte, sur Node LTS', () => {
    for (const file of [api, front]) {
      const stages = [...file.matchAll(/^FROM\s+(\S+)/gm)].map(m => m[1])
      expect(stages.length).toBeGreaterThan(1)
      for (const image of stages) expect(image).toMatch(/@sha256:[0-9a-f]{64}$/)
    }
    expect(api).toMatch(/^FROM node:24-/m)
    expect(front).toMatch(/^FROM node:24-/m)
  })

  it('aucune chaîne TeX ni outil réseau dans l’image API', () => {
    expect(api).not.toMatch(/texlive|latexmk|apt-get install/)
  })

  it('healthchecks locaux : jamais l’URL de production', () => {
    for (const file of [api, front, compose]) {
      expect(file).not.toMatch(/HEALTHCHECK[\s\S]{0,120}https:\/\/api\.adjoumani/)
      expect(file).not.toMatch(/wget[^\n]*http:\/\/localhost/)
    }
    expect(api).toContain('127.0.0.1')
    expect(front).toContain('http://127.0.0.1:80/')
  })

  it('tous les ports publiés sont liés à la boucle locale', () => {
    const published = [...compose.matchAll(/^\s+- "([^"]*:\d+)"$/gm)].map(m => m[1])
    expect(published.length).toBeGreaterThanOrEqual(4)
    for (const port of published) expect(port).toMatch(/^127\.0\.0\.1:/)
  })

  it('MongoDB local réservé au profil dev, sans mot de passe par défaut', () => {
    const mongo = compose.slice(compose.indexOf('\n  mongo:'), compose.indexOf('\n  mongo-express:'))
    expect(mongo).toContain('profiles: ["dev"]')
    expect(compose).not.toMatch(/:-secret\}/)
    // Compose évalue :? même pour un profil inactif : cela bloquerait le démarrage sans profil
    expect(compose).not.toMatch(/\$\{[A-Z_]+:\?/)
    expect(compose).not.toMatch(/mongodb\.net/)
    expect(compose).toContain('ME_CONFIG_BASICAUTH: "true"')
    expect(compose).toContain('required: false')
  })

  it('en-têtes de sécurité alignés entre Vercel et nginx', () => {
    const vercel = JSON.parse(read('vercel.json')) as { headers: { headers: { key: string; value: string }[] }[] }
    const headers = Object.fromEntries(vercel.headers[0].headers.map(h => [h.key, h.value]))
    for (const name of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) expect(headers[name], name).toBeTruthy()
    expect(read('nginx.conf')).toContain(headers['Content-Security-Policy-Report-Only'])
  })
})

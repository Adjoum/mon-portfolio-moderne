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
    expect(compose).toMatch(/env_file:\s*\$\{API_ENV_FILE:-\.env\.docker\}/)
    expect(read('.gitignore')).toMatch(/^\.env\.docker$/m)
    expect(read('.gitignore')).toMatch(/^\.env\.docker\.test$/m)
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

describe('latex-runner : compilation LaTeX isolée (faille S2)', () => {
  const compose = read('docker-compose.yml')
  const runner = compose.slice(compose.indexOf('\n  latex-runner:'), compose.indexOf('\n  frontend:'))
  const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  latex-runner:'))
  const dockerfile = read('latex-runner/Dockerfile')

  it('durcissement du conteneur : lecture seule, aucune capacité, utilisateur non root, ressources bornées', () => {
    for (const line of ['read_only: true', '- ALL', '- no-new-privileges:true', 'user: "10001:10001"', 'init: true', 'pids_limit: 64', 'mem_limit: 512m', 'memswap_limit: 512m', 'cpus: 1.0']) {
      expect(runner, line).toContain(line)
    }
    expect(runner).toMatch(/- \/work:rw,size=64m,[^\n]*noexec,nosuid,nodev/)
    expect(runner).not.toMatch(/privileged|cap_add|SYS_ADMIN|seccomp:unconfined|apparmor:unconfined/)
  })

  it('aucun secret, aucun port, aucun volume : seul le réseau interne partagé avec l’API', () => {
    expect(runner).not.toMatch(/env_file|ports:|volumes:/)
    expect(runner).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD|MONGO|SUPABASE|DATABASE/)
    expect(runner).toMatch(/networks:\s*\n\s*- latex-net\s*\n/)
    expect(compose).toMatch(/latex-net:\s*\n\s*driver: bridge\s*\n\s*internal: true/)
    expect(api).toContain('- latex-net')
    expect(api).toContain('LATEX_RUNNER_URL=http://latex-runner:3000')
  })

  it('image épinglée, sans secret, politique TeX pour documents non fiables', () => {
    expect(dockerfile).toMatch(/^FROM node:24-[^\s]+@sha256:[0-9a-f]{64}$/m)
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s+\w*(KEY|SECRET|TOKEN|PASSWORD)/m)
    for (const setting of ["'shell_escape = f'", "'openin_any = p'", "'openout_any = p'"]) expect(dockerfile).toContain(setting)
    expect(dockerfile).toMatch(/^USER 10001:10001$/m)
    expect(read('latex-runner/.dockerignore').split(/\r?\n/)).toEqual(expect.arrayContaining(['.env', '.env.*', 'test']))
  })

  it('l’image de l’API ne contient toujours aucune chaîne TeX', () => {
    expect(read('blog-api/Dockerfile')).not.toMatch(/texlive|latexmk|pdflatex/)
  })
})

describe('cv-extractor : extraction isolée des CV importés', () => {
  const compose = read('docker-compose.yml')
  const service = compose.slice(compose.indexOf('\n  cv-extractor:'), compose.indexOf('\n  frontend:'))
  const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  latex-runner:'))
  const dockerfile = read('cv-extractor/Dockerfile')

  it('durcissement identique à latex-runner, sans espace de travail sur disque', () => {
    for (const line of ['read_only: true', '- ALL', '- no-new-privileges:true', 'user: "10002:10002"', 'init: true', 'pids_limit: 64', 'mem_limit: 512m', 'cpus: 1.0']) {
      expect(service, line).toContain(line)
    }
    expect(service).not.toMatch(/env_file|ports:|volumes:|privileged|cap_add|KEY|SECRET|TOKEN|PASSWORD|MONGO|SUPABASE/)
    expect(service).not.toContain('/work')
  })

  it('réseau interne propre : ni Internet, ni latex-runner ; seule l’API le joint', () => {
    expect(service).toMatch(/networks:\s*\n\s*- extract-net\s*\n/)
    expect(service).not.toContain('latex-net')
    expect(compose).toMatch(/extract-net:\s*\n\s*driver: bridge\s*\n\s*internal: true/)
    expect(api).toContain('- extract-net')
    expect(api).toContain('CV_EXTRACTOR_URL=http://cv-extractor:3100')
  })

  it('image épinglée, dépendances figées, sans module natif ni script d’installation', () => {
    expect(dockerfile).toMatch(/^FROM node:24-[^\s]+@sha256:[0-9a-f]{64}$/m)
    expect(dockerfile).toContain('npm ci --omit=dev --omit=optional --ignore-scripts')
    expect(dockerfile).toMatch(/^USER 10002:10002$/m)
    const pkg = JSON.parse(read('cv-extractor/package.json'))
    for (const version of Object.values(pkg.dependencies)) expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(fs.existsSync(path.join(ROOT, 'cv-extractor/package-lock.json'))).toBe(true)
  })
})

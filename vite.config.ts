import fs from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { inkspaceConfig } from './vite-plugins/inkspaceConfig'
import { adminPrivacy } from './vite-plugins/adminPrivacy'
import { PUBLIC_ENV, adminRouteHashStatus, envDirFor, leakedPublicEnv, targetsProductionSupabase } from './vite-plugins/publicEnv'

const secretPatterns = JSON.parse(fs.readFileSync(new URL('./scripts/secret-patterns.json', import.meta.url), 'utf8')) as {
  keyPatterns: { name: string; regex: string }[]
  providerHosts: string[]
}
const keyPatterns = secretPatterns.keyPatterns.map(p => ({ name: p.name, re: new RegExp(p.regex) }))

// Chemins d'administration générés sur ce poste (scripts/admin-route.mjs) : jamais dans le bundle
const adminRouteDir = new URL('./secrets/admin-route/', import.meta.url)
const adminSegments = fs.existsSync(adminRouteDir)
  ? fs.readdirSync(adminRouteDir).filter(f => f.endsWith('.txt'))
      .map(f => fs.readFileSync(new URL(f, adminRouteDir), 'utf8').trim())
      .filter(s => /^[A-Za-z0-9_-]{32,128}$/.test(s))
  : []

// Échec du build si le bundle contient une clé privée, un appel direct à un fournisseur IA ou un
// chemin d'administration en clair.
// Motifs partagés avec scripts/check-bundle-secrets.mjs (contrôle a posteriori du dossier dist).
function noSecretsInBundle(): Plugin {
  return {
    name: 'no-secrets-in-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [file, output] of Object.entries(bundle)) {
        const text = output.type === 'chunk' ? output.code : typeof output.source === 'string' ? output.source : ''
        const key  = keyPatterns.find(p => p.re.test(text))
        const host = secretPatterns.providerHosts.find(h => text.includes(h))
        if (key || host) {
          this.error(`Bundle refusé (${file}) : ${key ? key.name : `appel direct à ${host}`}. Les clés et les appels IA restent côté serveur (blog-api).`)
        }
        if (adminSegments.some(s => text.includes(s))) {
          this.error(`Bundle refusé (${file}) : chemin d'administration en clair. Seule son empreinte (VITE_ADMIN_ROUTE_HASH) est publique.`)
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = envDirFor(mode)
  const env = loadEnv(mode, envDir, PUBLIC_ENV)

  const leaked = leakedPublicEnv(env, keyPatterns.map(p => p.re))
  if (leaked.length) throw new Error(`Valeur de clé privée dans une variable publique : ${leaked.join(', ')}. Elle serait envoyée au navigateur.`)
  if (mode === 'recette' && targetsProductionSupabase(env, loadEnv('production', '.', PUBLIC_ENV))) {
    throw new Error('Recette : VITE_SUPABASE_URL désigne le projet de production. Utilisez le projet Supabase de test (env/recette).')
  }
  const adminRoute = adminRouteHashStatus(env)
  if (adminRoute === 'invalide') {
    throw new Error('VITE_ADMIN_ROUTE_HASH doit contenir l’empreinte SHA-256 (64 caractères hexadécimaux), jamais le chemin : node scripts/admin-route.mjs hash')
  }
  if (adminRoute === 'absent' && mode !== 'test') {
    console.warn('⚠ VITE_ADMIN_ROUTE_HASH absente : le dashboard sera inaccessible dans ce build (voir scripts/admin-route.mjs).')
  }

  return {
    envDir,
    envPrefix: PUBLIC_ENV,
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      noSecretsInBundle(),
      adminPrivacy(),
      inkspaceConfig(env.VITE_API_URL || 'http://localhost:5000/api'),
    ],
    optimizeDeps: { include: ['pdfjs-dist'] },
  }
})

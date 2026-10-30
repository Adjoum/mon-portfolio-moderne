import fs from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { inkspaceConfig } from './vite-plugins/inkspaceConfig'
import { PUBLIC_ENV, envDirFor, leakedPublicEnv, targetsProductionSupabase } from './vite-plugins/publicEnv'

const secretPatterns = JSON.parse(fs.readFileSync(new URL('./scripts/secret-patterns.json', import.meta.url), 'utf8')) as {
  keyPatterns: { name: string; regex: string }[]
  providerHosts: string[]
}
const keyPatterns = secretPatterns.keyPatterns.map(p => ({ name: p.name, re: new RegExp(p.regex) }))

// Échec du build si le bundle contient une clé privée ou un appel direct à un fournisseur IA.
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
      inkspaceConfig(env.VITE_API_URL || 'http://localhost:5000/api'),
    ],
    optimizeDeps: { include: ['pdfjs-dist'] },
  }
})

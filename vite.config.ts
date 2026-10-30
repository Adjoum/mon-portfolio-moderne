import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Échec du build si le bundle contient une clé privée ou un appel direct à un fournisseur IA.
// Motifs partagés avec scripts/check-bundle-secrets.mjs (contrôle a posteriori du dossier dist).
function noSecretsInBundle(): Plugin {
  const config = JSON.parse(fs.readFileSync(new URL('./scripts/secret-patterns.json', import.meta.url), 'utf8')) as {
    keyPatterns: { name: string; regex: string }[]
    providerHosts: string[]
  }
  const patterns = config.keyPatterns.map(p => ({ name: p.name, re: new RegExp(p.regex) }))

  return {
    name: 'no-secrets-in-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [file, output] of Object.entries(bundle)) {
        const text = output.type === 'chunk' ? output.code : typeof output.source === 'string' ? output.source : ''
        const key  = patterns.find(p => p.re.test(text))
        const host = config.providerHosts.find(h => text.includes(h))
        if (key || host) {
          this.error(`Bundle refusé (${file}) : ${key ? key.name : `appel direct à ${host}`}. Les clés et les appels IA restent côté serveur (blog-api).`)
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    noSecretsInBundle(),
  ],
  optimizeDeps: { include: ['pdfjs-dist'] },
})

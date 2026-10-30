// vite-plugins/inkspaceConfig.ts
// InkSpace est une application statique (public/inkspace) que Vite ne transforme pas : elle ne
// peut pas lire import.meta.env. Ce module lui fournit /inkspace/config.js, généré à partir de
// VITE_API_URL, la même adresse que le reste du site :
//   développement → servi par le serveur Vite ; build → écrit dans le dossier de sortie.
// Aucune adresse n'est donc écrite en dur dans le JavaScript d'InkSpace.

import type { Plugin } from 'vite'

export const INKSPACE_CONFIG_PATH = 'inkspace/config.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const HEADER = '// Généré à partir de VITE_API_URL (vite-plugins/inkspaceConfig.ts) : ne pas modifier.\n'

/** Script de configuration d'InkSpace pour une adresse d'API (VITE_API_URL, terminée par /api) */
export function inkspaceConfigScript(apiUrl: string): string {
  let url: URL
  try {
    url = new URL(apiUrl)
  } catch {
    throw new Error(`VITE_API_URL invalide pour InkSpace : ${JSON.stringify(apiUrl)}`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error('VITE_API_URL : HTTPS obligatoire hors boucle locale (InkSpace)')
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error('VITE_API_URL : ni paramètres, ni fragment, ni identifiants (InkSpace)')
  }
  // JSON échappé : la valeur ne peut pas sortir de la chaîne ni fermer une balise
  const value = JSON.stringify(url.href.replace(/\/+$/, '')).replace(/</g, '\\u003c')
  return `${HEADER}window.INKSPACE_CONFIG = Object.freeze({ apiUrl: ${value} });\n`
}

/** Adresse inutilisable : InkSpace affiche « adresse du service IA non configurée » */
export const UNCONFIGURED_SCRIPT = `${HEADER}window.INKSPACE_CONFIG = Object.freeze({ apiUrl: null });\n`

export function inkspaceConfig(apiUrl: string): Plugin {
  let script = UNCONFIGURED_SCRIPT
  let problem: string | null = null
  try {
    script = inkspaceConfigScript(apiUrl)
  } catch (err) {
    problem = (err as Error).message
  }

  return {
    name: 'inkspace-config',
    configureServer(server) {
      // Développement : le site reste utilisable, seul l'assistant d'InkSpace est indisponible
      if (problem) server.config.logger.warn(`[inkspace-config] ${problem}`)
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== `/${INKSPACE_CONFIG_PATH}`) return next()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(script)
      })
    },
    generateBundle() {
      // Build : une adresse invalide serait déployée, refus
      if (problem) this.error(problem)
      this.emitFile({ type: 'asset', fileName: INKSPACE_CONFIG_PATH, source: script })
    },
  }
}

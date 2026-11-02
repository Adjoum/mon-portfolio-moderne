// vite-plugins/adminPrivacy.ts
// Mesure d'audience coupée sur les pages d'administration, sans modifier index.html.
//
// Google Analytics (snippet de index.html) enverrait l'adresse complète de la page, donc le
// chemin d'administration, dès son chargement. Ce plugin place en tête du <head> le mécanisme
// d'exclusion officiel de gtag.js (window['ga-disable-<ID>'] = true) pour toute adresse dont le
// premier segment a la forme de celui de l'administration (src/lib/adminRoute.ts) : aucun
// envoi pour tout le document, navigation interne comprise.
import type { Plugin } from 'vite'

/** Même forme que ADMIN_SEGMENT_RE (src/lib/adminRoute.ts), appliquée au chemin complet */
export const ADMIN_PATH_PATTERN = '^\\/[A-Za-z0-9_-]{32,128}(\\/|$)'

/** Identifiants de mesure configurés dans la page (gtag('config', 'G-…')) */
export function measurementIds(html: string): string[] {
  const ids = new Set<string>()
  for (const m of html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/g)) ids.add(m[1])
  return [...ids]
}

/** Script d'exclusion pour ces identifiants (chaîne vide si la page n'en configure aucun) */
export function analyticsOptOutScript(ids: string[]): string {
  if (!ids.length) return ''
  const flags = ids.map(id => `window[${JSON.stringify(`ga-disable-${id}`)}]=true;`).join('')
  return `if(new RegExp(${JSON.stringify(ADMIN_PATH_PATTERN)}).test(location.pathname)){${flags}}`
}

export function adminPrivacy(): Plugin {
  return {
    name: 'admin-privacy',
    transformIndexHtml(html) {
      const script = analyticsOptOutScript(measurementIds(html))
      if (!script) return html
      return [{ tag: 'script', children: script, injectTo: 'head-prepend' }]
    },
  }
}

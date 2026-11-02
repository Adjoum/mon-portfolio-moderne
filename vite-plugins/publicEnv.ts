// vite-plugins/publicEnv.ts
// Variables d'environnement transmises au navigateur par Vite.
//
// - Seules les trois variables publiques du site sont exposées (envPrefix) : une clé privée
//   présente dans .env ou .env.local (ancienne VITE_OPENAI_API_KEY par exemple) n'atteint
//   jamais le code client, ni en développement ni dans un build.
// - Les modes autres que development et production lisent leurs fichiers dans env/<mode>,
//   jamais .env ni .env.local, qui contiennent des valeurs de production. La recette locale
//   (npm run dev:recette) ne peut donc pas viser Supabase Production par inadvertance.

// - VITE_ADMIN_ROUTE_HASH : empreinte SHA-256 du chemin d'administration, jamais le chemin
//   lui-même (src/lib/adminRoute.ts, scripts/admin-route.mjs).

export const PUBLIC_ENV = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ADMIN_ROUTE_HASH']

export function envDirFor(mode: string): string {
  return mode === 'development' || mode === 'production' ? '.' : `env/${mode}`
}

/**
 * Empreinte du chemin d'administration : absente (dashboard inaccessible, refus par défaut),
 * valide (64 caractères hexadécimaux) ou invalide. Une valeur invalide est le plus souvent le
 * chemin lui-même, collé par erreur : il finirait dans le bundle public, le build est refusé.
 */
export function adminRouteHashStatus(env: Record<string, string>): 'absent' | 'valide' | 'invalide' {
  const value = (env.VITE_ADMIN_ROUTE_HASH ?? '').trim()
  if (!value) return 'absent'
  return /^[0-9a-f]{64}$/i.test(value) ? 'valide' : 'invalide'
}

/** Variables publiques dont la valeur ressemble à une clé privée : refus */
export function leakedPublicEnv(env: Record<string, string>, keyPatterns: RegExp[]): string[] {
  return Object.entries(env)
    .filter(([name, value]) => PUBLIC_ENV.some(prefix => name.startsWith(prefix)) && keyPatterns.some(re => re.test(value)))
    .map(([name]) => name)
}

/** Recette : jamais le projet Supabase des fichiers de production */
export function targetsProductionSupabase(recette: Record<string, string>, production: Record<string, string>): boolean {
  const host = (value: string | undefined) => {
    try { return value ? new URL(value).host : '' } catch { return '' }
  }
  const target = host(recette.VITE_SUPABASE_URL)
  return target !== '' && target === host(production.VITE_SUPABASE_URL)
}

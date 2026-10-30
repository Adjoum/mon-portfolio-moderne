// vite-plugins/publicEnv.ts
// Variables d'environnement transmises au navigateur par Vite.
//
// - Seules les trois variables publiques du site sont exposées (envPrefix) : une clé privée
//   présente dans .env ou .env.local (ancienne VITE_OPENAI_API_KEY par exemple) n'atteint
//   jamais le code client, ni en développement ni dans un build.
// - Les modes autres que development et production lisent leurs fichiers dans env/<mode>,
//   jamais .env ni .env.local, qui contiennent des valeurs de production. La recette locale
//   (npm run dev:recette) ne peut donc pas viser Supabase Production par inadvertance.

export const PUBLIC_ENV = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

export function envDirFor(mode: string): string {
  return mode === 'development' || mode === 'production' ? '.' : `env/${mode}`
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

// src/lib/adminRoute.ts
// Chemin d'administration non prévisible.
//
// Le bundle public ne contient que l'empreinte SHA-256 du premier segment du chemin
// (VITE_ADMIN_ROUTE_HASH), jamais le chemin : le lire dans le JavaScript ne permet pas de le
// retrouver (identifiant aléatoire de 192 bits, scripts/admin-route.mjs).
//
// ⚠️ Discrétion seulement, pas une protection : les données et les opérations restent protégées
// côté serveur (Supabase Auth, admin_users, TOTP, session de 10 min, RLS, blog-api), que
// l'adresse soit connue ou non.

/** Forme du segment d'administration : aucune page publique n'a un premier segment de ce type */
export const ADMIN_SEGMENT_RE = /^[A-Za-z0-9_-]{32,128}$/

const EXPECTED = (import.meta.env.VITE_ADMIN_ROUTE_HASH ?? '').trim().toLowerCase()

/** Premier segment d'un chemin (« /abc/knowledge » → « abc ») */
export function firstSegment(pathname: string): string {
  return pathname.split('/')[1] ?? ''
}

/** Vrai si le chemin a la forme d'une adresse d'administration (sans calcul d'empreinte) */
export function looksLikeAdminPath(pathname: string): boolean {
  return ADMIN_SEGMENT_RE.test(firstSegment(pathname))
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Le segment est-il celui de l'administration ? Refus par défaut : empreinte absente ou mal
 * formée, segment hors format, contexte non sécurisé (crypto.subtle indisponible).
 */
export async function matchAdminSegment(segment: string, expected: string = EXPECTED): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(expected) || !ADMIN_SEGMENT_RE.test(segment)) return false
  if (typeof crypto === 'undefined' || !crypto.subtle) return false
  try {
    return (await sha256Hex(segment)) === expected
  } catch {
    return false
  }
}

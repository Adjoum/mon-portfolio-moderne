// src/lib/adminAuth.ts
// Accès administrateur du portfolio (dashboard /admin) — Supabase Auth + MFA (TOTP)
//
// ⚠️ Ces vérifications côté navigateur ne servent qu'à l'affichage. La protection réelle
// est appliquée côté serveur : blog-api (requireSupabaseAdmin / requireAdminMfa) et
// politiques RLS Supabase (is_portfolio_admin_mfa). Aucun rôle n'est jamais envoyé
// par le navigateur : seul le jeton de session signé par Supabase l'est.

import { supabase } from './supabase'

export type AdminGateStatus =
  | 'signed_out'      // aucune session
  | 'not_admin'       // session valide mais absente de admin_users
  | 'mfa_enroll'      // administrateur sans second facteur : enrôlement TOTP
  | 'mfa_challenge'   // administrateur avec TOTP, session encore en aal1
  | 'ready'           // administrateur, session aal2
  | 'error'           // vérification impossible (réseau, configuration)

export interface AdminAccessInput {
  hasSession:      boolean
  isAdmin:         boolean | null   // null = vérification impossible
  currentLevel:    string | null
  hasVerifiedTotp: boolean
}

/** Décision d'affichage pure (testée) : refus par défaut dès qu'un élément manque */
export function resolveAdminGateStatus(input: AdminAccessInput): AdminGateStatus {
  if (!input.hasSession) return 'signed_out'
  if (input.isAdmin === null) return 'error'
  if (!input.isAdmin) return 'not_admin'
  if (input.currentLevel === 'aal2') return 'ready'
  return input.hasVerifiedTotp ? 'mfa_challenge' : 'mfa_enroll'
}

export interface AdminAccess {
  status:    AdminGateStatus
  factorId?: string   // facteur TOTP vérifié à utiliser pour le défi
}

/** Évalue la session courante : session → admin_users (rpc) → niveau MFA */
export async function evaluateAdminAccess(): Promise<AdminAccess> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { status: 'signed_out' }

  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_portfolio_admin')
  if (rpcError) return { status: 'error' }

  const [aal, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  if (aal.error || factors.error) return { status: 'error' }

  const verifiedTotp = factors.data.totp[0]
  return {
    status: resolveAdminGateStatus({
      hasSession:      true,
      isAdmin:         isAdmin === true,
      currentLevel:    aal.data.currentLevel,
      hasVerifiedTotp: !!verifiedTotp,
    }),
    factorId: verifiedTotp?.id,
  }
}

export interface TotpEnrollment { factorId: string; qrCode: string; secret: string }

let enrollmentInProgress: Promise<TotpEnrollment> | null = null

/**
 * Démarre l'enrôlement TOTP. Des appels simultanés partagent le même enrôlement (React StrictMode
 * monte deux fois le composant en développement) : Supabase Auth refuse deux facteurs de même nom.
 */
export function startTotpEnrollment(): Promise<TotpEnrollment> {
  enrollmentInProgress ??= enrollTotp().finally(() => { enrollmentInProgress = null })
  return enrollmentInProgress
}

/** Les facteurs TOTP non vérifiés précédents sont retirés */
async function enrollTotp(): Promise<TotpEnrollment> {
  const { data: existing } = await supabase.auth.mfa.listFactors()
  for (const factor of existing?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType:   'totp',
    friendlyName: `Portfolio admin ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error || !data) throw new Error('Impossible de démarrer l’enrôlement MFA')

  const raw = data.totp.qr_code
  const qrCode = raw.startsWith('data:') ? raw : `data:image/svg+xml;utf-8,${encodeURIComponent(raw)}`
  return { factorId: data.id, qrCode, secret: data.totp.secret }
}

/** Valide un code TOTP à 6 chiffres : la session passe en aal2 */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const clean = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) throw new Error('Le code doit contenir 6 chiffres')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean })
  if (error) throw new Error('Code invalide ou expiré')
}

/** Jeton d'accès courant (rafraîchi automatiquement par supabase-js) */
export async function getAdminAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

/** fetch vers blog-api avec le jeton de session Supabase dans Authorization */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token   = await getAdminAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

const ADMIN_API_MESSAGES: Record<string, string> = {
  UNAUTHORIZED:              'Session absente ou expirée. Reconnectez-vous.',
  INVALID_TOKEN:             'Session invalide ou expirée. Reconnectez-vous.',
  FORBIDDEN:                 'Accès réservé à l’administrateur.',
  MFA_REQUIRED:              'Validez la double authentification (MFA) pour cette opération.',
  KNOWLEDGE_WRITE_DISABLED:  'La modification de la base est désactivée sur le serveur.',
  ADMIN_AUTH_NOT_CONFIGURED: 'Administration indisponible : serveur non configuré.',
  ADMIN_AUTH_UNAVAILABLE:    'Vérification des droits momentanément indisponible. Réessayez.',
  RATE_LIMIT_EXCEEDED:       'Trop de requêtes. Patientez avant de réessayer.',
}

/** Message utilisateur pour une réponse d'erreur de l'API d'administration */
export function describeAdminApiError(status: number, body: { error?: unknown; code?: unknown } | null): string {
  const code = typeof body?.code === 'string' ? body.code : ''
  if (ADMIN_API_MESSAGES[code]) return ADMIN_API_MESSAGES[code]
  if (status === 429) return ADMIN_API_MESSAGES.RATE_LIMIT_EXCEEDED
  if (status === 401) return ADMIN_API_MESSAGES.UNAUTHORIZED
  if (status === 403) return ADMIN_API_MESSAGES.FORBIDDEN
  if (typeof body?.error === 'string' && body.error.length <= 200) return body.error
  return `Erreur serveur (${status})`
}

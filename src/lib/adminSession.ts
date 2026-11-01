// src/lib/adminSession.ts
// Session administrateur : verrouillage après 10 minutes sans interaction réelle.
//
// La protection est appliquée par le SERVEUR (migration 20261102100000) : une session close est
// refusée par la RLS Supabase et par blog-api, même avec un jeton encore valide. Ce module ne fait
// que (1) signaler au serveur les interactions réelles et (2) verrouiller l'interface à temps.
//
// Interactions réelles : clic/toucher, saisie et touches clavier, molette (défilement manuel).
// Jamais : mouvements de souris, animations, requêtes ou rafraîchissements automatiques,
// événements simulés par un script (event.isTrusted === false).

import { supabase } from './supabase'

export const ADMIN_IDLE_LIMIT_MS   = 10 * 60 * 1000
export const ADMIN_IDLE_WARNING_MS = 9 * 60 * 1000
/** Écart maximal entre la dernière interaction et sa transmission au serveur */
export const ADMIN_TOUCH_INTERVAL_MS = 15 * 1000

export const ADMIN_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** Clés partagées entre onglets : horodatages seulement, aucune donnée sensible */
export const SHARED_ACTIVITY_KEY = 'portfolio-admin:last-activity'
export const SHARED_LOCK_KEY     = 'portfolio-admin:lock'
/** Brouillons de formulaires non sensibles conservés au verrouillage (sessionStorage) */
export const DRAFT_PREFIX        = 'portfolio-admin-draft:'
/** Événement émis juste avant le verrouillage : les formulaires y enregistrent leur brouillon */
export const BEFORE_LOCK_EVENT   = 'admin-session:before-lock'

export type IdlePhase = 'active' | 'warning' | 'expired'

/**
 * Phase d'inactivité (pure, testée avec une horloge simulée).
 * serverDeadline : instant de verrouillage annoncé par le serveur ; le plus proche des deux l'emporte.
 */
export function idleState(now: number, lastActivity: number, serverDeadline: number | null = null) {
  const deadline = Math.min(lastActivity + ADMIN_IDLE_LIMIT_MS, serverDeadline ?? Infinity)
  const remainingMs = Math.max(0, deadline - now)
  const phase: IdlePhase = remainingMs <= 0
    ? 'expired'
    : remainingMs <= ADMIN_IDLE_LIMIT_MS - ADMIN_IDLE_WARNING_MS ? 'warning' : 'active'
  return { phase, remainingMs, deadline }
}

/** Seuls les événements produits par l'utilisateur comptent (pas dispatchEvent, pas d'animation) */
export function isRealInteraction(event: Event): boolean {
  return event.isTrusted === true
}

/**
 * Envoi des interactions au serveur, au plus une fois toutes les 15 s, avec envoi différé de la
 * dernière : le serveur connaît toujours l'activité à 15 s près, jamais en avance.
 */
export class TouchScheduler {
  private lastSentAt = -Infinity
  private pending = false
  private readonly interval: number
  constructor(interval = ADMIN_TOUCH_INTERVAL_MS) {
    this.interval = interval
  }

  /** Interaction à l'instant now : 'now' (envoyer), sinon délai avant l'envoi différé, ou null s'il est déjà prévu */
  onActivity(now: number): 'now' | number | null {
    if (now - this.lastSentAt >= this.interval) {
      this.lastSentAt = now
      this.pending = false
      return 'now'
    }
    if (this.pending) return null
    this.pending = true
    return this.lastSentAt + this.interval - now
  }

  /** L'envoi différé part maintenant */
  flushed(now: number) {
    this.lastSentAt = now
    this.pending = false
  }

  reset() {
    this.lastSentAt = -Infinity
    this.pending = false
  }
}

// ── Appels au serveur ─────────────────────────────────────────
export interface ServerSessionState {
  /** false : migration absente, verrouillage par le navigateur seulement */
  supported: boolean
  active: boolean
  remainingSeconds: number
  reason: string | null
}

type SessionFn = 'admin_session_begin' | 'admin_session_touch' | 'admin_session_status'

export class AdminSessionForbidden extends Error {}

export async function callAdminSession(fn: SessionFn): Promise<ServerSessionState> {
  const { data, error } = await supabase.rpc(fn)
  if (error) {
    if (error.code === 'PGRST202') return { supported: false, active: true, remainingSeconds: ADMIN_IDLE_LIMIT_MS / 1000, reason: null }
    if (error.code === '42501') throw new AdminSessionForbidden(error.message)
    throw new Error(`Session administrateur : ${error.message}`)
  }
  const row = (Array.isArray(data) ? data[0] : data) as { active?: boolean; remaining_seconds?: number; reason?: string | null } | null
  return {
    supported: true,
    active: row?.active === true,
    remainingSeconds: Math.max(0, Number(row?.remaining_seconds) || 0),
    reason: row?.reason ?? null,
  }
}

/** Fin de session côté serveur (déconnexion, verrouillage) : au mieux, sans bloquer plus de 2 s */
export async function endAdminSession(reason: 'logout' | 'idle_timeout'): Promise<void> {
  await Promise.race([
    Promise.resolve(supabase.rpc('admin_session_end', { p_reason: reason })).catch(() => undefined),
    new Promise(resolve => setTimeout(resolve, 2000)),
  ])
}

/** Niveau MFA du jeton courant, lu localement (affichage seulement : le serveur revérifie tout) */
export function tokenAal(accessToken: string | undefined | null): string | null {
  try {
    const payload = JSON.parse(atob(accessToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

/** Retire les caches d'administration du navigateur (les brouillons non sensibles sont conservés) */
export function clearAdminCaches() {
  for (const store of [sessionStorage, localStorage]) {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i)
      if (key && key.startsWith('portfolio-admin:cache')) store.removeItem(key)
    }
  }
}

// ── Mise en place initiale, attendue par les fonctions qui en dépendent (Mes CV du studio) ──
let settle: () => void = () => {}
let settled: Promise<void> = new Promise(resolve => { settle = resolve })
let providerMounted = false

/** Résolu quand la session administrateur éventuelle a été ouverte (ou qu'il n'y en a pas) */
export function whenAdminSessionSettled(timeoutMs = 4000): Promise<void> {
  if (!providerMounted) return Promise.resolve()
  return Promise.race([settled, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))])
}
export function markAdminSessionSettled() { settle() }

/** Appelé par AdminSessionProvider à son montage ; renvoie la fonction de démontage */
export function registerAdminSessionProvider(): () => void {
  providerMounted = true
  settled = new Promise(resolve => { settle = resolve })
  return () => { providerMounted = false; settle() }
}

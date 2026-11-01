// src/components/admin/AdminSessionProvider.tsx
// Session administrateur sur tout le site (dashboard, connaissances, « Mes CV » du studio) et dans
// tous les onglets : interactions réelles transmises au serveur, avertissement à 9 minutes,
// verrouillage à 10 minutes. La protection elle-même est appliquée par le serveur
// (RLS Supabase + blog-api) : voir src/lib/adminSession.ts.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Clock3, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  ADMIN_ACTIVITY_EVENTS, ADMIN_IDLE_LIMIT_MS, BEFORE_LOCK_EVENT, SHARED_ACTIVITY_KEY, SHARED_LOCK_KEY,
  AdminSessionForbidden, TouchScheduler, callAdminSession, clearAdminCaches, endAdminSession, idleState,
  isRealInteraction, markAdminSessionSettled, registerAdminSessionProvider, tokenAal, type ServerSessionState,
} from '../../lib/adminSession'
import { AdminSessionContext, formatRemaining, lockMessage, type AdminSessionValue, type AdminSessionStatus, type LockReason } from './adminSessionContext'

const SHARED_DEADLINE_KEY = 'portfolio-admin:server-deadline'

const readNumber = (key: string) => {
  try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 }
}
const writeShared = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* stockage indisponible : onglet isolé */ }
}

export default function AdminSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState<AdminSessionStatus>('off')
  const [remainingMs, setRemainingMs] = useState(ADMIN_IDLE_LIMIT_MS)
  const [serverEnforced, setServerEnforced] = useState(true)
  const [lock, setLock] = useState<AdminSessionValue['lock']>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [noticeDismissed, setNoticeDismissed] = useState(false)

  const tracking = useRef(false)
  const starting = useRef(false)
  const locking = useRef(false)
  const lastActivity = useRef(0)
  const serverDeadline = useRef<number | null>(null)
  const scheduler = useRef(new TouchScheduler())
  const trailing = useRef<number | undefined>(undefined)
  const pathRef = useRef(location.pathname)
  useEffect(() => { pathRef.current = location.pathname }, [location.pathname])

  /** Applique l'état renvoyé par le serveur ; false si la session n'est plus active */
  const applyServer = useCallback((st: ServerSessionState) => {
    setServerEnforced(st.supported)
    if (!st.supported) return true
    if (!st.active) return false
    const deadline = Date.now() + st.remainingSeconds * 1000
    serverDeadline.current = deadline
    writeShared(SHARED_DEADLINE_KEY, String(deadline))
    return true
  }, [])

  const doLock = useCallback(async (reason: LockReason) => {
    if (locking.current) return
    locking.current = true
    tracking.current = false
    window.clearTimeout(trailing.current)
    // Les formulaires ouverts enregistrent leur brouillon non sensible avant la fermeture
    window.dispatchEvent(new Event(BEFORE_LOCK_EVENT))
    setStatus('locked')
    setLock({ reason, at: Date.now() })
    setNoticeDismissed(false)
    if (reason !== 'remote') writeShared(SHARED_LOCK_KEY, JSON.stringify({ at: Date.now(), reason }))
    if (reason === 'idle_timeout' || reason === 'logout') await endAdminSession(reason)
    // Déconnexion volontaire : toutes les sessions du compte ; verrouillage : celle-ci (révoquée côté serveur)
    await supabase.auth.signOut({ scope: reason === 'logout' ? 'global' : 'local' }).catch(() => undefined)
    clearAdminCaches()
    try {
      localStorage.removeItem(SHARED_ACTIVITY_KEY)
      localStorage.removeItem(SHARED_DEADLINE_KEY)
    } catch { /* rien à nettoyer */ }
    serverDeadline.current = null
    if (reason !== 'logout' && pathRef.current.startsWith('/admin')) navigate('/admin', { replace: true })
    locking.current = false
  }, [navigate])

  const tick = useCallback(() => {
    if (!tracking.current) return
    const state = idleState(Date.now(), lastActivity.current, serverDeadline.current)
    setRemainingMs(state.remainingMs)
    if (state.phase === 'expired') {
      void doLock('idle_timeout')
      return
    }
    setStatus(state.phase)
  }, [doLock])

  const sendTouch = useCallback(async () => {
    try {
      const st = await callAdminSession('admin_session_touch')
      if (!applyServer(st)) void doLock('server')
      else tick()
    } catch (err) {
      if (err instanceof AdminSessionForbidden) void doLock('server')
      // Réseau : réessayé à la prochaine interaction ; le serveur reste la référence
    }
  }, [applyServer, doLock, tick])

  const start = useCallback(async () => {
    if (tracking.current || starting.current || locking.current) return
    starting.current = true
    setStatus('starting')
    setStartError(null)
    try {
      const st = await callAdminSession('admin_session_begin')
      if (!applyServer(st)) {
        void doLock('server')
        return
      }
      // Un rechargement de page ne prolonge pas la session : reprise là où le serveur l'a laissée
      const fromServer = st.supported ? Date.now() - (ADMIN_IDLE_LIMIT_MS - st.remainingSeconds * 1000) : Date.now()
      lastActivity.current = Math.max(fromServer, readNumber(SHARED_ACTIVITY_KEY))
      scheduler.current.reset()
      tracking.current = true
      setLock(null)
      tick()
    } catch (err) {
      if (err instanceof AdminSessionForbidden) {
        setStatus('off')
        setStartError('Ce compte ne peut pas ouvrir de session d’administration.')
      } else {
        // Serveur injoignable : verrouillage par le navigateur, le serveur refusera de toute façon
        lastActivity.current = Date.now()
        tracking.current = true
        tick()
      }
    } finally {
      starting.current = false
      markAdminSessionSettled()
    }
  }, [applyServer, doLock, tick])

  // Session Supabase en aal2 (MFA validée) : suivi actif ; sinon rien
  useEffect(() => registerAdminSessionProvider(), [])
  useEffect(() => {
    const evaluate = (accessToken: string | undefined) => {
      if (accessToken && tokenAal(accessToken) === 'aal2') void start()
      else {
        tracking.current = false
        setStatus(s => (s === 'locked' ? s : 'off'))
        markAdminSessionSettled()
      }
    }
    void supabase.auth.getSession().then(({ data }) => evaluate(data.session?.access_token))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Jamais d'appel Supabase attendu dans ce rappel (verrou interne de supabase-js)
      if (event === 'SIGNED_OUT') {
        tracking.current = false
        setStartError(null)
        setStatus(s => (s === 'locked' ? s : 'off'))
        return
      }
      if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setTimeout(() => evaluate(session?.access_token), 0)
      }
    })
    return () => subscription.unsubscribe()
  }, [start])

  // Interactions réelles : prolongent la session (jamais une session déjà expirée)
  useEffect(() => {
    const onActivity = (event: Event) => {
      if (!tracking.current || !isRealInteraction(event)) return
      const now = Date.now()
      if (idleState(now, lastActivity.current, serverDeadline.current).phase === 'expired') {
        void doLock('idle_timeout')
        return
      }
      lastActivity.current = now
      writeShared(SHARED_ACTIVITY_KEY, String(now))
      const decision = scheduler.current.onActivity(now)
      if (decision === 'now') void sendTouch()
      else if (typeof decision === 'number') {
        trailing.current = window.setTimeout(() => {
          scheduler.current.flushed(Date.now())
          void sendTouch()
        }, decision)
      }
      tick()
    }
    for (const type of ADMIN_ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { capture: true, passive: true })
    return () => {
      for (const type of ADMIN_ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, { capture: true })
      window.clearTimeout(trailing.current)
    }
  }, [doLock, sendTouch, tick])

  // Horloge : contrôle chaque seconde et au retour sur l'onglet (sortie de veille)
  useEffect(() => {
    const id = window.setInterval(tick, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tick])

  // Autres onglets : activité, échéance serveur et verrouillage partagés
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return
      if (e.key === SHARED_ACTIVITY_KEY && tracking.current) {
        const at = Number(e.newValue)
        if (at > lastActivity.current) lastActivity.current = at
        tick()
      } else if (e.key === SHARED_DEADLINE_KEY && tracking.current) {
        const deadline = Number(e.newValue)
        if (deadline > (serverDeadline.current ?? 0)) serverDeadline.current = deadline
        tick()
      } else if (e.key === SHARED_LOCK_KEY && (tracking.current || status === 'starting')) {
        void doLock('remote')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [doLock, status, tick])

  const stayConnected = useCallback(async () => {
    if (!tracking.current) return
    const now = Date.now()
    lastActivity.current = now
    writeShared(SHARED_ACTIVITY_KEY, String(now))
    scheduler.current.flushed(now)
    await sendTouch()
  }, [sendTouch])

  const logout = useCallback(() => doLock('logout'), [doLock])

  const value = useMemo<AdminSessionValue>(() => ({
    status, remainingMs, serverEnforced, lock, startError,
    start: () => { void start() }, stayConnected, logout,
  }), [status, remainingMs, serverEnforced, lock, startError, start, stayConnected, logout])

  const onAdminRoute = location.pathname.startsWith('/admin')
  const lockedElsewhere = status === 'locked' && !onAdminRoute && lock && lock.reason !== 'logout' && !noticeDismissed

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
      {status === 'warning' && <IdleWarning remainingMs={remainingMs} onStay={stayConnected} />}
      {lockedElsewhere && (
        <div role="status" className="fixed bottom-4 left-4 right-4 z-[1100] mx-auto max-w-md rounded-2xl border border-amber-400/30 bg-slate-950/95 p-4 text-sm text-amber-100 shadow-2xl backdrop-blur sm:left-6 sm:right-auto">
          <p className="mb-3 flex items-start gap-2">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            {lockMessage(lock?.reason)}
          </p>
          <div className="flex gap-2">
            <Link to="/admin" className="rounded-lg bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/15">Se reconnecter</Link>
            <button type="button" onClick={() => setNoticeDismissed(true)} className="rounded-lg px-3 py-2 text-slate-300 hover:text-white">Fermer</button>
          </div>
        </div>
      )}
    </AdminSessionContext.Provider>
  )
}

/** Avertissement discret, sans voler le focus ; seule une action explicite prolonge la session */
function IdleWarning({ remainingMs, onStay }: { remainingMs: number; onStay: () => Promise<void> }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-[1100] mx-auto max-w-md rounded-2xl border border-amber-400/40 bg-slate-950/95 p-4 text-sm text-slate-100 shadow-2xl shadow-black/50 backdrop-blur sm:left-6 sm:right-auto"
      data-testid="admin-idle-warning"
    >
      <p className="mb-1 flex items-center gap-2 font-semibold text-amber-200">
        <Clock3 size={17} aria-hidden="true" />
        Inactivité : verrouillage dans <span className="tabular-nums">{formatRemaining(remainingMs)}</span>
      </p>
      <p className="mb-3 text-slate-300">
        Sans action de votre part, l’administration sera fermée. Un formulaire en cours est conservé
        comme brouillon local (sans donnée sensible).
      </p>
      <button
        type="button"
        onClick={() => void onStay()}
        className="min-h-[44px] rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
      >
        Rester connecté
      </button>
    </div>
  )
}

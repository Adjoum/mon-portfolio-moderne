import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

import {
  ADMIN_IDLE_LIMIT_MS, ADMIN_IDLE_WARNING_MS, ADMIN_TOUCH_INTERVAL_MS, AdminSessionForbidden, TouchScheduler,
  callAdminSession, idleState, isRealInteraction, tokenAal, whenAdminSessionSettled, registerAdminSessionProvider,
  markAdminSessionSettled,
} from './adminSession'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 1, 9, 0, 0)

describe('idleState — horloge simulée', () => {
  it('délais exacts : avertissement à 9 minutes, verrouillage à 10 minutes', () => {
    expect(ADMIN_IDLE_LIMIT_MS).toBe(10 * MIN)
    expect(ADMIN_IDLE_WARNING_MS).toBe(9 * MIN)
  })

  it.each([
    [0, 'active', 10 * MIN],
    [8 * MIN + 59_000, 'active', 61_000],
    [9 * MIN, 'warning', MIN],
    [9 * MIN + 59_999, 'warning', 1],
    [10 * MIN, 'expired', 0],
    [3 * 3600_000, 'expired', 0],    // ordinateur sorti de veille
  ])('%i ms sans interaction → %s', (elapsed, phase, remaining) => {
    const s = idleState(T0 + elapsed, T0)
    expect(s.phase).toBe(phase)
    expect(s.remainingMs).toBe(remaining)
  })

  it('une interaction remet le compteur à zéro', () => {
    expect(idleState(T0 + 9.5 * MIN, T0).phase).toBe('warning')
    expect(idleState(T0 + 9.5 * MIN, T0 + 9.5 * MIN).phase).toBe('active')
    expect(idleState(T0 + 19 * MIN, T0 + 9.5 * MIN).phase).toBe('warning')
  })

  it('l’échéance du serveur l’emporte si elle est plus proche', () => {
    const s = idleState(T0 + MIN, T0 + MIN, T0 + 90_000)
    expect(s.remainingMs).toBe(30_000)
    expect(s.phase).toBe('warning')
    expect(idleState(T0 + 2 * MIN, T0 + 2 * MIN, T0 + 90_000).phase).toBe('expired')
  })

  it('une échéance serveur plus lointaine ne prolonge jamais au-delà de 10 minutes locales', () => {
    expect(idleState(T0 + 10 * MIN, T0, T0 + 30 * MIN).phase).toBe('expired')
  })
})

describe('interactions réelles uniquement', () => {
  it('un événement simulé par script (isTrusted false) ne compte pas', () => {
    expect(isRealInteraction(new Event('pointerdown'))).toBe(false)
    expect(isRealInteraction({ isTrusted: true } as Event)).toBe(true)
  })
})

describe('TouchScheduler — transmission au serveur au plus toutes les 15 s', () => {
  it('première interaction envoyée tout de suite, la suivante différée, puis regroupées', () => {
    const t = new TouchScheduler()
    expect(t.onActivity(T0)).toBe('now')
    expect(t.onActivity(T0 + 2000)).toBe(ADMIN_TOUCH_INTERVAL_MS - 2000)
    expect(t.onActivity(T0 + 5000)).toBeNull()          // envoi différé déjà prévu
    t.flushed(T0 + ADMIN_TOUCH_INTERVAL_MS)
    expect(t.onActivity(T0 + 20_000)).toBe(10_000)
    expect(t.onActivity(T0 + 40_000)).toBe('now')
  })

  it('le serveur connaît toujours la dernière interaction à 15 s près', () => {
    const t = new TouchScheduler()
    let lastServer = -Infinity
    let pendingAt: number | null = null
    for (let now = T0; now < T0 + 5 * MIN; now += 1_700) {
      if (pendingAt !== null && now >= pendingAt) { t.flushed(pendingAt); lastServer = pendingAt; pendingAt = null }
      const d = t.onActivity(now)
      if (d === 'now') lastServer = now
      else if (typeof d === 'number') pendingAt = now + d
      expect(now - lastServer).toBeLessThan(ADMIN_TOUCH_INTERVAL_MS + 1)
    }
  })
})

describe('appels au serveur', () => {
  beforeEach(() => rpc.mockReset())

  it('état actif lu sur la première ligne', async () => {
    rpc.mockResolvedValue({ data: [{ active: true, remaining_seconds: 542, reason: null }], error: null })
    await expect(callAdminSession('admin_session_touch')).resolves.toEqual({ supported: true, active: true, remainingSeconds: 542, reason: null })
    expect(rpc).toHaveBeenCalledWith('admin_session_touch')
  })

  it('session close', async () => {
    rpc.mockResolvedValue({ data: [{ active: false, remaining_seconds: 0, reason: 'idle_timeout' }], error: null })
    await expect(callAdminSession('admin_session_status')).resolves.toMatchObject({ active: false, reason: 'idle_timeout' })
  })

  it('migration absente (PGRST202) : verrouillage par le navigateur seulement, signalé', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    await expect(callAdminSession('admin_session_begin')).resolves.toMatchObject({ supported: false, active: true })
  })

  it('compte non administrateur : refus explicite', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin_required' } })
    await expect(callAdminSession('admin_session_begin')).rejects.toBeInstanceOf(AdminSessionForbidden)
  })
})

describe('divers', () => {
  it('niveau MFA lu dans le jeton (affichage seulement), entrée invalide tolérée', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(tokenAal(`${b64({ alg: 'ES256' })}.${b64({ aal: 'aal2', session_id: 'x' })}.sig`)).toBe('aal2')
    expect(tokenAal('garbage')).toBeNull()
    expect(tokenAal(undefined)).toBeNull()
  })

  it('sans fournisseur monté, rien à attendre ; avec fournisseur, attente jusqu’à l’ouverture', async () => {
    await expect(whenAdminSessionSettled(10)).resolves.toBeUndefined()
    const unregister = registerAdminSessionProvider()
    let done = false
    const waiting = whenAdminSessionSettled(10_000).then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)
    markAdminSessionSettled()
    await waiting
    expect(done).toBe(true)
    unregister()
  })
})

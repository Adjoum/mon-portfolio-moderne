// Contexte de la session administrateur (fourni par AdminSessionProvider)
import { createContext, useContext } from 'react'
import { ADMIN_IDLE_LIMIT_MS } from '../../lib/adminSession'

export type AdminSessionStatus = 'off' | 'starting' | 'active' | 'warning' | 'locked'
export type LockReason = 'idle_timeout' | 'server' | 'remote' | 'logout'

export interface AdminSessionValue {
  status: AdminSessionStatus
  remainingMs: number
  /** false : migration absente, verrouillage assuré par le navigateur seulement */
  serverEnforced: boolean
  lock: { reason: LockReason; at: number } | null
  startError: string | null
  start(): void
  stayConnected(): Promise<void>
  logout(): Promise<void>
}

export const AdminSessionContext = createContext<AdminSessionValue | null>(null)

const OFF: AdminSessionValue = {
  status: 'off', remainingMs: ADMIN_IDLE_LIMIT_MS, serverEnforced: true, lock: null, startError: null,
  start: () => {}, stayConnected: async () => {}, logout: async () => {},
}
export const useAdminSession = () => useContext(AdminSessionContext) ?? OFF

export const formatRemaining = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function lockMessage(reason: LockReason | undefined): string | undefined {
  if (reason === 'idle_timeout' || reason === 'remote') return 'Session verrouillée après 10 minutes d’inactivité. Reconnectez-vous pour continuer.'
  if (reason === 'server') return 'Session administrateur expirée ou fermée. Reconnectez-vous pour continuer.'
  return undefined
}

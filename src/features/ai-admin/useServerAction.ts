// src/features/ai-admin/useServerAction.ts
import { useCallback, useState } from 'react'

export type Notice = { type: 'success' | 'error'; text: string }

/**
 * Action vers le serveur : un seul message, affiché APRÈS sa réponse. En cas d'échec comme de
 * réussite, la vue est relue depuis le serveur pour afficher l'état réel.
 */
export function useServerAction(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const run = useCallback(async <T,>(id: string, action: () => Promise<T>, success: string | ((result: T) => string)) => {
    setBusy(id)
    setNotice(null)
    try {
      const result = await action()
      await reload().catch(() => {})
      setNotice({ type: 'success', text: typeof success === 'function' ? success(result) : success })
      return result
    } catch (err) {
      await reload().catch(() => {})
      setNotice({ type: 'error', text: (err as Error).message })
      return undefined
    } finally {
      setBusy(null)
    }
  }, [reload])

  return { busy, notice, setNotice, run }
}

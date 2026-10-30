import { useEffect, useState } from 'react'
import { fetchAiAvailability, type AiFeatureId, type AiFeatureStatus } from '../lib/aiClient'

/**
 * Disponibilité des fonctionnalités IA, pour prévenir l'utilisateur AVANT qu'il ne lance
 * une action vouée à l'échec. Tant que la réponse n'est pas arrivée (ou si l'API est
 * injoignable), les fonctions sont supposées disponibles : l'erreur éventuelle sera
 * alors affichée au moment de l'appel, jamais passée sous silence.
 */
export function useAiAvailability() {
  const [statuses, setStatuses] = useState<Record<string, AiFeatureStatus> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAiAvailability().then(result => { if (!cancelled) setStatuses(result) })
    return () => { cancelled = true }
  }, [])

  return (feature: AiFeatureId) => statuses?.[feature]?.available ?? true
}

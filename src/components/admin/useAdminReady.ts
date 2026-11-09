// Administrateur du portfolio prêt (session Supabase, admin_users, MFA aal2) ? Évalué une fois au
// montage ; sans session, aucune requête réseau (session lue dans le stockage du navigateur).
// Affichage seulement : blog-api et la RLS Supabase revérifient chaque écriture.
import { useEffect, useState } from 'react'
import { evaluateAdminAccess } from '../../lib/adminAuth'

export type AdminReadiness = 'checking' | 'ready' | 'denied'

export function useAdminReady(): AdminReadiness {
  const [state, setState] = useState<AdminReadiness>('checking')
  useEffect(() => {
    let alive = true
    evaluateAdminAccess()
      .then(access => { if (alive) setState(access.status === 'ready' ? 'ready' : 'denied') })
      .catch(() => { if (alive) setState('denied') })
    return () => { alive = false }
  }, [])
  return state
}

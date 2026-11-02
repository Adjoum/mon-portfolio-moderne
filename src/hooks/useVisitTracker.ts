import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { looksLikeAdminPath } from '../lib/adminRoute'

/** Provenance de la visite, sauf une page d'administration du site (adresse jamais enregistrée) */
function safeReferrer(): string | null {
  if (!document.referrer) return null
  try {
    const from = new URL(document.referrer)
    if (from.origin === window.location.origin && looksLikeAdminPath(from.pathname)) return null
  } catch {
    return null
  }
  return document.referrer
}

export function useVisitTracker() {
  const location = useLocation()

  useEffect(() => {
    const track = async () => {
      // Jamais l'administration : son adresse ne doit apparaître dans aucun journal.
      // Toute adresse de cette forme est ignorée, sans calcul d'empreinte (src/lib/adminRoute.ts).
      if(looksLikeAdminPath(location.pathname)) return

      // Infos de base disponibles sans API externe
      const payload = {
        page:       location.pathname,
        referrer:   safeReferrer(),
        user_agent: navigator.userAgent,
        language:   navigator.language,
        screen:     `${screen.width}x${screen.height}`,
        country:    null as string | null,
        city:       null as string | null,
      }

      // Géolocalisation via IP (gratuit, sans clé API)
      try {
        const geo = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
        if(geo.ok) {
          const data = await geo.json()
          payload.country = data.country_name || null
          payload.city    = data.city || null
        }
      } catch {
        // silencieux si l'API est indisponible
      }  

      await supabase.from('visits').insert(payload)
    }

    track()
  }, [location.pathname]) // se déclenche à chaque changement de page
}
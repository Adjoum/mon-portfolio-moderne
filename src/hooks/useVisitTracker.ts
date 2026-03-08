import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function useVisitTracker() {
  const location = useLocation()

  useEffect(() => {
    const track = async () => {
      // Éviter de tracker les pages admin
      if(location.pathname.startsWith('/admin')) return

      // Infos de base disponibles sans API externe
      const payload = {
        page:       location.pathname,
        referrer:   document.referrer || null,
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
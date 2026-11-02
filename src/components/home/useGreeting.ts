import { useEffect, useState } from 'react'
import { greetingAt, msUntilNextCheck } from './greeting'

/**
 * Salutation courante, calculée dès le premier rendu : l'application n'a pas de rendu serveur,
 * il n'y a donc aucun texte provisoire à remplacer ni clignotement possible.
 * `changed` passe à vrai quand le créneau change alors que la page est ouverte.
 */
export function useGreeting() {
  const [state, setState] = useState(() => ({ text: greetingAt(new Date()), changed: false }))

  useEffect(() => {
    let timer = 0
    const refresh = () => {
      window.clearTimeout(timer)
      const now = new Date()
      const text = greetingAt(now)
      setState(s => (s.text === text ? s : { text, changed: true }))
      timer = window.setTimeout(refresh, msUntilNextCheck(now))
    }
    // Les minuteurs sont suspendus en veille et ralentis en arrière-plan : vérification au retour
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  return state
}

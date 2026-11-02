import { useEffect } from 'react'

/**
 * Pages hors référencement (administration, 404) : robots « noindex » et, pour l'administration,
 * aucun en-tête Referer. Mesure anti-indexation, pas une protection d'accès.
 * Les balises sont retirées au départ de la page.
 */
export function useNoIndex({ noReferrer = false }: { noReferrer?: boolean } = {}) {
  useEffect(() => {
    const added: HTMLMetaElement[] = []
    const add = (name: string, content: string) => {
      const meta = document.createElement('meta')
      meta.name = name
      meta.content = content
      meta.dataset.noindex = ''
      document.head.appendChild(meta)
      added.push(meta)
    }
    add('robots', 'noindex, nofollow, noarchive')
    if (noReferrer) add('referrer', 'no-referrer')
    return () => added.forEach(meta => meta.remove())
  }, [noReferrer])
}

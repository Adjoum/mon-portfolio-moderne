import { useEffect, useState } from 'react'

export type Viewport = 'mobile' | 'tablet' | 'desktop'

const query = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const current = (): Viewport => (query('(min-width: 1024px)') ? 'desktop' : query('(min-width: 768px)') ? 'tablet' : 'mobile')

/** Smartphone < 768 px ≤ tablette < 1024 px ≤ ordinateur */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(current)
  useEffect(() => {
    const lists = ['(min-width: 1024px)', '(min-width: 768px)'].map(q => window.matchMedia(q))
    const update = () => setViewport(current())
    lists.forEach(l => l.addEventListener('change', update))
    return () => lists.forEach(l => l.removeEventListener('change', update))
  }, [])
  return viewport
}

/** Écran tactile sans pointeur fin : zone de texte plutôt que Monaco */
export const prefersPlainEditor = () => query('(pointer: coarse)') && !query('(pointer: fine)')

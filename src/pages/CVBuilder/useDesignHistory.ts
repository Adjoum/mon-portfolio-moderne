// Annuler / rétablir pour le design et le modèle du CV.
// Les changements rapprochés d'un même réglage (curseur que l'on fait glisser) forment une seule
// étape : « Annuler » revient à la valeur d'avant le geste, pas d'un cran de curseur.
import { useCallback, useRef, useState } from 'react'

export interface DesignHistoryOptions { limit?: number; mergeWithinMs?: number }

export function useDesignHistory<T>(initial: T, { limit = 80, mergeWithinMs = 700 }: DesignHistoryOptions = {}) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] })
  const last = useRef<{ key: string | null; at: number }>({ key: null, at: 0 })

  /** key : réglage modifié (regroupement des changements continus du même réglage) */
  const set = useCallback((next: T | ((prev: T) => T), key: string | null = null) => {
    // Décision de regroupement prise ici, jamais dans la fonction de mise à jour : React peut appeler
    // celle-ci deux fois (mode strict, rendu concurrent) et elle doit rester pure.
    const now = Date.now()
    const mergeCandidate = key !== null && last.current.key === key && now - last.current.at < mergeWithinMs
    last.current = { key, at: now }
    setState(s => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next
      if (Object.is(value, s.present) || JSON.stringify(value) === JSON.stringify(s.present)) return s
      const merge = mergeCandidate && s.past.length > 0
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-limit),
        present: value,
        future: [],
      }
    })
  }, [limit, mergeWithinMs])

  const undo = useCallback(() => {
    last.current = { key: null, at: 0 }
    setState(s => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s))
  }, [])

  const redo = useCallback(() => {
    last.current = { key: null, at: 0 }
    setState(s => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s))
  }, [])

  return { value: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}
